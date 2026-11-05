import { app, BrowserWindow, dialog, protocol, net, ipcMain, shell } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";
import fs from "node:fs/promises";
import path from "node:path";
import __shims_module__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __shims_module__.createRequire(import.meta.url);
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
class LinkIndexService {
  constructor() {
    this.indexPath = null;
    this.index = {
      // sourcePath -> Array of target titles
      outgoing: {},
      // targetTitle (lowercase) -> Array of sourcePaths
      incoming: {}
    };
    this.saveTimer = null;
    this.isLoaded = false;
  }
  getStoragePath() {
    if (!this.indexPath) {
      const userData = app?.getPath("userData") || process.cwd();
      this.indexPath = path.join(userData, "link-index.json");
    }
    return this.indexPath;
  }
  async loadIndex() {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(this.getStoragePath(), "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        this.index = {
          outgoing: parsed.outgoing || {},
          incoming: parsed.incoming || {}
        };
      }
    } catch {
      this.index = { outgoing: {}, incoming: {} };
    }
    this.isLoaded = true;
  }
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        const dest = this.getStoragePath();
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(this.index), "utf-8");
      } catch (err) {
        console.error("Failed to save link index to disk:", err);
      }
    }, 500);
  }
  async updateFileLinks(filePath, content) {
    await this.loadIndex();
    const resolvedPath = path.resolve(filePath);
    const oldTargets = this.index.outgoing[resolvedPath] || [];
    for (const oldT of oldTargets) {
      const key = oldT.toLowerCase();
      if (this.index.incoming[key]) {
        this.index.incoming[key] = this.index.incoming[key].filter(
          (p) => p !== resolvedPath
        );
        if (this.index.incoming[key].length === 0) {
          delete this.index.incoming[key];
        }
      }
    }
    const newTargets = [];
    if (content && typeof content === "string") {
      let match;
      WIKILINK_REGEX.lastIndex = 0;
      while ((match = WIKILINK_REGEX.exec(content)) !== null) {
        const targetTitle = match[1].trim();
        if (targetTitle && !newTargets.includes(targetTitle)) {
          newTargets.push(targetTitle);
        }
      }
    }
    if (newTargets.length > 0) {
      this.index.outgoing[resolvedPath] = newTargets;
      for (const target of newTargets) {
        const key = target.toLowerCase();
        if (!this.index.incoming[key]) {
          this.index.incoming[key] = [];
        }
        if (!this.index.incoming[key].includes(resolvedPath)) {
          this.index.incoming[key].push(resolvedPath);
        }
      }
    } else {
      delete this.index.outgoing[resolvedPath];
    }
    this.scheduleSave();
  }
  async removeFile(filePath) {
    await this.loadIndex();
    const resolvedPath = path.resolve(filePath);
    await this.updateFileLinks(resolvedPath, "");
  }
  async renameFile(oldPath, newPath) {
    await this.loadIndex();
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    const targets = this.index.outgoing[resolvedOld] || [];
    delete this.index.outgoing[resolvedOld];
    if (targets.length > 0) {
      this.index.outgoing[resolvedNew] = targets;
    }
    for (const key of Object.keys(this.index.incoming)) {
      this.index.incoming[key] = this.index.incoming[key].map(
        (p) => p === resolvedOld ? resolvedNew : p
      );
    }
    this.scheduleSave();
  }
  async getConnections(filePath, noteTitle) {
    await this.loadIndex();
    const resolvedPath = filePath ? path.resolve(filePath) : null;
    const outgoing = resolvedPath ? this.index.outgoing[resolvedPath] || [] : [];
    const titleKey = noteTitle ? noteTitle.trim().toLowerCase() : null;
    const incoming = titleKey ? this.index.incoming[titleKey] || [] : [];
    return {
      outgoing,
      incoming
    };
  }
}
const linkIndexService = new LinkIndexService();
const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;
const STRICT_IGNORE_NAMES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__",
  ".svn",
  ".hg"
]);
const STRICT_IGNORE_EXTENSIONS = /* @__PURE__ */ new Set([
  "zip",
  "tar",
  "gz",
  "iso",
  "pcap",
  "exe",
  "bin",
  "7z",
  "rar",
  "dmg",
  "pkg"
]);
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function stripExt(name) {
  return name.replace(NOTE_EXT_REGEX, "").trim() || "Untitled";
}
function isStrictlyIgnored(name) {
  if (name.startsWith(".") || STRICT_IGNORE_NAMES.has(name)) return true;
  const ext = path.extname(name).slice(1).toLowerCase();
  if (STRICT_IGNORE_EXTENSIONS.has(ext)) return true;
  return false;
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
async function readDirectoryShallow(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders = [];
  const notes = [];
  for (const entry of entries) {
    if (isStrictlyIgnored(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      let hasChildren = false;
      try {
        const subEntries = await fs.readdir(fullPath);
        hasChildren = subEntries.some((name) => !isStrictlyIgnored(name));
      } catch {
        hasChildren = false;
      }
      folders.push({
        id: makeId("sub"),
        type: "folder",
        name: entry.name,
        hasChildren,
        children: [],
        folderPath: fullPath
      });
    } else if (entry.isFile() && NOTE_EXT_REGEX.test(entry.name)) {
      const isPdf = entry.name.toLowerCase().endsWith(".pdf");
      try {
        const stat = await fs.stat(fullPath);
        notes.push({
          id: makeId("note"),
          type: "note",
          title: stripExt(entry.name),
          content: "",
          // Lazy: Content read on demand via readFile()
          updatedAt: stat.mtime.toISOString().slice(0, 10),
          filePath: fullPath,
          fileType: isPdf ? "pdf" : "markdown"
        });
      } catch {
      }
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
  const items = await readDirectoryShallow(resolved);
  const rootName = path.basename(resolved) || "Notes";
  return { rootName, rootPath: resolved, items };
}
async function readFile(filePath) {
  const resolved = path.resolve(filePath);
  const content = await fs.readFile(resolved, "utf-8");
  return content;
}
async function writeFile(filePath, content) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content ?? "", "utf-8");
  void linkIndexService.updateFileLinks(resolved, content);
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
  void linkIndexService.updateFileLinks(targetFile, initialContent);
  return {
    id: makeId("note"),
    type: "note",
    title: stripExt(path.basename(targetFile)),
    content: initialContent,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    filePath: targetFile,
    fileType: "markdown"
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
    hasChildren: false,
    children: [],
    folderPath: targetDir
  };
}
async function renamePath(oldPath, newPath) {
  const resolvedOld = path.resolve(oldPath);
  const resolvedNew = path.resolve(newPath);
  await fs.rename(resolvedOld, resolvedNew);
  void linkIndexService.renameFile(resolvedOld, resolvedNew);
  return resolvedNew;
}
async function deletePath(targetPath) {
  const resolved = path.resolve(targetPath);
  await fs.rm(resolved, { recursive: true, force: true });
  void linkIndexService.removeFile(resolved);
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
  ipcMain.handle("fs:read-file", async (_, filePath) => {
    return await readFile(filePath);
  });
  ipcMain.handle("fs:read-dir", async (_, dirPath) => {
    return await readDirectoryShallow(dirPath);
  });
  ipcMain.handle("links:get-connections", async (_, filePath, noteTitle) => {
    return await linkIndexService.getConnections(filePath, noteTitle);
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
  mainWindow.webContents.on("console-message", (_, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Fail Load] ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("renderer-process-limit", "2");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("disable-component-update");
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
