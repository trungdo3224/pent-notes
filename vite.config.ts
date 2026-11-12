import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

interface ImportedNote {
  id: string;
  type: "note";
  title: string;
  content: string;
  updatedAt: string;
  filePath?: string;
  fileType?: "markdown" | "pdf" | "image" | "code";
}

interface ImportedFolder {
  id: string;
  type: "folder";
  name: string;
  hasChildren?: boolean;
  children: Array<ImportedFolder | ImportedNote>;
  folderPath?: string;
}

type ImportedNode = ImportedFolder | ImportedNote;

interface StoredSessionFile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: string;
}

interface SessionMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  folderCount: number;
  noteCount: number;
}

interface StoredTreeItem {
  type?: string;
  children?: StoredTreeItem[];
  items?: StoredTreeItem[];
}

const NOTE_EXT_REGEX =
  /\.(md|markdown|mdx|txt|pdf|png|jpe?g|gif|webp|svg|bmp|ico|avif|py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const CODE_EXT_REGEX =
  /\.(py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;

const COMMON_DOTFILES = new Set([
  ".env",
  ".env.local",
  ".env.example",
  ".gitignore",
  ".bashrc",
  ".zshrc",
]);

const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__",
  ".svn",
  ".hg",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

const ATTACHMENT_SUBDIRS = ["images", "assets", "attachments"];

async function isExistingFile(candidatePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidatePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function isExistingDirectory(candidatePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidatePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveLocalMediaPath(rawPath: string): Promise<string | null> {
  const candidates = [rawPath];
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded !== rawPath) candidates.push(decoded);
  } catch {
    // Ignore malformed URI sequences
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await isExistingFile(resolved)) {
      return resolved;
    }
  }

  const primaryResolved = path.resolve(candidates[candidates.length - 1]);
  const fileName = path.basename(primaryResolved);
  if (!fileName) return null;

  let currentDir = path.dirname(primaryResolved);
  while (currentDir && !(await isExistingDirectory(currentDir))) {
    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }

  let searchDir = currentDir;
  for (let depth = 0; depth < 3 && searchDir; depth++) {
    const directCandidate = path.join(searchDir, fileName);
    if (await isExistingFile(directCandidate)) {
      return directCandidate;
    }

    for (const subDir of ATTACHMENT_SUBDIRS) {
      const subCandidate = path.join(searchDir, subDir, fileName);
      if (await isExistingFile(subCandidate)) {
        return subCandidate;
      }
    }

    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }

  return null;
}

const DATA_DIR = path.resolve("data");
const STATE_FILE = path.join(DATA_DIR, "workspace.json");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  noStore = false,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (noStore) {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(payload));
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  err: unknown,
  fallbackMessage: string,
): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  sendJson(res, statusCode, { error: message });
}

async function writeFileAtomic(
  targetPath: string,
  content: string,
): Promise<void> {
  const tempFile = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  try {
    await fs.writeFile(tempFile, content, "utf-8");
    await fs.rename(tempFile, targetPath);
  } catch {
    // Windows file rename fallback if destination was briefly locked
    try {
      await fs.writeFile(targetPath, content, "utf-8");
    } catch (err) {
      throw err;
    }
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignored if already renamed or unlinked
    }
  }
}

function extractCounts(payloadStr: string): {
  folderCount: number;
  noteCount: number;
} {
  try {
    const parsed =
      typeof payloadStr === "string" ? JSON.parse(payloadStr) : payloadStr;
    const state = parsed.state || parsed;
    const folders: StoredTreeItem[] = Array.isArray(state.folders)
      ? state.folders
      : [];
    let noteCount = 0;

    function countNotes(items: StoredTreeItem[]) {
      for (const item of items) {
        if (item.type === "note") noteCount++;
        if (item.type === "folder" && Array.isArray(item.children)) {
          countNotes(item.children);
        }
      }
    }

    for (const folder of folders) {
      if (Array.isArray(folder.items)) countNotes(folder.items);
    }
    return { folderCount: folders.length, noteCount };
  } catch {
    return { folderCount: 0, noteCount: 0 };
  }
}

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  const defaultPath = path.join(SESSIONS_DIR, "default.json");
  try {
    await fs.stat(defaultPath);
  } catch {
    let initialPayload = "null";
    try {
      const rawWorkspace = await fs.readFile(STATE_FILE, "utf-8");
      const parsed = JSON.parse(rawWorkspace);
      initialPayload =
        parsed && typeof parsed.payload === "string"
          ? parsed.payload
          : rawWorkspace;
    } catch {
      // workspace.json absent
    }
    const defaultSession: StoredSessionFile = {
      id: "default",
      name: "Default Workspace",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: initialPayload,
    };
    await fs.writeFile(
      defaultPath,
      JSON.stringify(defaultSession, null, 2),
      "utf-8",
    );
  }
}

