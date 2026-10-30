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

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `session-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Start tab pulse for detecting concurrent tabs
if (typeof window !== 'undefined') {
  const pulse = () => {
    try {
      localStorage.setItem(PULSE_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };
  pulse();
  setInterval(pulse, 1000);
}

let activeSessionIdCache: string | null = null;
let activeSessionNameCache: string | null = null;

export function getTabSessionId(): string {
  if (typeof window === 'undefined') {
    return 'default';
  }

  if (activeSessionIdCache) {
    return activeSessionIdCache;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const paramSession = urlParams.get('session');

  // Case 1: Explicit ?session=new
  if (paramSession === 'new') {
    const newId = generateSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    localStorage.setItem(LOCAL_STORAGE_LAST_SESSION, newId);
    activeSessionIdCache = newId;

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('session', newId);
    window.history.replaceState({}, '', newUrl.toString());
    return newId;
  }

  // Case 2: Specific session in URL ?session=<id>
  if (paramSession && paramSession.trim()) {
    const trimmed = paramSession.trim();
    sessionStorage.setItem(SESSION_STORAGE_KEY, trimmed);
    localStorage.setItem(LOCAL_STORAGE_LAST_SESSION, trimmed);
    activeSessionIdCache = trimmed;
    return trimmed;
  }

  // Case 3: Re-reading from current tab's sessionStorage (e.g. page refresh)
  const storedInTab = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (storedInTab && storedInTab.trim()) {
    activeSessionIdCache = storedInTab.trim();
    return activeSessionIdCache;
  }

  // Case 4: Brand new tab opened!
  // Check if another tab is currently open (heartbeat pulse within last 2.5s)
  const now = Date.now();
  const lastPulse = Number(localStorage.getItem(PULSE_KEY) || '0');
  const isAnotherTabActive = now - lastPulse < 2500;

  let assignedId: string;
  if (isAnotherTabActive) {
    // Another tab is running -> Create a separate session for this new tab!
    assignedId = generateSessionId();
  } else {
    // Only tab running -> resume last active session or default
    assignedId = localStorage.getItem(LOCAL_STORAGE_LAST_SESSION) || 'default';
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, assignedId);
  localStorage.setItem(LOCAL_STORAGE_LAST_SESSION, assignedId);
  activeSessionIdCache = assignedId;

  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('session', assignedId);
  window.history.replaceState({}, '', newUrl.toString());

  return assignedId;
}

export function getTabSessionName(): string {
  if (activeSessionNameCache) return activeSessionNameCache;
  const id = getTabSessionId();
  if (id === 'default') return 'Default Session';
  return id.replace(/^session-/, 'Session ');
}

export function setTabSessionName(name: string): void {
  activeSessionNameCache = name;
}

export const sessionApi = {
  async listSessions(): Promise<SessionInfo[]> {
    const res = await fetch('/api/sessions', { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to list sessions.');
    }
    return res.json();
  },

  async getSession(id: string): Promise<SessionData> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load session.');
    }
    const data: SessionData = await res.json();
    setTabSessionName(data.name);
    return data;
  },

  async saveSession(id: string, payload: string, name?: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save session.');
    }
  },

  async createSession(name?: string, cloneFromId?: string): Promise<SessionData> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cloneFromId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create session.');
    }
    const data = await res.json();
    return data.session;
  },

  async renameSession(id: string, newName: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to rename session.');
    }
    if (id === getTabSessionId()) {
      setTabSessionName(newName);
    }
  },

  async deleteSession(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete session.');
    }
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

