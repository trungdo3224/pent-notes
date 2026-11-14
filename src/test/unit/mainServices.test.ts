// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createFile,
  createFolder,
  deletePath,
  readDirectoryShallow,
  readFile,
  renamePath,
  resolveLocalMediaPath,
  saveImage,
  scanFolder,
  writeFile,
} from "../../main/services/fsService.js";
import {
  chatStream,
  listModels,
  pullModel,
  searchWeb,
} from "../../main/services/ollamaService.js";

function createNdjsonStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

describe("fsService", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pentnotes-fs-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates unique markdown/code files and folders, reads/writes content, and scans shallowly", async () => {
    const sub = await createFolder(tempDir, "Recon");
    expect(sub.name).toBe("Recon");
    expect(sub.hasChildren).toBe(false);

    const md1 = await createFile(sub.folderPath!, "Enum Notes", "# Step 1");
    const md2 = await createFile(sub.folderPath!, "Enum Notes", "# Step 2");
    expect(md1.title).toBe("Enum Notes");
    expect(md2.title).toBe("Enum Notes (1)");
    expect(md1.fileType).toBe("markdown");

    const pyFile = await createFile(sub.folderPath!, "scanner.py", "print(1)");
    expect(pyFile.fileType).toBe("code");
    expect(pyFile.title).toBe("scanner.py");

    await writeFile(md1.filePath!, "# Updated Step 1");
    expect(await readFile(md1.filePath!)).toBe("# Updated Step 1");

    await fs.mkdir(path.join(sub.folderPath!, "node_modules"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(sub.folderPath!, "node_modules", "ignored.js"),
      "x",
    );
    await fs.writeFile(path.join(sub.folderPath!, ".env"), "API_KEY=demo\n");
    await fs.writeFile(path.join(sub.folderPath!, "bundle.zip"), "PK");

    const entries = await readDirectoryShallow(sub.folderPath!);
    const names = entries.map((e) => (e.type === "folder" ? e.name : e.title));
    expect(names).toContain(".env");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain("bundle.zip");

    const scanned = await scanFolder(tempDir);
    expect(scanned.rootPath).toBe(path.resolve(tempDir));
    const reconFolder = scanned.items.find(
      (i) => i.type === "folder" && i.name === "Recon",
    );
    expect(reconFolder).toMatchObject({
      type: "folder",
      hasChildren: true,
    });
  });

  it("renames, deletes, saves images, and resolves fallback media paths", async () => {
    const folder = await createFolder(tempDir, "MediaTarget");
    const note = await createFile(folder.folderPath!, "HostNote", "body");
    const assetsSaved = await saveImage(
      folder.folderPath!,
      "screenshot.png",
      Buffer.from("pngdata").toString("base64"),
    );
    expect(assetsSaved.ok).toBe(true);
    expect(assetsSaved.relativePath).toBe("./assets/screenshot.png");

    // Fallback search locates asset stored in adjacent assets/ directory
    const missingDirectPath = path.join(
      folder.folderPath!,
      "sub",
      "screenshot.png",
    );
    const resolved = await resolveLocalMediaPath(missingDirectPath);
    expect(resolved).toBe(assetsSaved.absolutePath);

    const renamedPath = await renamePath(
      note.filePath!,
      path.join(folder.folderPath!, "RenamedNote.md"),
    );
    expect(path.basename(renamedPath)).toBe("RenamedNote.md");

    await deletePath(renamedPath);
    await expect(readFile(renamedPath)).rejects.toThrow();
  });
});