async function listAllSessions(): Promise<SessionMeta[]> {
  await ensureSessionsDir();
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
  const results: SessionMeta[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const full = path.join(SESSIONS_DIR, entry.name);
        const raw = await fs.readFile(full, "utf-8");
        const data: StoredSessionFile = JSON.parse(raw);
        const { folderCount, noteCount } = extractCounts(data.payload);
        results.push({
          id: data.id || entry.name.replace(/\.json$/, ""),
          name: data.name || "Untitled Session",
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt || 0,
          folderCount,
          noteCount,
        });
      } catch {
        // Skip malformed files
      }
    }
  }
  results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return results;
}

async function readSessionPayloadIfExists(
  sessionId: string,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(
      path.join(SESSIONS_DIR, `${sessionId}.json`),
      "utf-8",
    );
    const data = JSON.parse(raw);
    return typeof data.payload === "string" ? data.payload : null;
  } catch {
    return null;
  }
}

async function getOrSeedSession(
  sessionId: string,
  suggestedName?: string,
  cloneFromId?: string,
): Promise<StoredSessionFile> {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    let payload =
      (cloneFromId && (await readSessionPayloadIfExists(cloneFromId))) ||
      "null";

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
          // empty
        }
      }
    }

    const existing = await listAllSessions();
    const sessionName = suggestedName || `Session ${existing.length + 1}`;
    const newSession: StoredSessionFile = {
      id: sessionId,
      name: sessionName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload,
    };
    await fs.writeFile(filePath, JSON.stringify(newSession, null, 2), "utf-8");
    return newSession;
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripExt(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, "").trim() || "Untitled";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage,
): Promise<T> {
  const rawBody = await readBody(req);
  return JSON.parse(rawBody || "{}") as T;
}

