import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fsApi } from "../../lib/fsApi";
import {
  DEFAULT_OLLAMA_HOST,
  fetchOllamaModels,
  formatBytes,
  getOllamaHost,
  pullOllamaModel,
  setOllamaHost,
  streamOllamaChat,
} from "../../lib/ollamaClient";
import { ElectronAPI } from "../../types/electron";

function makeNdjsonResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

describe("fsApi", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete window.electronAPI;
  });

  afterEach(() => {
    delete window.electronAPI;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses HTTP endpoints when running outside Electron", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rootName: "Docs",
            rootPath: "/vault/Docs",
            items: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            note: {
              id: "n-1",
              type: "note",
              title: "Intro",
              content: "Hi",
              updatedAt: "2026-01-01",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: "disk body" }), { status: 200 }),
      );

    globalThis.fetch = fetchMock;

    const scanned = await fsApi.scanFolder("/vault/Docs");
    expect(scanned.rootName).toBe("Docs");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/fs/scan",
      expect.objectContaining({ method: "POST" }),
    );

    const created = await fsApi.createFile("/vault/Docs", "Intro", "Hi");
    expect(created.title).toBe("Intro");

    const content = await fsApi.readFile("/vault/Docs/Intro.md");
    expect(content).toBe("disk body");
  });

  it("delegates directly to window.electronAPI.fs inside Electron", async () => {
    const scanFolder = vi.fn().mockResolvedValue({
      rootName: "ElectronDocs",
      rootPath: "C:/Docs",
      items: [],
    });
    const writeFile = vi
      .fn()
      .mockResolvedValue({ ok: true, path: "C:/Docs/a.md" });

    window.electronAPI = {
      isElectron: true,
      platform: "win32",
      dialog: { selectFolder: vi.fn() },
      fs: {
        scanFolder,
        writeFile,
        createFile: vi.fn(),
        createFolder: vi.fn(),
        renamePath: vi.fn(),
        deletePath: vi.fn(),
        readFile: vi.fn(),
        readDir: vi.fn(),
        getRawUrl: (p: string) => `local-media://${p}`,
      },
      sessions: {
        list: vi.fn(),
        get: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
      },
    } satisfies ElectronAPI;

    const result = await fsApi.scanFolder("C:/Docs");
    expect(result.rootName).toBe("ElectronDocs");
    expect(scanFolder).toHaveBeenCalledWith("C:/Docs");

    await fsApi.writeFile("C:/Docs/a.md", "hello");
    expect(writeFile).toHaveBeenCalledWith("C:/Docs/a.md", "hello");
  });
});

