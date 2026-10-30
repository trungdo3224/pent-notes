import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';

interface ImportedNote {
  id: string;
  type: 'note';
  title: string;
  content: string;
  updatedAt: string;
  filePath?: string;
}

interface ImportedFolder {
  id: string;
  type: 'folder';
  name: string;
  children: Array<ImportedFolder | ImportedNote>;
  folderPath?: string;
}

const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt)$/i;
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

const DATA_DIR = path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'workspace.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

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

function extractCounts(payloadStr: string): { folderCount: number; noteCount: number } {
  try {
    const parsed = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const state = parsed.state || parsed;
    const folders = Array.isArray(state.folders) ? state.folders : [];
    let noteCount = 0;
    function countNotes(items: any[]) {
      for (const item of items) {
        if (item.type === 'note') noteCount++;
        if (item.type === 'folder' && Array.isArray(item.children)) {
          countNotes(item.children);
        }
      }
    }
    for (const f of folders) {
      if (Array.isArray(f.items)) countNotes(f.items);
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
      if (parsed && typeof parsed.payload === 'string') {
        initialPayload = parsed.payload;
      } else {
        initialPayload = rawWorkspace;
      }
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
    let payload = 'null';
    if (cloneFromId) {
      try {
        const srcRaw = await fs.readFile(path.join(SESSIONS_DIR, `${cloneFromId}.json`), 'utf-8');
        const srcData = JSON.parse(srcRaw);
        payload = srcData.payload;
      } catch {
        // ignore
      }
    }
    if (payload === 'null') {
      try {
        const defRaw = await fs.readFile(path.join(SESSIONS_DIR, 'default.json'), 'utf-8');
        const defData = JSON.parse(defRaw);
        payload = defData.payload;
      } catch {
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

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readDirectoryRecursive(
  dirPath: string,
  depth = 0
): Promise<Array<ImportedFolder | ImportedNote>> {
  if (depth > 8) return [];
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
      const [content, stat] = await Promise.all([
        fs.readFile(fullPath, 'utf-8'),
        fs.stat(fullPath),
      ]);
      notes.push({
        id: makeId('note'),
        type: 'note',
        title: stripExt(entry.name),
        content,
        updatedAt: stat.mtime.toISOString().slice(0, 10),
        filePath: fullPath,
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
      handler: (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
        next: () => void
      ) => void
    ) => void;
  }) => {
    // Persistent workspace state API (data/workspace.json)
    middlewares.use('/api/state', async (req, res, next) => {
      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(STATE_FILE, 'utf-8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(raw);
        } catch {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end('null');
        }
        return;
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        try {
          const raw = await readBody(req);
          JSON.parse(raw); // Validate JSON before writing
          await fs.mkdir(DATA_DIR, { recursive: true });
          const tempFile = `${STATE_FILE}.${Date.now()}.tmp`;
          await fs.writeFile(tempFile, raw, 'utf-8');
          await fs.rename(tempFile, STATE_FILE);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Failed to persist state.',
            })
          );
        }
        return;
      }

      if (req.method === 'DELETE') {
        try {
          await fs.unlink(STATE_FILE);
        } catch {
          // Ignore if already absent
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
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
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(list));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Failed to list sessions.',
              })
            );
          }
          return;
        }

        if (req.method === 'POST') {
          try {
            const rawBody = await readBody(req);
            const body = JSON.parse(rawBody || '{}');
            const newId = (typeof body.id === 'string' && body.id.trim()) || makeId('session');
            const name = typeof body.name === 'string' ? body.name.trim() : undefined;
            const cloneFromId =
              typeof body.cloneFromId === 'string' ? body.cloneFromId.trim() : undefined;
            const session = await getOrSeedSession(newId, name, cloneFromId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, session }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Failed to create session.',
              })
            );
          }
          return;
        }

        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }

      // Single session endpoints: /api/sessions/:id
      const sessionId = decodeURIComponent(cleanId);
      const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

      if (req.method === 'GET') {
        try {
          const session = await getOrSeedSession(sessionId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(session));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Failed to get session.',
            })
          );
        }
        return;
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        try {
          const rawBody = await readBody(req);
          const body = JSON.parse(rawBody || '{}');
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
              : existing?.name || `Session`;

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

          const tempFile = `${sessionPath}.${Date.now()}.tmp`;
          await fs.writeFile(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
          await fs.rename(tempFile, sessionPath);

          // If default session, also update legacy workspace.json for backup
          if (sessionId === 'default') {
            try {
              await fs.writeFile(
                STATE_FILE,
                JSON.stringify({ savedAt: updated.updatedAt, payload: updated.payload }),
                'utf-8'
              );
            } catch {
              // ignore
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              session: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt },
            })
          );
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Failed to save session.',
            })
          );
        }
        return;
      }

      if (req.method === 'DELETE') {
        try {
          const list = await listAllSessions();
          if (list.length <= 1) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Cannot delete the only remaining session.' }));
            return;
          }
          await fs.unlink(sessionPath).catch(() => {});
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Failed to delete session.',
            })
          );
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
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
        const cleanedPath = rawPath.replace(/^["']+|["']+$/g, '').trim();

        if (!cleanedPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Please provide a valid file or folder path.' }));
          return;
        }

        const resolvedPath = path.resolve(cleanedPath);
        let stat;
        try {
          stat = await fs.stat(resolvedPath);
        } catch {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: `Path not found: ${resolvedPath}`,
            })
          );
          return;
        }

        if (stat.isFile()) {
          const content = await fs.readFile(resolvedPath, 'utf-8');
          const fileName = path.basename(resolvedPath);
          const note: ImportedNote = {
            id: makeId('note'),
            type: 'note',
            title: stripExt(fileName),
            content,
            updatedAt: stat.mtime.toISOString().slice(0, 10),
          };
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ kind: 'file', note }));
          return;
        }

        if (stat.isDirectory()) {
          const items = await readDirectoryRecursive(resolvedPath);
          const rootName = path.basename(resolvedPath) || 'Imported Folder';
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ kind: 'folder', rootName, rootPath: resolvedPath, items }));
          return;
        }

        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unsupported path type.' }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to import from path.',
          })
        );
      }
    });

    // Filesystem Direct Two-Way Sync API
    middlewares.use('/api/fs/scan', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing folder path.' }));
          return;
        }
        const resolved = path.resolve(targetPath);
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Path is not a directory.' }));
          return;
        }
        const items = await readDirectoryRecursive(resolved);
        const rootName = path.basename(resolved) || 'Notes';
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ rootName, rootPath: resolved, items }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to scan folder.',
          })
        );
      }
    });

    middlewares.use('/api/fs/write-file', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const filePath = typeof body.path === 'string' ? body.path.trim() : '';
        const content = typeof body.content === 'string' ? body.content : '';
        if (!filePath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing file path.' }));
          return;
        }
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, 'utf-8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: resolved }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to write file.',
          })
        );
      }
    });

    middlewares.use('/api/fs/create-file', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const parentPath = typeof body.parentPath === 'string' ? body.parentPath.trim() : '';
        let fileName = typeof body.name === 'string' ? body.name.trim() : 'Untitled Note';
        if (!NOTE_EXT_REGEX.test(fileName)) {
          fileName += '.md';
        }
        if (!parentPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing parent path.' }));
          return;
        }
        const resolvedParent = path.resolve(parentPath);
        await fs.mkdir(resolvedParent, { recursive: true });

        // Ensure unique filename if collision
        let targetFile = path.join(resolvedParent, fileName);
        let counter = 1;
        const base = stripExt(fileName);
        while (true) {
          try {
            await fs.stat(targetFile);
            targetFile = path.join(resolvedParent, `${base} (${counter}).md`);
            counter++;
          } catch {
            break;
          }
        }

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
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, note: createdNote }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to create file.',
          })
        );
      }
    });

    middlewares.use('/api/fs/create-folder', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const parentPath = typeof body.parentPath === 'string' ? body.parentPath.trim() : '';
        let folderName = typeof body.name === 'string' ? body.name.trim() : 'New Folder';
        if (!parentPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing parent path.' }));
          return;
        }
        const resolvedParent = path.resolve(parentPath);
        let targetDir = path.join(resolvedParent, folderName);
        let counter = 1;
        while (true) {
          try {
            await fs.stat(targetDir);
            targetDir = path.join(resolvedParent, `${folderName} (${counter})`);
            counter++;
          } catch {
            break;
          }
        }
        await fs.mkdir(targetDir, { recursive: true });
        const createdFolder: ImportedFolder = {
          id: makeId('sub'),
          type: 'folder',
          name: path.basename(targetDir),
          children: [],
          folderPath: targetDir,
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, folder: createdFolder }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to create folder.',
          })
        );
      }
    });

    middlewares.use('/api/fs/rename', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const oldPath = typeof body.oldPath === 'string' ? body.oldPath.trim() : '';
        const newPath = typeof body.newPath === 'string' ? body.newPath.trim() : '';
        if (!oldPath || !newPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing oldPath or newPath.' }));
          return;
        }
        const resolvedOld = path.resolve(oldPath);
        const resolvedNew = path.resolve(newPath);
        await fs.rename(resolvedOld, resolvedNew);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: resolvedNew }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to rename path.',
          })
        );
      }
    });

    middlewares.use('/api/fs/delete', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody || '{}');
        const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing path to delete.' }));
          return;
        }
        const resolved = path.resolve(targetPath);
        await fs.rm(resolved, { recursive: true, force: true });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to delete path.',
          })
        );
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
