import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'workspace.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function writeFileAtomic(targetPath, content) {
  const tempFile = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  try {
    await fs.writeFile(tempFile, content, 'utf-8');
    await fs.rename(tempFile, targetPath);
  } catch {
    try {
      await fs.writeFile(targetPath, content, 'utf-8');
    } catch (err) {
      throw err;
    }
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignored if already cleaned up
    }
  }
}

function extractCounts(payloadStr) {
  try {
    const parsed = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const state = parsed.state || parsed;
    const folders = Array.isArray(state.folders) ? state.folders : [];
    let noteCount = 0;

    function countNotes(items) {
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

export async function ensureSessionsDir() {
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
    const defaultSession = {
      id: 'default',
      name: 'Default Workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: initialPayload,
    };
    await fs.writeFile(defaultPath, JSON.stringify(defaultSession, null, 2), 'utf-8');
  }
}

export async function listAllSessions() {
  await ensureSessionsDir();
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      try {
        const full = path.join(SESSIONS_DIR, entry.name);
        const raw = await fs.readFile(full, 'utf-8');
        const data = JSON.parse(raw);
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
        // Skip malformed
      }
    }
  }
  results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return results;
}

export async function readSessionPayloadIfExists(sessionId) {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf-8');
    const data = JSON.parse(raw);
    return typeof data.payload === 'string' ? data.payload : null;
  } catch {
    return null;
  }
}

export async function getOrSeedSession(sessionId, suggestedName, cloneFromId) {
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
    const newSession = {
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

export async function saveSession(sessionId, name, payload) {
  await ensureSessionsDir();
  const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);

  let existing = null;
  try {
    const rawExisting = await fs.readFile(sessionPath, 'utf-8');
    existing = JSON.parse(rawExisting);
  } catch {
    // Not existing yet
  }

  const sessionName =
    typeof name === 'string' && name.trim() ? name.trim() : existing?.name || 'Session';

  const sessionPayload =
    typeof payload === 'string'
      ? payload
      : payload !== undefined
      ? JSON.stringify(payload)
      : existing?.payload || 'null';

  const updated = {
    id: sessionId,
    name: sessionName,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    payload: sessionPayload,
  };

  await writeFileAtomic(sessionPath, JSON.stringify(updated, null, 2));

  if (sessionId === 'default') {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs
      .writeFile(
        STATE_FILE,
        JSON.stringify({ savedAt: updated.updatedAt, payload: updated.payload }),
        'utf-8'
      )
      .catch(() => {});
  }

  return { ok: true, session: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt } };
}

export async function deleteSession(sessionId) {
  const list = await listAllSessions();
  if (list.length <= 1) {
    throw new Error('Cannot delete the only remaining session.');
  }
  const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  await fs.unlink(sessionPath).catch(() => {});
  return { ok: true };
}

export async function getWorkspaceState() {
  try {
    return await fs.readFile(STATE_FILE, 'utf-8');
  } catch {
    return 'null';
  }
}

export async function saveWorkspaceState(rawJson) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeFileAtomic(STATE_FILE, rawJson);
  return { ok: true };
}