describe("sessionManager & workspaceStorage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete window.electronAPI;
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.resetModules();
  });

  afterEach(() => {
    delete window.electronAPI;
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves session ID from URL params and manages HTTP session CRUD", async () => {
    window.history.replaceState({}, "", "/?session=session-9");
    const { getTabSessionId, getTabSessionName, sessionApi } =
      await import("../../lib/sessionManager");

    expect(getTabSessionId()).toBe("session-9");
    expect(getTabSessionName()).toBe("Session 9");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "session-9",
            name: "Client Alpha",
            createdAt: 1,
            updatedAt: 2,
            payload: "{}",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              id: "session-created",
              name: "New WS",
              createdAt: 10,
              updatedAt: 10,
              payload: "null",
            },
          }),
          { status: 200 },
        ),
      );

    const loaded = await sessionApi.getSession("session-9");
    expect(loaded.name).toBe("Client Alpha");
    expect(getTabSessionName()).toBe("Client Alpha");

    await sessionApi.renameSession("session-9", "Renamed WS");
    expect(getTabSessionName()).toBe("Renamed WS");

    const created = await sessionApi.createSession("New WS");
    expect(created.id).toBe("session-created");
  });

  it("persists workspace payloads to remote session storage with debounce", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    globalThis.fetch = fetchMock;

    const { workspaceStorage } = await import("../../lib/storage");
    await workspaceStorage.setItem(
      "pent-notes-store",
      '{"state":{"folders":[]}}',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/default",
      expect.objectContaining({
        method: "PUT",
      }),
    );

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "default",
          name: "Default",
          updatedAt: Date.now() + 1000,
          payload:
            '{"state":{"folders":[{"id":"f1","name":"Remote","items":[]}]}}',
        }),
        { status: 200 },
      ),
    );

    const raw = await workspaceStorage.getItem("pent-notes-store");
    expect(raw).toContain("Remote");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await workspaceStorage.removeItem("pent-notes-store");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/sessions/default",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("manages desktop sessions via Electron IPC and restores the last active session on restart", async () => {
    const createMock = vi.fn().mockResolvedValue({
      id: "session-new-1",
      name: "Session 2",
      createdAt: 100,
      updatedAt: 100,
      payload: "null",
    });
    const saveMock = vi.fn().mockResolvedValue({ ok: true });
    const deleteMock = vi.fn().mockResolvedValue({ ok: true });
    const openWindowMock = vi
      .fn()
      .mockResolvedValue({ ok: true, sessionId: "session-new-1" });

    window.electronAPI = {
      isElectron: true,
      platform: "win32",
      dialog: { selectFolder: vi.fn() },
      fs: {
        scanFolder: vi.fn(),
        writeFile: vi.fn(),
        createFile: vi.fn(),
        createFolder: vi.fn(),
        renamePath: vi.fn(),
        deletePath: vi.fn(),
        readFile: vi.fn(),
        readDir: vi.fn(),
        getRawUrl: (p: string) => p,
      },
      sessions: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: createMock,
        save: saveMock,
        delete: deleteMock,
        openWindow: openWindowMock,
      },
    };

    localStorage.setItem("pentnotes_last_session", "session-saved-7");
    const { getTabSessionId, sessionApi } =
      await import("../../lib/sessionManager");

    expect(getTabSessionId()).toBe("session-saved-7");

    const created = await sessionApi.createSession();
    expect(created.id).toBe("session-new-1");
    expect(createMock).toHaveBeenCalledWith(undefined, undefined);

    await sessionApi.renameSession("session-saved-7", "Pentest Engagement");
    expect(saveMock).toHaveBeenCalledWith(
      "session-saved-7",
      "Pentest Engagement",
      undefined,
    );

    sessionApi.openSessionInNewTab();
    expect(openWindowMock).toHaveBeenCalledWith(undefined);
    sessionApi.openSessionInNewTab("session-new-1");
    expect(openWindowMock).toHaveBeenCalledWith("session-new-1");

    await sessionApi.deleteSession("session-saved-7");
    expect(deleteMock).toHaveBeenCalledWith("session-saved-7");
    expect(localStorage.getItem("pentnotes_last_session")).toBeNull();
  });

  it("flushes pending workspace writes to the previous session before switching sessions", async () => {
    vi.useFakeTimers();
    const saveMock = vi.fn().mockResolvedValue({ ok: true });
    window.electronAPI = {
      isElectron: true,
      platform: "win32",
      dialog: { selectFolder: vi.fn() },
      fs: {
        scanFolder: vi.fn(),
        writeFile: vi.fn(),
        createFile: vi.fn(),
        createFolder: vi.fn(),
        renamePath: vi.fn(),
        deletePath: vi.fn(),
        readFile: vi.fn(),
        readDir: vi.fn(),
        getRawUrl: (p: string) => p,
      },
      sessions: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({
          id: "session-old",
          name: "Old Workspace",
          createdAt: 1,
          updatedAt: 2,
          payload: "null",
        }),
        save: saveMock,
        delete: vi.fn(),
      },
    };

    window.history.replaceState({}, "", "/?session=session-old");
    const { sessionApi } = await import("../../lib/sessionManager");
    const { workspaceStorage } = await import("../../lib/storage");

    await sessionApi.getSession("session-old");
    await workspaceStorage.setItem(
      "pentnotes-workspace-v1",
      '{"state":{"folders":[{"id":"old-f"}]}}',
    );

    const originalLocation = window.location;
    let navigatedTo = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return navigatedTo || "http://localhost/?session=session-old";
        },
        set href(val: string) {
          navigatedTo = val;
        },
        search: "?session=session-old",
        reload: vi.fn(),
      },
    });

    try {
      sessionApi.switchSessionInCurrentTab("session-new");
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(200);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }

    expect(navigatedTo).toBe("http://localhost/?session=session-new");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(
      "session-old",
      "Old Workspace",
      '{"state":{"folders":[{"id":"old-f"}]}}',
    );
  });
});