describe("sessionService", () => {
  let sessionTmpRoot: string;
  let origCwd: string;
  let sessionService: typeof import("../../main/services/sessionService.js");

  beforeAll(async () => {
    origCwd = process.cwd();
    sessionTmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pentnotes-sessions-test-"),
    );
    process.chdir(sessionTmpRoot);
    sessionService = await import("../../main/services/sessionService.js");
  });

  afterAll(async () => {
    process.chdir(origCwd);
    await fs.rm(sessionTmpRoot, { recursive: true, force: true });
  });

  it("seeds default session, saves workspace payloads with folder/note counts, clones, and protects last session", async () => {
    await sessionService.ensureSessionsDir();

    const samplePayload = JSON.stringify({
      state: {
        folders: [
          {
            id: "top-1",
            name: "Engagement",
            items: [
              { id: "n1", type: "note", title: "Scope", content: "" },
              {
                id: "f1",
                type: "folder",
                name: "Sub",
                children: [
                  { id: "n2", type: "note", title: "Creds", content: "" },
                ],
              },
            ],
          },
        ],
      },
    });

    await sessionService.saveSession("default", "Primary", samplePayload);
    const cloned = await sessionService.getOrSeedSession(
      "session-clone",
      "Red Team",
      "default",
    );
    expect(cloned.name).toBe("Red Team");
    expect(cloned.payload).toBe(samplePayload);

    const list = await sessionService.listAllSessions();
    expect(list).toHaveLength(2);
    const defaultSummary = list.find((s) => s.id === "default");
    expect(defaultSummary).toMatchObject({
      folderCount: 1,
      noteCount: 2,
    });

    await sessionService.deleteSession("session-clone");
    await expect(sessionService.deleteSession("default")).rejects.toThrow(
      "Cannot delete the only remaining session.",
    );
  });
});

describe("ollamaService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists models and parses streamed NDJSON chunks across split boundaries", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ models: [{ name: "llama3:8b", size: 1024 }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        createNdjsonStreamResponse([
          '{"message":{"role":"assistant","content":"Hel',
          'lo"},"done":false}\n{"message":{"role":"assistant","content":" world"},"done":false}\n',
        ]),
      );

    const models = await listModels("127.0.0.1:11434");
    expect(models).toEqual([{ name: "llama3:8b", size: 1024 }]);

    const chunks: Array<{ content?: string; done?: boolean }> = [];
    await new Promise<void>((resolve) => {
      chatStream(
        "http://127.0.0.1:11434",
        { model: "llama3:8b", messages: [{ role: "user", content: "Hi" }] },
        (chunk) => {
          chunks.push({
            content: chunk.message?.content,
            done: chunk.done,
          });
          if (chunk.done) resolve();
        },
      );
    });

    expect(
      chunks
        .map((c) => c.content)
        .filter(Boolean)
        .join(""),
    ).toBe("Hello world");
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it("surfaces HTTP errors and stream JSON error payloads in pullModel and supports abort", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        createNdjsonStreamResponse([
          '{"status":"pulling manifest"}\n',
          '{"error":"model not found"}\n',
        ]),
      );

    const events: Array<{ status?: string; error?: string }> = [];
    await new Promise<void>((resolve) => {
      pullModel("http://127.0.0.1:11434", "missing-model", (evt) => {
        events.push(evt);
        if (evt.status === "error" || evt.status === "success") resolve();
      });
    });

    expect(events).toEqual([
      { status: "pulling manifest" },
      { status: "error", error: "model not found" },
    ]);

    globalThis.fetch = vi
      .fn()
      .mockImplementation((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

    const abortedChunk = await new Promise<{
      aborted?: boolean;
      done?: boolean;
    }>((resolve) => {
      const abort = chatStream(
        "http://127.0.0.1:11434",
        { model: "llama3", messages: [] },
        (chunk) => {
          if (chunk.aborted || chunk.done) resolve(chunk);
        },
      );
      abort();
    });
    expect(abortedChunk.aborted).toBe(true);
    expect(abortedChunk.done).toBe(true);
  });

  it("parses Ollama web search results cleanly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "CVE Advisory",
              url: "https://example.com/advisory",
              content: "Details here",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchWeb("CVE example", {
      apiKey: "test-key",
      maxResults: 3,
    });
    expect(results).toEqual([
      {
        title: "CVE Advisory",
        url: "https://example.com/advisory",
        snippet: "Details here",
      },
    ]);
  });
});
