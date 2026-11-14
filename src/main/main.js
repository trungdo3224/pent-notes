import { app, BrowserWindow, protocol, net, ipcMain, shell } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import * as fsService from "./services/fsService.js";
import * as sessionService from "./services/sessionService.js";
import * as dialogService from "./services/dialogService.js";
import * as ollamaService from "./services/ollamaService.js";

// Register custom protocol privilege before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "pent-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function registerAbortableStreamIpc({
  startChannel,
  abortChannel,
  eventChannelPrefix,
  startStream,
  isTerminal,
}) {
  const activeStreams = new Map();

  ipcMain.on(startChannel, (event, payload) => {
    const { reqId } = payload;
    if (activeStreams.has(reqId)) {
      activeStreams.get(reqId)();
    }
    const abort = startStream(payload, (chunk) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`${eventChannelPrefix}:${reqId}`, chunk);
      }
      if (isTerminal(chunk)) {
        activeStreams.delete(reqId);
      }
    });
    activeStreams.set(reqId, abort);
  });

  ipcMain.on(abortChannel, (_, { reqId }) => {
    const abort = activeStreams.get(reqId);
    if (abort) {
      abort();
      activeStreams.delete(reqId);
    }
  });
}

function registerIpcHandlers() {
  // Filesystem handlers
  ipcMain.handle("fs:scan", async (_, folderPath) => {
    return await fsService.scanFolder(folderPath);
  });

  ipcMain.handle("fs:write-file", async (_, filePath, content) => {
    return await fsService.writeFile(filePath, content);
  });

  ipcMain.handle("fs:create-file", async (_, parentPath, name, content) => {
    return await fsService.createFile(parentPath, name, content);
  });

  ipcMain.handle("fs:create-folder", async (_, parentPath, name) => {
    return await fsService.createFolder(parentPath, name);
  });

  ipcMain.handle("fs:rename", async (_, oldPath, newPath) => {
    return await fsService.renamePath(oldPath, newPath);
  });

  ipcMain.handle("fs:delete", async (_, targetPath) => {
    return await fsService.deletePath(targetPath);
  });

  ipcMain.handle("fs:read-file", async (_, filePath) => {
    return await fsService.readFile(filePath);
  });

  ipcMain.handle("fs:read-dir", async (_, dirPath) => {
    return await fsService.readDirectoryShallow(dirPath);
  });

  ipcMain.handle(
    "fs:save-image",
    async (_, parentDir, fileName, base64Data) => {
      return await fsService.saveImage(parentDir, fileName, base64Data);
    },
  );

  // Sessions handlers
  ipcMain.handle("sessions:list", async () => {
    return await sessionService.listAllSessions();
  });

  ipcMain.handle("sessions:get", async (_, sessionId) => {
    return await sessionService.getOrSeedSession(sessionId);
  });

  ipcMain.handle("sessions:create", async (_, { name, cloneFromId } = {}) => {
    return await sessionService.createSession(name, cloneFromId);
  });

  ipcMain.handle("sessions:save", async (_, sessionId, name, payload) => {
    return await sessionService.saveSession(sessionId, name, payload);
  });

  ipcMain.handle("sessions:delete", async (_, sessionId) => {
    return await sessionService.deleteSession(sessionId);
  });

  ipcMain.handle("sessions:open-window", async (_, sessionId) => {
    let targetId =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : null;
    if (!targetId || targetId === "new") {
      const created = await sessionService.createSession();
      targetId = created.id;
    }
    createWindow(targetId);
    return { ok: true, sessionId: targetId };
  });

  // Native Dialog handlers
  ipcMain.handle("dialog:select-folder", async (event) => {
    return await dialogService.selectFolder(event.sender);
  });

  ipcMain.handle("window:setTitleBarOverlay", (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && typeof win.setTitleBarOverlay === "function") {
      try {
        win.setTitleBarOverlay(options);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  });

  // Ollama AI Assistant handlers
  ipcMain.handle("ollama:list-models", async (_, host) => {
    return await ollamaService.listModels(host);
  });

  ipcMain.handle(
    "ollama:search-web",
    async (_, { query, apiKey, maxResults } = {}) => {
      return await ollamaService.searchWeb(query, { apiKey, maxResults });
    },
  );

  registerAbortableStreamIpc({
    startChannel: "ollama:pull-start",
    abortChannel: "ollama:pull-abort",
    eventChannelPrefix: "ollama:pull-progress",
    startStream: ({ host, modelName }, send) =>
      ollamaService.pullModel(host, modelName, send),
    isTerminal: (progress) =>
      progress.status === "success" ||
      progress.status === "error" ||
      progress.status === "aborted",
  });

  registerAbortableStreamIpc({
    startChannel: "ollama:chat-start",
    abortChannel: "ollama:chat-abort",
    eventChannelPrefix: "ollama:chat-chunk",
    startStream: ({ host, model, messages }, send) =>
      ollamaService.chatStream(host, { model, messages }, send),
    isTerminal: (chunk) => Boolean(chunk.done || chunk.error),
  });
}

function getAppIconPath() {
  const isWin = process.platform === "win32";
  const iconName = isWin ? "icon.ico" : "icon.png";
  const candidates = [
    join(__dirname, "../../resources", iconName),
    join(__dirname, "../../resources/icon.png"),
    join(app.getAppPath(), "resources", iconName),
    join(app.getAppPath(), "resources/icon.png"),
    join(process.resourcesPath, "resources", iconName),
    join(process.resourcesPath, iconName),
    join(process.resourcesPath, "icon.png"),
    join(__dirname, "../renderer/icon.png"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isInternalAppUrl(targetUrl) {
  if (targetUrl.startsWith("file://")) {
    return true;
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      return (
        new URL(targetUrl).origin ===
        new URL(process.env.ELECTRON_RENDERER_URL).origin
      );
    } catch {
      return false;
    }
  }
  return false;
}

function createWindow(sessionId) {
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const appIcon = getAppIconPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "PentNotes",
    ...(appIcon ? { icon: appIcon } : {}),
    autoHideMenuBar: true,
    ...(isWindows || isMac
      ? {
          titleBarStyle: isMac ? "hiddenInset" : "hidden",
          ...(isWindows
            ? {
                titleBarOverlay: {
                  color: "#161b25",
                  symbolColor: "#f8fafc",
                  height: 38,
                },
              }
            : {}),
          ...(isMac
            ? {
                trafficLightPosition: { x: 14, y: 12 },
              }
            : {}),
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Route internal session links to configured BrowserWindows; open external links in OS browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isInternalAppUrl(details.url)) {
      try {
        const parsed = new URL(details.url);
        const requestedSession = parsed.searchParams.get("session");
        if (requestedSession === "new" || !requestedSession) {
          void sessionService.createSession().then((created) => {
            createWindow(created.id);
          });
        } else {
          createWindow(requestedSession);
        }
      } catch {
        createWindow();
      }
      return { action: "deny" };
    }
    if (
      details.url.startsWith("http://") ||
      details.url.startsWith("https://")
    ) {
      shell.openExternal(details.url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on(
    "console-message",
    (_, level, message, line, sourceId) => {
      console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
    },
  );
  mainWindow.webContents.on(
    "did-fail-load",
    (_, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer Fail Load] ${errorCode} - ${errorDescription} at ${validatedURL}`,
      );
    },
  );

  // In development, load the Vite dev server URL automatically injected by electron-vite
  if (process.env.ELECTRON_RENDERER_URL) {
    const targetUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    if (sessionId) {
      targetUrl.searchParams.set("session", sessionId);
    }
    mainWindow.loadURL(targetUrl.toString());
  } else {
    // In production, load the built HTML
    mainWindow.loadFile(
      join(__dirname, "../renderer/index.html"),
      sessionId ? { query: { session: sessionId } } : undefined,
    );
  }
}

// RFC-042 Pillar 4: Chromium process optimization
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("renderer-process-limit", "2");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("disable-component-update");

app.whenReady().then(() => {
  if (app.isPackaged && !process.env.PENTNOTES_DATA_DIR) {
    sessionService.setDataDir(join(app.getPath("userData"), "data"));
  }

  if (process.platform === "win32") {
    app.setAppUserModelId("com.pentnotes.app");
  }

  // Register custom protocol for local raw files (PDFs, images)
  protocol.handle("pent-file", async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.searchParams.get("path");
      if (!filePath) {
        return new Response("Missing file path", { status: 400 });
      }
      const resolvedPath = await fsService.resolveLocalMediaPath(filePath);
      if (!resolvedPath) {
        return new Response("File not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(resolvedPath).toString());
    } catch (err) {
      return new Response(
        err instanceof Error ? err.message : "Failed to load file",
        {
          status: 500,
        },
      );
    }
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
