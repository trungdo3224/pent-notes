import { StateStorage } from 'zustand/middleware';
import { getTabSessionId, getTabSessionName } from './sessionManager';

interface StoredEnvelope {
  savedAt: number;
  payload: string;
}

const IDB_NAME = 'pentnotes-db';
const IDB_STORE = 'workspace-kv';
const IDB_VERSION = 2;
const SERVER_WRITE_DEBOUNCE_MS = 150;

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

function isStoredEnvelope(val: unknown): val is StoredEnvelope {
  return (
    Boolean(val) &&
    typeof val === 'object' &&
    typeof (val as StoredEnvelope).savedAt === 'number' &&
    typeof (val as StoredEnvelope).payload === 'string'
  );
}

async function idbGet(key: string): Promise<StoredEnvelope | null> {
  try {
    const db = await openIdb();
    return await new Promise<StoredEnvelope | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(isStoredEnvelope(req.result) ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbMutate(
  operation: (store: IDBObjectStore) => void
): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      operation(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB write failures if running in restricted context
  }
}

async function idbSet(key: string, envelope: StoredEnvelope): Promise<void> {
  await idbMutate((store) => {
    store.put(envelope, key);
  });
}

async function idbDelete(key: string): Promise<void> {
  await idbMutate((store) => {
    store.delete(key);
  });
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
  }, SERVER_WRITE_DEBOUNCE_MS);
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

function getSessionStorageKey(name: string): { sessionId: string; idbKey: string } {
  const sessionId = getTabSessionId();
  return { sessionId, idbKey: `${name}:${sessionId}` };
}

export const workspaceStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    const { sessionId, idbKey } = getSessionStorageKey(name);
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
    const { sessionId, idbKey } = getSessionStorageKey(name);
    const envelope: StoredEnvelope = {
      savedAt: Date.now(),
      payload: value,
    };
    await idbSet(idbKey, envelope);
    scheduleServerWrite(sessionId, envelope);
  },

  async removeItem(name: string): Promise<void> {
    const { sessionId, idbKey } = getSessionStorageKey(name);
    await idbDelete(idbKey);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch {
      // Ignore network errors when deleting session
    }
  },
};
