import { StateStorage } from 'zustand/middleware';
import { getTabSessionId, getTabSessionName } from './sessionManager';

interface StoredEnvelope {
  savedAt: number;
  payload: string;
}

const IDB_NAME = 'pentnotes-db';
const IDB_STORE = 'workspace-kv';
const IDB_VERSION = 2;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<StoredEnvelope | null> {
  try {
    const db = await openIdb();
    return await new Promise<StoredEnvelope | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const val = req.result;
        if (val && typeof val.savedAt === 'number' && typeof val.payload === 'string') {
          resolve(val as StoredEnvelope);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, envelope: StoredEnvelope): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(envelope, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB write failures if running in restricted context
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

async function serverGet(sessionId: string): Promise<StoredEnvelope | null> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.payload === 'string' && data.payload !== 'null') {
      return {
        savedAt: data.updatedAt || Date.now(),
        payload: data.payload,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function serverSet(
  sessionId: string,
  envelope: StoredEnvelope,
  keepalive = false
): Promise<void> {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: envelope.payload,
        name: getTabSessionName(),
      }),
      keepalive,
    });
  } catch {
    // Static build or offline fallback relies on IndexedDB
  }
}

let pendingEnvelope: StoredEnvelope | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleServerWrite(sessionId: string, envelope: StoredEnvelope): void {
  pendingEnvelope = envelope;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingEnvelope) {
      const toWrite = pendingEnvelope;
      pendingEnvelope = null;
      void serverSet(sessionId, toWrite);
    }
  }, 150);
}

if (typeof window !== 'undefined') {
  const flushPending = () => {
    if (pendingEnvelope) {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const toWrite = pendingEnvelope;
      pendingEnvelope = null;
      void serverSet(getTabSessionId(), toWrite, true);
    }
  };
  window.addEventListener('pagehide', flushPending);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPending();
    }
  });
}

export const workspaceStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    const sessionId = getTabSessionId();
    const idbKey = `${name}:${sessionId}`;
    const [localEnv, diskEnv] = await Promise.all([idbGet(idbKey), serverGet(sessionId)]);

    if (localEnv && diskEnv) {
      if (diskEnv.savedAt >= localEnv.savedAt) {
        if (diskEnv.savedAt > localEnv.savedAt) {
          void idbSet(idbKey, diskEnv);
        }
        return diskEnv.payload;
      }
      void serverSet(sessionId, localEnv);
      return localEnv.payload;
    }

    if (diskEnv) {
      void idbSet(idbKey, diskEnv);
      return diskEnv.payload;
    }

    if (localEnv) {
      void serverSet(sessionId, localEnv);
      return localEnv.payload;
    }

    return null;
  },

  async setItem(name: string, value: string): Promise<void> {
    const sessionId = getTabSessionId();
    const idbKey = `${name}:${sessionId}`;
    const envelope: StoredEnvelope = {
      savedAt: Date.now(),
      payload: value,
    };
    await idbSet(idbKey, envelope);
    scheduleServerWrite(sessionId, envelope);
  },

  async removeItem(name: string): Promise<void> {
    const sessionId = getTabSessionId();
    const idbKey = `${name}:${sessionId}`;
    await idbDelete(idbKey);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch {
      // Ignore
    }
  },
};
