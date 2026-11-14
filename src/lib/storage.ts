import { StateStorage } from "zustand/middleware";
import {
  getKnownTabSessionName,
  getTabSessionId,
  registerBeforeSessionSwitch,
  sessionApi,
} from "./sessionManager";

interface StoredEnvelope {
  savedAt: number;
  payload: string;
}

const IDB_NAME = "pentnotes-db";
const IDB_STORE = "workspace-kv";
const IDB_VERSION = 2;
const SERVER_WRITE_DEBOUNCE_MS = 150;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
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
    typeof val === "object" &&
    typeof (val as StoredEnvelope).savedAt === "number" &&
    typeof (val as StoredEnvelope).payload === "string"
  );
}

async function idbGet(key: string): Promise<StoredEnvelope | null> {
  try {
    const db = await openIdb();
    return await new Promise<StoredEnvelope | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () =>
        resolve(isStoredEnvelope(req.result) ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbMutate(
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
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
    const data = await sessionApi.getSession(sessionId);
    if (data && typeof data.payload === "string" && data.payload !== "null") {
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

interface PendingServerWrite {
  sessionId: string;
  sessionName?: string;
  envelope: StoredEnvelope;
}

async function serverSet(
  write: PendingServerWrite,
  keepalive = false,
): Promise<void> {
  try {
    await sessionApi.saveSession(
      write.sessionId,
      write.envelope.payload,
      write.sessionName ??
        (write.sessionId === getTabSessionId()
          ? getKnownTabSessionName()
          : undefined),
      keepalive,
    );
  } catch {
    // Static build or offline fallback relies on IndexedDB
  }
}

let pendingWrite: PendingServerWrite | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleServerWrite(
  sessionId: string,
  envelope: StoredEnvelope,
): void {
  pendingWrite = {
    sessionId,
    sessionName: getKnownTabSessionName(),
    envelope,
  };
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingWrite) {
      const toWrite = pendingWrite;
      pendingWrite = null;
      void serverSet(toWrite);
    }
  }, SERVER_WRITE_DEBOUNCE_MS);
}

export function flushPendingWorkspaceWrite(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingWrite) {
    const toWrite = pendingWrite;
    pendingWrite = null;
    void serverSet(toWrite, true);
  }
}

registerBeforeSessionSwitch(flushPendingWorkspaceWrite);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPendingWorkspaceWrite);
  window.addEventListener("pagehide", flushPendingWorkspaceWrite);
}

function getSessionStorageKey(name: string): {
  sessionId: string;
  idbKey: string;
} {
  const sessionId = getTabSessionId();
  return {
    sessionId,
    idbKey: `${name}:${sessionId}`,
  };
}

export const workspaceStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    const { sessionId, idbKey } = getSessionStorageKey(name);
    const cachedEnvelope = await idbGet(idbKey);

    try {
      const remoteEnvelope = await serverGet(sessionId);
      if (remoteEnvelope && remoteEnvelope.payload) {
        if (
          !cachedEnvelope ||
          remoteEnvelope.savedAt >= cachedEnvelope.savedAt
        ) {
          await idbSet(idbKey, remoteEnvelope);
          return remoteEnvelope.payload;
        }
      }
    } catch {
      // Remote unavailable, fall back to cached IDB value
    }

    return cachedEnvelope ? cachedEnvelope.payload : null;
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
      await sessionApi.deleteSession(sessionId);
    } catch {
      // Ignore network errors when deleting session
    }
  },
};