describe("ollamaClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete window.electronAPI;
  });

  afterEach(() => {
    delete window.electronAPI;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("formats byte sizes and manages host preferences in localStorage", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");

    expect(getOllamaHost()).toBe(DEFAULT_OLLAMA_HOST);
    setOllamaHost("  http://localhost:11435  ");
    expect(getOllamaHost()).toBe("http://localhost:11435");
  });

  it("fetches models and streams pull/chat responses over HTTP fallback", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        makeNdjsonResponse([
          '{"status":"downloading","completed":50,"total":100}\n',
        ]),
      )
      .mockResolvedValueOnce(
        makeNdjsonResponse([
          '{"message":{"role":"assistant","content":"chunk1"},"done":false}\n',
        ]),
      );

    const models = await fetchOllamaModels("localhost:11434");
    expect(models).toEqual([{ name: "qwen2.5:7b" }]);

    const pullEvents: string[] = [];
    await new Promise<void>((resolve) => {
      pullOllamaModel("http://localhost:11434", "qwen2.5:7b", (evt) => {
        pullEvents.push(evt.status);
        if (evt.status === "success" || evt.status === "error") resolve();
      });
    });
    expect(pullEvents).toEqual(["downloading", "success"]);

    const chatText: string[] = [];
    await new Promise<void>((resolve) => {
      streamOllamaChat(
        "http://localhost:11434",
        "qwen2.5:7b",
        [{ role: "user", content: "hi" }],
        (chunk) => {
          if (chunk.message?.content) chatText.push(chunk.message.content);
          if (chunk.done) resolve();
        },
      );
    });
    expect(chatText).toEqual(["chunk1"]);
  });

  it("uses Electron IPC ollama bridge when available", async () => {
    const abortFn = vi.fn();
    const listModels = vi.fn().mockResolvedValue([{ name: "phi3" }]);
    const chat = vi.fn().mockReturnValue(abortFn);

    window.electronAPI = {
      isElectron: true,
      platform: "win32",
      dialog: { selectFolder: vi.fn() },
      fs: {
        scanFolder: vi.fn(),
        writeFile: vi.fn(),
        createFile: vi.fn(),
        createFolder: vi.fn(),
        renamePath: vi.fn(),
        deletePath: vi.fn(),
        readFile: vi.fn(),
        readDir: vi.fn(),
        getRawUrl: (p: string) => p,
      },
      sessions: {
        list: vi.fn(),
        get: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
      },
      ollama: {
        listModels,
        pullModel: vi.fn(),
        chat,
      },
    };

    const models = await fetchOllamaModels("http://127.0.0.1:11434");
    expect(models).toEqual([{ name: "phi3" }]);

    const onChunk = vi.fn();
    const cancel = streamOllamaChat(
      "http://127.0.0.1:11434",
      "phi3",
      [{ role: "user", content: "ping" }],
      onChunk,
    );
    cancel();
    expect(chat).toHaveBeenCalledWith(
      "http://127.0.0.1:11434",
      { model: "phi3", messages: [{ role: "user", content: "ping" }] },
      onChunk,
    );
    expect(abortFn).toHaveBeenCalledTimes(1);
  });
});
