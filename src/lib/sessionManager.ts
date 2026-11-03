import { createId } from './fileUtils';
import { postJson, requestJson } from './httpClient';

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  folderCount?: number;
  noteCount?: number;
}

export interface SessionData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: string;
}

const SESSION_STORAGE_KEY = 'pentnotes_session_id';
const LOCAL_STORAGE_LAST_SESSION = 'pentnotes_last_session';
const DEFAULT_SESSION_ID = 'default';

function generateSessionId(): string {
  return createId('session');
}

function updateUrlSessionParam(sessionId: string): void {
  const nextUrl = new URL(window.location.href);
  if (sessionId === DEFAULT_SESSION_ID) {
    nextUrl.searchParams.delete('session');
  } else {
    nextUrl.searchParams.set('session', sessionId);
  }
  window.history.replaceState({}, '', nextUrl.toString());
}

function persistSessionInTabStorage(sessionId: string, syncUrl = false): string {
  sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  localStorage.setItem(LOCAL_STORAGE_LAST_SESSION, sessionId);
  activeSessionIdCache = sessionId;
  if (syncUrl) {
    updateUrlSessionParam(sessionId);
  }
  return sessionId;
}

let activeSessionIdCache: string | null = null;
let activeSessionNameCache: string | null = null;

export function getTabSessionId(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_SESSION_ID;
  }

  if (activeSessionIdCache) {
    return activeSessionIdCache;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const paramSession = urlParams.get('session');

  // Case 1: Explicit ?session=new
  if (paramSession === 'new') {
    return persistSessionInTabStorage(generateSessionId(), true);
  }

  // Case 2: Specific session in URL ?session=<id>
  if (paramSession && paramSession.trim()) {
    return persistSessionInTabStorage(paramSession.trim(), false);
  }

  // Case 3: Re-reading from current tab's sessionStorage (e.g. page refresh)
  const storedInTab = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (storedInTab && storedInTab.trim()) {
    activeSessionIdCache = storedInTab.trim();
    return activeSessionIdCache;
  }

  // Case 4: Default for new tabs — always use default state without auto-creating sessions
  return persistSessionInTabStorage(DEFAULT_SESSION_ID, false);
}

export function getTabSessionName(): string {
  if (activeSessionNameCache) return activeSessionNameCache;
  const id = getTabSessionId();
  if (id === DEFAULT_SESSION_ID) return 'Default Session';
  return id.replace(/^session-/, 'Session ');
}

export function setTabSessionName(name: string): void {
  activeSessionNameCache = name;
}

export const sessionApi = {
  async listSessions(): Promise<SessionInfo[]> {
    return requestJson<SessionInfo[]>(
      '/api/sessions',
      { method: 'GET', cache: 'no-store' },
      'Failed to list sessions.'
    );
  },

  async getSession(id: string): Promise<SessionData> {
    const data = await requestJson<SessionData>(
      `/api/sessions/${encodeURIComponent(id)}`,
      { method: 'GET', cache: 'no-store' },
      'Failed to load session.'
    );
    setTabSessionName(data.name);
    return data;
  },

  async saveSession(id: string, payload: string, name?: string): Promise<void> {
    await requestJson<{ ok: boolean }>(
      `/api/sessions/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, name }),
      },
      'Failed to save session.'
    );
  },

  async createSession(name?: string, cloneFromId?: string): Promise<SessionData> {
    const data = await postJson<{ session: SessionData }>(
      '/api/sessions',
      { name, cloneFromId },
      'Failed to create session.'
    );
    return data.session;
  },

  async renameSession(id: string, newName: string): Promise<void> {
    await requestJson<{ ok: boolean }>(
      `/api/sessions/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      },
      'Failed to rename session.'
    );
    if (id === getTabSessionId()) {
      setTabSessionName(newName);
    }
  },

  async deleteSession(id: string): Promise<void> {
    await requestJson<{ ok: boolean }>(
      `/api/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      'Failed to delete session.'
    );
  },

  openSessionInNewTab(id?: string): void {
    const targetUrl = id ? `/?session=${encodeURIComponent(id)}` : '/?session=new';
    window.open(targetUrl, '_blank');
  },

  switchSessionInCurrentTab(id: string): void {
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    localStorage.setItem(LOCAL_STORAGE_LAST_SESSION, id);
    const newUrl = new URL(window.location.href);
    if (id === DEFAULT_SESSION_ID) {
      newUrl.searchParams.delete('session');
    } else {
      newUrl.searchParams.set('session', id);
    }
    window.location.href = newUrl.toString();
  },
};
