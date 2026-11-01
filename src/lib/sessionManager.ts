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
const PULSE_KEY = 'pentnotes_tab_pulse';
const DEFAULT_SESSION_ID = 'default';
const TAB_PULSE_INTERVAL_MS = 1000;
const ACTIVE_TAB_THRESHOLD_MS = 2500;

function generateSessionId(): string {
  return createId('session');
}

function updateUrlSessionParam(sessionId: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('session', sessionId);
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

// Start tab pulse for detecting concurrent tabs
if (typeof window !== 'undefined') {
  const pulse = () => {
    try {
      localStorage.setItem(PULSE_KEY, Date.now().toString());
    } catch {
      // Ignore restricted storage environments
    }
  };
  pulse();
  setInterval(pulse, TAB_PULSE_INTERVAL_MS);
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

  // Case 4: Brand new tab opened — check if another tab is currently active
  const lastPulse = Number(localStorage.getItem(PULSE_KEY) || '0');
  const isAnotherTabActive = Date.now() - lastPulse < ACTIVE_TAB_THRESHOLD_MS;

  const assignedId = isAnotherTabActive
    ? generateSessionId()
    : localStorage.getItem(LOCAL_STORAGE_LAST_SESSION) || DEFAULT_SESSION_ID;

  return persistSessionInTabStorage(assignedId, true);
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
    newUrl.searchParams.set('session', id);
    window.location.href = newUrl.toString();
  },
};