async function resolveUniqueChildPath(
  parentDir: string,
  baseName: string,
  extension = "",
): Promise<string> {
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

async function readDirectoryShallow(dirPath: string): Promise<ImportedNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders: ImportedFolder[] = [];
  const notes: ImportedNote[] = [];

  for (const entry of entries) {
    if (
      (entry.name.startsWith(".") &&
        !COMMON_DOTFILES.has(entry.name.toLowerCase())) ||
      IGNORED_NAMES.has(entry.name)
    ) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      let hasChildren = false;
      try {
        const subEntries = await fs.readdir(fullPath);
        hasChildren = subEntries.some(
          (name) =>
            (!name.startsWith(".") ||
              COMMON_DOTFILES.has(name.toLowerCase())) &&
            !IGNORED_NAMES.has(name),
        );
      } catch {
        hasChildren = false;
      }
      folders.push({
        id: makeId("sub"),
        type: "folder",
        name: entry.name,
        hasChildren,
        children: [],
        folderPath: fullPath,
      });
    } else if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      NOTE_EXT_REGEX.test(entry.name)
    ) {
      const isPdf = entry.name.toLowerCase().endsWith(".pdf");
      const isImage = !isPdf && IMAGE_EXT_REGEX.test(entry.name);
      const isCode = !isPdf && !isImage && CODE_EXT_REGEX.test(entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        notes.push({
          id: makeId("note"),
          type: "note",
          title: isCode ? entry.name : stripExt(entry.name),
          content: "",
          updatedAt: stat.mtime.toISOString().slice(0, 10),
          filePath: fullPath,
          fileType: isPdf
            ? "pdf"
            : isImage
              ? "image"
              : isCode
                ? "code"
                : "markdown",
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  notes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return [...folders, ...notes];
}

function localBackendPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (
      route: string,
      handler: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => void,
    ) => void;
  }) => {
    // Session Management API (/api/sessions)
    middlewares.use("/api/sessions", async (req, res, next) => {
      const rawUrl = req.url || "";
      const [pathname] = rawUrl.split("?");
      const cleanId = pathname.replace(/^\/+|\/+$/g, "");

      // Collection endpoints: GET /api/sessions and POST /api/sessions
      if (!cleanId) {
        if (req.method === "GET") {
          try {
            const list = await listAllSessions();
            sendJson(res, 200, list, true);
          } catch (err) {
            sendError(res, 500, err, "Failed to list sessions.");
          }
          return;
        }

        if (req.method === "POST") {
          try {
            const body = await readJsonBody<{
              id?: string;
              name?: string;
              cloneFromId?: string;
            }>(req);
            const newId =
              (typeof body.id === "string" && body.id.trim()) ||
              makeId("session");
            const name =
              typeof body.name === "string" ? body.name.trim() : undefined;
            const cloneFromId =
              typeof body.cloneFromId === "string"
                ? body.cloneFromId.trim()
                : undefined;
            const session = await getOrSeedSession(newId, name, cloneFromId);
            sendJson(res, 200, { ok: true, session });
          } catch (err) {
            sendError(res, 500, err, "Failed to create session.");
          }
          return;
        }

        sendJson(res, 405, { error: "Method not allowed." });
        return;
      }

      // Single session endpoints: /api/sessions/:id
      const sessionId = decodeURIComponent(cleanId);
      const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

      if (req.method === "GET") {
        try {
          const session = await getOrSeedSession(sessionId);
          sendJson(res, 200, session, true);
        } catch (err) {
          sendError(res, 500, err, "Failed to get session.");
        }
        return;
      }

      if (req.method === "PUT" || req.method === "POST") {
        try {
          const body = await readJsonBody<{ name?: string; payload?: unknown }>(
            req,
          );
          await ensureSessionsDir();

          let existing: StoredSessionFile | null = null;
          try {
            const rawExisting = await fs.readFile(sessionPath, "utf-8");
            existing = JSON.parse(rawExisting);
          } catch {
            // Not yet existing
          }

          const name =
            typeof body.name === "string" && body.name.trim()
              ? body.name.trim()
              : existing?.name || "Session";

          const payload =
            typeof body.payload === "string"
              ? body.payload
              : body.payload !== undefined
                ? JSON.stringify(body.payload)
                : existing?.payload || "null";

          const updated: StoredSessionFile = {
            id: sessionId,
            name,
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            payload,
          };

          await writeFileAtomic(sessionPath, JSON.stringify(updated, null, 2));

          // If default session, also update legacy workspace.json for backup
          if (sessionId === "default") {
            await fs
              .writeFile(
                STATE_FILE,
                JSON.stringify({
                  savedAt: updated.updatedAt,
                  payload: updated.payload,
                }),
                "utf-8",
              )
              .catch(() => {});
          }

          sendJson(res, 200, {
            ok: true,
            session: {
              id: updated.id,
              name: updated.name,
              updatedAt: updated.updatedAt,
            },
          });
        } catch (err) {
          sendError(res, 500, err, "Failed to save session.");
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          const list = await listAllSessions();
          if (list.length <= 1) {
            sendJson(res, 400, {
              error: "Cannot delete the only remaining session.",
            });
            return;
          }
          await fs.unlink(sessionPath).catch(() => {});
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendError(res, 500, err, "Failed to delete session.");
        }
        return;
      }

      next();
    });

    // Filesystem Direct Two-Way Sync API
    middlewares.use("/api/fs/scan", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const targetPath =
          typeof body.path === "string" ? body.path.trim() : "";
        if (!targetPath) {
          sendJson(res, 400, { error: "Missing folder path." });
          return;
        }
        const resolved = path.resolve(targetPath);
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          sendJson(res, 400, { error: "Path is not a directory." });
          return;
        }
        const items = await readDirectoryShallow(resolved);
        const rootName = path.basename(resolved) || "Notes";
        sendJson(res, 200, { rootName, rootPath: resolved, items });
      } catch (err) {
        sendError(res, 500, err, "Failed to scan folder.");
      }
    });

    middlewares.use("/api/fs/read-file", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const filePath = typeof body.path === "string" ? body.path.trim() : "";
        if (!filePath) {
          sendJson(res, 400, { error: "Missing file path." });
          return;
        }
        const content = await fs.readFile(path.resolve(filePath), "utf-8");
        sendJson(res, 200, { content });
      } catch (err) {
        sendError(res, 500, err, "Failed to read file.");
      }
    });

    middlewares.use("/api/fs/read-dir", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const dirPath = typeof body.path === "string" ? body.path.trim() : "";
        if (!dirPath) {
          sendJson(res, 400, { error: "Missing directory path." });
          return;
        }
        const items = await readDirectoryShallow(path.resolve(dirPath));
        sendJson(res, 200, { items });
      } catch (err) {
        sendError(res, 500, err, "Failed to read directory.");
      }
    });

    middlewares.use("/api/fs/write-file", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string; content?: string }>(
          req,
        );
        const filePath = typeof body.path === "string" ? body.path.trim() : "";
        const content = typeof body.content === "string" ? body.content : "";
        if (!filePath) {
          sendJson(res, 400, { error: "Missing file path." });
          return;
        }
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        sendJson(res, 200, { ok: true, path: resolved });
      } catch (err) {
        sendError(res, 500, err, "Failed to write file.");
      }
    });

    middlewares.use("/api/fs/create-file", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{
          parentPath?: string;
          name?: string;
          content?: string;
        }>(req);
        const parentPath =
          typeof body.parentPath === "string" ? body.parentPath.trim() : "";
        if (!parentPath) {
          sendJson(res, 400, { error: "Missing parent path." });
          return;
        }
        const rawFileName =
          typeof body.name === "string" ? body.name.trim() : "Untitled Note";
        const isCode = CODE_EXT_REGEX.test(rawFileName);
        const resolvedParent = path.resolve(parentPath);
        await fs.mkdir(resolvedParent, { recursive: true });

        let targetFile: string;
        let fileType: "markdown" | "code" = "markdown";
        let title = "";

        if (isCode) {
          const ext = path.extname(rawFileName);
          const base = path.basename(rawFileName, ext);
          targetFile = await resolveUniqueChildPath(resolvedParent, base, ext);
          fileType = "code";
          title = path.basename(targetFile);
        } else {
          const baseName = stripExt(rawFileName);
          targetFile = await resolveUniqueChildPath(
            resolvedParent,
            baseName,
            ".md",
          );
          fileType = "markdown";
          title = stripExt(path.basename(targetFile));
        }

        const initialContent =
          typeof body.content === "string" ? body.content : "";
        await fs.writeFile(targetFile, initialContent, "utf-8");

        const createdNote: ImportedNote = {
          id: makeId("note"),
          type: "note",
          title,
          content: initialContent,
          updatedAt: new Date().toISOString().slice(0, 10),
          filePath: targetFile,
          fileType,
        };
        sendJson(res, 200, { ok: true, note: createdNote });
      } catch (err) {
        sendError(res, 500, err, "Failed to create file.");
      }
    });

    middlewares.use("/api/fs/create-folder", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ parentPath?: string; name?: string }>(
          req,
        );
        const parentPath =
          typeof body.parentPath === "string" ? body.parentPath.trim() : "";
        if (!parentPath) {
          sendJson(res, 400, { error: "Missing parent path." });
          return;
        }
        const folderName =
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : "New Folder";
        const resolvedParent = path.resolve(parentPath);
        const targetDir = await resolveUniqueChildPath(
          resolvedParent,
          folderName,
        );
        await fs.mkdir(targetDir, { recursive: true });

        const createdFolder: ImportedFolder = {
          id: makeId("sub"),
          type: "folder",
          name: path.basename(targetDir),
          children: [],
          folderPath: targetDir,
        };
        sendJson(res, 200, { ok: true, folder: createdFolder });
      } catch (err) {
        sendError(res, 500, err, "Failed to create folder.");
      }
    });

    middlewares.use("/api/fs/rename", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ oldPath?: string; newPath?: string }>(
          req,
        );
        const oldPath =
          typeof body.oldPath === "string" ? body.oldPath.trim() : "";
        const newPath =
          typeof body.newPath === "string" ? body.newPath.trim() : "";
        if (!oldPath || !newPath) {
          sendJson(res, 400, { error: "Missing oldPath or newPath." });
          return;
        }
        const resolvedOld = path.resolve(oldPath);
        const resolvedNew = path.resolve(newPath);
        await fs.rename(resolvedOld, resolvedNew);
        sendJson(res, 200, { ok: true, path: resolvedNew });
      } catch (err) {
        sendError(res, 500, err, "Failed to rename path.");
      }
    });

    middlewares.use("/api/fs/delete", async (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const targetPath =
          typeof body.path === "string" ? body.path.trim() : "";
        if (!targetPath) {
          sendJson(res, 400, { error: "Missing path to delete." });
          return;
        }
        const resolved = path.resolve(targetPath);
        await fs.rm(resolved, { recursive: true, force: true });
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendError(res, 500, err, "Failed to delete path.");
      }
    });

    // Stream raw PDF or media binary files directly to the embedded viewer
    middlewares.use("/api/fs/raw", async (req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      try {
        const reqUrl = new URL(req.url || "", "http://localhost");
        const targetPath = reqUrl.searchParams.get("path");
        if (!targetPath) {
          res.statusCode = 400;
          res.end("Missing file path.");
          return;
        }
        const resolved = await resolveLocalMediaPath(targetPath);
        if (!resolved) {
          res.statusCode = 404;
          res.end("File not found.");
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const mimeType = MIME_BY_EXTENSION[ext] || "application/octet-stream";

        const buffer = await fs.readFile(resolved);
        res.statusCode = 200;
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Accept-Ranges", "bytes");
        res.end(buffer);
      } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : "Failed to read file.");
      }
    });
  };

  return {
    name: "pent-notes-local-backend",
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), localBackendPlugin()],
});
