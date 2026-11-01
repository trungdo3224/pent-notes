import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

interface ImportedNote {
  id: string;
  type: 'note';
  title: string;
  content: string;
  updatedAt: string;
  filePath?: string;
  fileType?: 'markdown' | 'pdf';
}

interface ImportedFolder {
  id: string;
  type: 'folder';
  name: string;
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

const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;
const MAX_DIRECTORY_SCAN_DEPTH = 8;

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.obsidian',
  '.vscode',
  '.idea',
  'dist',
  'build',
  '__pycache__',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const DATA_DIR = path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'workspace.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

function sendRawJson(
  res: ServerResponse,
  statusCode: number,
  rawJson: string,
  noStore = false
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (noStore) {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(rawJson);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  noStore = false
): void {
  sendRawJson(res, statusCode, JSON.stringify(payload), noStore);
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  err: unknown,
  fallbackMessage: string
): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  sendJson(res, statusCode, { error: message });
}

async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  const tempFile = `${targetPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, content, 'utf-8');
  await fs.rename(tempFile, targetPath);
}

function extractCounts(payloadStr: string): { folderCount: number; noteCount: number } {
  try {
    const parsed = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const state = parsed.state || parsed;
    const folders: StoredTreeItem[] = Array.isArray(state.folders) ? state.folders : [];
    let noteCount = 0;

    function countNotes(items: StoredTreeItem[]) {
      for (const item of items) {
        if (item.type === 'note') noteCount++;
        if (item.type === 'folder' && Array.isArray(item.children)) {
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

  const defaultPath = path.join(SESSIONS_DIR, 'default.json');
  try {
    await fs.stat(defaultPath);
  } catch {
    let initialPayload = 'null';
    try {
      const rawWorkspace = await fs.readFile(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(rawWorkspace);
      initialPayload =
        parsed && typeof parsed.payload === 'string' ? parsed.payload : rawWorkspace;
    } catch {
      // workspace.json absent
    }
    const defaultSession: StoredSessionFile = {
      id: 'default',
      name: 'Default Workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: initialPayload,
    };
    await fs.writeFile(defaultPath, JSON.stringify(defaultSession, null, 2), 'utf-8');
  }
}

async function listAllSessions(): Promise<SessionMeta[]> {
  await ensureSessionsDir();
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
  const results: SessionMeta[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      try {
        const full = path.join(SESSIONS_DIR, entry.name);
        const raw = await fs.readFile(full, 'utf-8');
        const data: StoredSessionFile = JSON.parse(raw);
        const { folderCount, noteCount } = extractCounts(data.payload);
        results.push({
          id: data.id || entry.name.replace(/\.json$/, ''),
          name: data.name || 'Untitled Session',
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

async function readSessionPayloadIfExists(sessionId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf-8');
    const data = JSON.parse(raw);
    return typeof data.payload === 'string' ? data.payload : null;
  } catch {
    return null;
  }
}

async function getOrSeedSession(
  sessionId: string,
  suggestedName?: string,
  cloneFromId?: string
): Promise<StoredSessionFile> {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    let payload = (cloneFromId && (await readSessionPayloadIfExists(cloneFromId))) || 'null';

    if (payload === 'null') {
      const defaultPayload = await readSessionPayloadIfExists('default');
      if (defaultPayload) {
        payload = defaultPayload;
      } else {
        try {
          const rawWs = await fs.readFile(STATE_FILE, 'utf-8');
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
    await fs.writeFile(filePath, JSON.stringify(newSession, null, 2), 'utf-8');
    return newSession;
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripExt(name: string): string {
  return name.replace(NOTE_EXT_REGEX, '').trim() || 'Untitled';
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const rawBody = await readBody(req);
  return JSON.parse(rawBody || '{}') as T;
}

async function resolveUniqueChildPath(
  parentDir: string,
  baseName: string,
  extension = ''
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

async function readDirectoryRecursive(
  dirPath: string,
  depth = 0
): Promise<ImportedNode[]> {
  if (depth > MAX_DIRECTORY_SCAN_DEPTH) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders: ImportedFolder[] = [];
  const notes: ImportedNote[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, depth + 1);
      folders.push({
        id: makeId('sub'),
        type: 'folder',
        name: entry.name,
        children,
        folderPath: fullPath,
      });
    } else if (entry.isFile() && NOTE_EXT_REGEX.test(entry.name)) {
      const isPdf = entry.name.toLowerCase().endsWith('.pdf');
      const [content, stat] = await Promise.all([
        isPdf ? Promise.resolve('') : fs.readFile(fullPath, 'utf-8'),
        fs.stat(fullPath),
      ]);
      notes.push({
        id: makeId('note'),
        type: 'note',
        title: stripExt(entry.name),
        content,
        updatedAt: stat.mtime.toISOString().slice(0, 10),
        filePath: fullPath,
        fileType: isPdf ? 'pdf' : 'markdown',
      });
    }
  }

  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  notes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  );

  return [...folders, ...notes];
}

function localBackendPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (
      route: string,
      handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
    ) => void;
  }) => {
    // Persistent workspace state API (data/workspace.json)
    middlewares.use('/api/state', async (req, res, next) => {
      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(STATE_FILE, 'utf-8');
          sendRawJson(res, 200, raw, true);
        } catch {
          sendRawJson(res, 200, 'null', true);
        }
        return;
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        try {
          const raw = await readBody(req);
          JSON.parse(raw); // Validate JSON before writing
          await fs.mkdir(DATA_DIR, { recursive: true });
          await writeFileAtomic(STATE_FILE, raw);
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendError(res, 500, err, 'Failed to persist state.');
        }
        return;
      }

      if (req.method === 'DELETE') {
        await fs.unlink(STATE_FILE).catch(() => {});
        sendJson(res, 200, { ok: true });
        return;
      }

      next();
    });

    // Session Management API (/api/sessions)
    middlewares.use('/api/sessions', async (req, res, next) => {
      const rawUrl = req.url || '';
      const [pathname] = rawUrl.split('?');
      const cleanId = pathname.replace(/^\/+|\/+$/g, '');

      // Collection endpoints: GET /api/sessions and POST /api/sessions
      if (!cleanId) {
        if (req.method === 'GET') {
          try {
            const list = await listAllSessions();
            sendJson(res, 200, list, true);
          } catch (err) {
            sendError(res, 500, err, 'Failed to list sessions.');
          }
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = await readJsonBody<{
              id?: string;
              name?: string;
              cloneFromId?: string;
            }>(req);
            const newId = (typeof body.id === 'string' && body.id.trim()) || makeId('session');
            const name = typeof body.name === 'string' ? body.name.trim() : undefined;
            const cloneFromId =
              typeof body.cloneFromId === 'string' ? body.cloneFromId.trim() : undefined;
            const session = await getOrSeedSession(newId, name, cloneFromId);
            sendJson(res, 200, { ok: true, session });
          } catch (err) {
            sendError(res, 500, err, 'Failed to create session.');
          }
          return;
        }

        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      }

      // Single session endpoints: /api/sessions/:id
      const sessionId = decodeURIComponent(cleanId);
      const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

      if (req.method === 'GET') {
        try {
          const session = await getOrSeedSession(sessionId);
          sendJson(res, 200, session, true);
        } catch (err) {
          sendError(res, 500, err, 'Failed to get session.');
        }
        return;
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        try {
          const body = await readJsonBody<{ name?: string; payload?: unknown }>(req);
          await ensureSessionsDir();

          let existing: StoredSessionFile | null = null;
          try {
            const rawExisting = await fs.readFile(sessionPath, 'utf-8');
            existing = JSON.parse(rawExisting);
          } catch {
            // Not yet existing
          }

          const name =
            typeof body.name === 'string' && body.name.trim()
              ? body.name.trim()
              : existing?.name || 'Session';

          const payload =
            typeof body.payload === 'string'
              ? body.payload
              : body.payload !== undefined
              ? JSON.stringify(body.payload)
              : existing?.payload || 'null';

          const updated: StoredSessionFile = {
            id: sessionId,
            name,
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            payload,
          };

          await writeFileAtomic(sessionPath, JSON.stringify(updated, null, 2));

          // If default session, also update legacy workspace.json for backup
          if (sessionId === 'default') {
            await fs
              .writeFile(
                STATE_FILE,
                JSON.stringify({ savedAt: updated.updatedAt, payload: updated.payload }),
                'utf-8'
              )
              .catch(() => {});
          }

          sendJson(res, 200, {
            ok: true,
            session: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt },
          });
        } catch (err) {
          sendError(res, 500, err, 'Failed to save session.');
        }
        return;
      }

      if (req.method === 'DELETE') {
        try {
          const list = await listAllSessions();
          if (list.length <= 1) {
            sendJson(res, 400, { error: 'Cannot delete the only remaining session.' });
            return;
          }
          await fs.unlink(sessionPath).catch(() => {});
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendError(res, 500, err, 'Failed to delete session.');
        }
        return;
      }

      next();
    });

    // Local file/folder path import API
    middlewares.use('/api/import-path', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
        const cleanedPath = rawPath.replace(/^["']+|["']+$/g, '').trim();

        if (!cleanedPath) {
          sendJson(res, 400, { error: 'Please provide a valid file or folder path.' });
          return;
        }

        const resolvedPath = path.resolve(cleanedPath);
        let stat;
        try {
          stat = await fs.stat(resolvedPath);
        } catch {
          sendJson(res, 404, { error: `Path not found: ${resolvedPath}` });
          return;
        }

        if (stat.isFile()) {
          const isPdf = resolvedPath.toLowerCase().endsWith('.pdf');
          const content = isPdf ? '' : await fs.readFile(resolvedPath, 'utf-8');
          const fileName = path.basename(resolvedPath);
          const note: ImportedNote = {
            id: makeId('note'),
            type: 'note',
            title: stripExt(fileName),
            content,
            updatedAt: stat.mtime.toISOString().slice(0, 10),
            filePath: resolvedPath,
            fileType: isPdf ? 'pdf' : 'markdown',
          };
          sendJson(res, 200, { kind: 'file', note });
          return;
        }

        if (stat.isDirectory()) {
          const items = await readDirectoryRecursive(resolvedPath);
          const rootName = path.basename(resolvedPath) || 'Imported Folder';
          sendJson(res, 200, { kind: 'folder', rootName, rootPath: resolvedPath, items });
          return;
        }

        sendJson(res, 400, { error: 'Unsupported path type.' });
      } catch (err) {
        sendError(res, 500, err, 'Failed to import from path.');
      }
    });

    // Filesystem Direct Two-Way Sync API
    middlewares.use('/api/fs/scan', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
        if (!targetPath) {
          sendJson(res, 400, { error: 'Missing folder path.' });
          return;
        }
        const resolved = path.resolve(targetPath);
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          sendJson(res, 400, { error: 'Path is not a directory.' });
          return;
        }
        const items = await readDirectoryRecursive(resolved);
        const rootName = path.basename(resolved) || 'Notes';
        sendJson(res, 200, { rootName, rootPath: resolved, items });
      } catch (err) {
        sendError(res, 500, err, 'Failed to scan folder.');
      }
    });

    middlewares.use('/api/fs/write-file', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string; content?: string }>(req);
        const filePath = typeof body.path === 'string' ? body.path.trim() : '';
        const content = typeof body.content === 'string' ? body.content : '';
        if (!filePath) {
          sendJson(res, 400, { error: 'Missing file path.' });
          return;
        }
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, 'utf-8');
        sendJson(res, 200, { ok: true, path: resolved });
      } catch (err) {
        sendError(res, 500, err, 'Failed to write file.');
      }
    });

    middlewares.use('/api/fs/create-file', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{
          parentPath?: string;
          name?: string;
          content?: string;
        }>(req);
        const parentPath = typeof body.parentPath === 'string' ? body.parentPath.trim() : '';
        if (!parentPath) {
          sendJson(res, 400, { error: 'Missing parent path.' });
          return;
        }
        const rawFileName = typeof body.name === 'string' ? body.name.trim() : 'Untitled Note';
        const baseName = stripExt(rawFileName);
        const resolvedParent = path.resolve(parentPath);
        await fs.mkdir(resolvedParent, { recursive: true });

        const targetFile = await resolveUniqueChildPath(resolvedParent, baseName, '.md');
        const initialContent = typeof body.content === 'string' ? body.content : '';
        await fs.writeFile(targetFile, initialContent, 'utf-8');

        const createdNote: ImportedNote = {
          id: makeId('note'),
          type: 'note',
          title: stripExt(path.basename(targetFile)),
          content: initialContent,
          updatedAt: new Date().toISOString().slice(0, 10),
          filePath: targetFile,
        };
        sendJson(res, 200, { ok: true, note: createdNote });
      } catch (err) {
        sendError(res, 500, err, 'Failed to create file.');
      }
    });

    middlewares.use('/api/fs/create-folder', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ parentPath?: string; name?: string }>(req);
        const parentPath = typeof body.parentPath === 'string' ? body.parentPath.trim() : '';
        if (!parentPath) {
          sendJson(res, 400, { error: 'Missing parent path.' });
          return;
        }
        const folderName =
          typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Folder';
        const resolvedParent = path.resolve(parentPath);
        const targetDir = await resolveUniqueChildPath(resolvedParent, folderName);
        await fs.mkdir(targetDir, { recursive: true });

        const createdFolder: ImportedFolder = {
          id: makeId('sub'),
          type: 'folder',
          name: path.basename(targetDir),
          children: [],
          folderPath: targetDir,
        };
        sendJson(res, 200, { ok: true, folder: createdFolder });
      } catch (err) {
        sendError(res, 500, err, 'Failed to create folder.');
      }
    });

    middlewares.use('/api/fs/rename', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ oldPath?: string; newPath?: string }>(req);
        const oldPath = typeof body.oldPath === 'string' ? body.oldPath.trim() : '';
        const newPath = typeof body.newPath === 'string' ? body.newPath.trim() : '';
        if (!oldPath || !newPath) {
          sendJson(res, 400, { error: 'Missing oldPath or newPath.' });
          return;
        }
        const resolvedOld = path.resolve(oldPath);
        const resolvedNew = path.resolve(newPath);
        await fs.rename(resolvedOld, resolvedNew);
        sendJson(res, 200, { ok: true, path: resolvedNew });
      } catch (err) {
        sendError(res, 500, err, 'Failed to rename path.');
      }
    });

    middlewares.use('/api/fs/delete', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody<{ path?: string }>(req);
        const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
        if (!targetPath) {
          sendJson(res, 400, { error: 'Missing path to delete.' });
          return;
        }
        const resolved = path.resolve(targetPath);
        await fs.rm(resolved, { recursive: true, force: true });
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendError(res, 500, err, 'Failed to delete path.');
      }
    });

    // Stream raw PDF or media binary files directly to the embedded viewer
    middlewares.use('/api/fs/raw', async (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      try {
        const reqUrl = new URL(req.url || '', 'http://localhost');
        const targetPath = reqUrl.searchParams.get('path');
        if (!targetPath) {
          res.statusCode = 400;
          res.end('Missing file path.');
          return;
        }
        const resolved = path.resolve(targetPath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          res.statusCode = 404;
          res.end('File not found.');
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const mimeType = MIME_BY_EXTENSION[ext] || 'application/octet-stream';

        const buffer = await fs.readFile(resolved);
        res.statusCode = 200;
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buffer);
      } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : 'Failed to read file.');
      }
    });
  };

  return {
    name: 'pent-notes-local-backend',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), localBackendPlugin()],
});
