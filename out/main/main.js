import { BrowserWindow, dialog, protocol, app, net, ipcMain, shell } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";
import fs from "node:fs/promises";
import path from "node:path";
import __shims_module__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __shims_module__.createRequire(import.meta.url);
const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;
const MAX_DIRECTORY_SCAN_DEPTH = 8;
const IGNORED_NAMES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__"
]);
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function stripExt(name) {
  return name.replace(NOTE_EXT_REGEX, "").trim() || "Untitled";
}
async function resolveUniqueChildPath(parentDir, baseName, extension = "") {
  let candidate = path.join(parentDir, `${baseName}${extension}`);
  let counter = 1;
  while (true) {
    try {
      await fs.stat(candidate);
      candidate = path.join(parentDir, `${baseName} (${counter})${extension}`);
      counter++;
    } catch {
      return candidate;
    }
  }
}
async function readDirectoryRecursive(dirPath, depth = 0) {
  if (depth > MAX_DIRECTORY_SCAN_DEPTH) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders = [];
  const notes = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, depth + 1);
      folders.push({
        id: makeId("sub"),
        type: "folder",
        name: entry.name,
        children,
        folderPath: fullPath
      });
    } else if (entry.isFile() && NOTE_EXT_REGEX.test(entry.name)) {
      const isPdf = entry.name.toLowerCase().endsWith(".pdf");
      const [content, stat] = await Promise.all([
        isPdf ? Promise.resolve("") : fs.readFile(fullPath, "utf-8"),
        fs.stat(fullPath)
      ]);
      notes.push({
        id: makeId("note"),
        type: "note",
        title: stripExt(entry.name),
        content,
        updatedAt: stat.mtime.toISOString().slice(0, 10),
        filePath: fullPath,
        fileType: isPdf ? "pdf" : "markdown"
      });
    }
  }
  folders.sort(
    (a, b) => a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" })
  );
  notes.sort(
    (a, b) => a.title.localeCompare(b.title, void 0, { numeric: true, sensitivity: "base" })
  );
  return [...folders, ...notes];
}
async function scanFolder(folderPath) {
  const resolved = path.resolve(folderPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory.");
  }
  const items = await readDirectoryRecursive(resolved);
  const rootName = path.basename(resolved) || "Notes";
  return { rootName, rootPath: resolved, items };
}
async function writeFile(filePath, content) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content ?? "", "utf-8");
  return { ok: true, path: resolved };
}
async function createFile(parentPath, name, content = "") {
  const rawFileName = name && typeof name === "string" ? name.trim() : "Untitled Note";
  const baseName = stripExt(rawFileName);
  const resolvedParent = path.resolve(parentPath);
  await fs.mkdir(resolvedParent, { recursive: true });
  const targetFile = await resolveUniqueChildPath(resolvedParent, baseName, ".md");
  const initialContent = content || "";
  await fs.writeFile(targetFile, initialContent, "utf-8");
  return {
    id: makeId("note"),
    type: "note",
    title: stripExt(path.basename(targetFile)),
    content: initialContent,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    filePath: targetFile
  };
}
async function createFolder(parentPath, name) {
  const folderName = name && typeof name === "string" ? name.trim() : "New Folder";
  const resolvedParent = path.resolve(parentPath);
  const targetDir = await resolveUniqueChildPath(resolvedParent, folderName);
  await fs.mkdir(targetDir, { recursive: true });
  return {
    id: makeId("sub"),
    type: "folder",
    name: path.basename(targetDir),
    children: [],
    folderPath: targetDir
  };
}
async function renamePath(oldPath, newPath) {
  const resolvedOld = path.resolve(oldPath);
  const resolvedNew = path.resolve(newPath);
  await fs.rename(resolvedOld, resolvedNew);
  return resolvedNew;
}
async function deletePath(targetPath) {
  const resolved = path.resolve(targetPath);
  await fs.rm(resolved, { recursive: true, force: true });
  return { ok: true };
}
const DATA_DIR = path.resolve("data");
const STATE_FILE = path.join(DATA_DIR, "workspace.json");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
async function writeFileAtomic(targetPath, content) {
  const tempFile = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  try {
    await fs.writeFile(tempFile, content, "utf-8");
    await fs.rename(tempFile, targetPath);
  } catch {
    try {
      await fs.writeFile(targetPath, content, "utf-8");
    } catch (err) {
      throw err;
    }
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
    }
  }
}
function extractCounts(payloadStr) {
  try {
    let countNotes = function(items) {
      for (const item of items) {
        if (item.type === "note") noteCount++;
        if (item.type === "folder" && Array.isArray(item.children)) {
          countNotes(item.children);
        }
      }
    };
    const parsed = typeof payloadStr === "string" ? JSON.parse(payloadStr) : payloadStr;
    const state = parsed.state || parsed;
    const folders = Array.isArray(state.folders) ? state.folders : [];
    let noteCount = 0;
    for (const folder of folders) {
      if (Array.isArray(folder.items)) countNotes(folder.items);
    }
    return { folderCount: folders.length, noteCount };
  } catch {
    return { folderCount: 0, noteCount: 0 };
  }
}
async function ensureSessionsDir() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const defaultPath = path.join(SESSIONS_DIR, "default.json");
  try {
    await fs.stat(defaultPath);
  } catch {
    let initialPayload = "null";
    try {
      const rawWorkspace = await fs.readFile(STATE_FILE, "utf-8");
      const parsed = JSON.parse(rawWorkspace);
      initialPayload = parsed && typeof parsed.payload === "string" ? parsed.payload : rawWorkspace;
    } catch {
    }
    const defaultSession = {
      id: "default",
      name: "Default Workspace",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: initialPayload
    };
    await fs.writeFile(defaultPath, JSON.stringify(defaultSession, null, 2), "utf-8");
  }
}
async function listAllSessions() {
  await ensureSessionsDir();
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const full = path.join(SESSIONS_DIR, entry.name);
        const raw = await fs.readFile(full, "utf-8");
        const data = JSON.parse(raw);
        const { folderCount, noteCount } = extractCounts(data.payload);
        results.push({
          id: data.id || entry.name.replace(/\.json$/, ""),
          name: data.name || "Untitled Session",
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt || 0,
          folderCount,
          noteCount
        });
      } catch {
      }
    }
  }
  results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return results;
}
async function readSessionPayloadIfExists(sessionId) {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), "utf-8");
    const data = JSON.parse(raw);
    return typeof data.payload === "string" ? data.payload : null;
  } catch {
    return null;
  }
}
async function getOrSeedSession(sessionId, suggestedName, cloneFromId) {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    let payload = cloneFromId && await readSessionPayloadIfExists(cloneFromId) || "null";
    if (payload === "null") {
      const defaultPayload = await readSessionPayloadIfExists("default");
      if (defaultPayload) {
        payload = defaultPayload;
      } else {
        try {
          const rawWs = await fs.readFile(STATE_FILE, "utf-8");
          const parsed = JSON.parse(rawWs);
          payload = parsed.payload || rawWs;
        } catch {
        }
      }
    }
    const existing = await listAllSessions();
    const sessionName = suggestedName || `Session ${existing.length + 1}`;
    const newSession = {
      id: sessionId,
      name: sessionName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload
    };
    await fs.writeFile(filePath, JSON.stringify(newSession, null, 2), "utf-8");
    return newSession;
  }
}
async function saveSession(sessionId, name, payload) {
  await ensureSessionsDir();
  const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  let existing = null;
  try {
    const rawExisting = await fs.readFile(sessionPath, "utf-8");
    existing = JSON.parse(rawExisting);
  } catch {
  }
  const sessionName = typeof name === "string" && name.trim() ? name.trim() : existing?.name || "Session";
  const sessionPayload = typeof payload === "string" ? payload : payload !== void 0 ? JSON.stringify(payload) : existing?.payload || "null";
  const updated = {
    id: sessionId,
    name: sessionName,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    payload: sessionPayload
  };
  await writeFileAtomic(sessionPath, JSON.stringify(updated, null, 2));
  if (sessionId === "default") {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      STATE_FILE,
      JSON.stringify({ savedAt: updated.updatedAt, payload: updated.payload }),
      "utf-8"
    ).catch(() => {
    });
  }
  return { ok: true, session: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt } };
}
async function deleteSession(sessionId) {
  const list = await listAllSessions();
  if (list.length <= 1) {
    throw new Error("Cannot delete the only remaining session.");
  }
  const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  await fs.unlink(sessionPath).catch(() => {
  });
  return { ok: true };
}
async function getWorkspaceState() {
  try {
    return await fs.readFile(STATE_FILE, "utf-8");
  } catch {
    return "null";
  }
}
async function saveWorkspaceState(rawJson) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeFileAtomic(STATE_FILE, rawJson);
  return { ok: true };
}
async function selectFolder(senderWebContents) {
  const window = senderWebContents ? BrowserWindow.fromWebContents(senderWebContents) : null;
  const result = await dialog.showOpenDialog(window || void 0, {
    title: "Select Folder",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "pent-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
]);
function registerIpcHandlers() {
  ipcMain.handle("fs:scan", async (_, folderPath) => {
    return await scanFolder(folderPath);
  });
  ipcMain.handle("fs:write-file", async (_, filePath, content) => {
    return await writeFile(filePath, content);
  });
  ipcMain.handle("fs:create-file", async (_, parentPath, name, content) => {
    return await createFile(parentPath, name, content);
  });
  ipcMain.handle("fs:create-folder", async (_, parentPath, name) => {
    return await createFolder(parentPath, name);
  });
  ipcMain.handle("fs:rename", async (_, oldPath, newPath) => {
    return await renamePath(oldPath, newPath);
  });
  ipcMain.handle("fs:delete", async (_, targetPath) => {
    return await deletePath(targetPath);
  });
  ipcMain.handle("sessions:list", async () => {
    return await listAllSessions();
  });
  ipcMain.handle("sessions:get", async (_, sessionId) => {
    return await getOrSeedSession(sessionId);
  });
  ipcMain.handle("sessions:save", async (_, sessionId, name, payload) => {
    return await saveSession(sessionId, name, payload);
  });
  ipcMain.handle("sessions:delete", async (_, sessionId) => {
    return await deleteSession(sessionId);
  });
  ipcMain.handle("state:get", async () => {
    return await getWorkspaceState();
  });
  ipcMain.handle("state:save", async (_, rawJson) => {
    return await saveWorkspaceState(rawJson);
  });
  ipcMain.handle("dialog:select-folder", async (event) => {
    return await selectFolder(event.sender);
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
}
function createWindow() {
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "PentNotes",
    autoHideMenuBar: true,
    ...isWindows || isMac ? {
      titleBarStyle: isMac ? "hiddenInset" : "hidden",
      ...isWindows ? {
        titleBarOverlay: {
          color: "#161b25",
          symbolColor: "#f8fafc",
          height: 38
        }
      } : {},
      ...isMac ? {
        trafficLightPosition: { x: 14, y: 12 }
      } : {}
    } : {},
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith("http://") || details.url.startsWith("https://")) {
      shell.openExternal(details.url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  protocol.handle("pent-file", (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.searchParams.get("path");
      if (!filePath) {
        return new Response("Missing file path", { status: 400 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response(err instanceof Error ? err.message : "Failed to load file", {
        status: 500
      });
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
