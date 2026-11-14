export interface MainSessionSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  folderCount: number;
  noteCount: number;
}

export interface MainSessionRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: string;
}

export function setDataDir(dirPath: string | null): void;
export function ensureSessionsDir(): Promise<void>;
export function listAllSessions(): Promise<MainSessionSummary[]>;
export function readSessionPayloadIfExists(
  sessionId: string,
): Promise<string | null>;
export function getOrSeedSession(
  sessionId: string,
  suggestedName?: string,
  cloneFromId?: string,
): Promise<MainSessionRecord>;
export function createSession(
  suggestedName?: string,
  cloneFromId?: string,
): Promise<MainSessionRecord>;
export function saveSession(
  sessionId: string,
  name?: string,
  payload?: unknown,
): Promise<{
  ok: boolean;
  session: { id: string; name: string; updatedAt: number };
}>;
export function deleteSession(sessionId: string): Promise<{ ok: boolean }>;
