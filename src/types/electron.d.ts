import { ExplorerNode, FolderItem, NoteItem } from './index';

export interface ScanResult {
  rootName: string;
  rootPath: string;
  items: ExplorerNode[];
}

export interface ElectronSessionInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  folderCount?: number;
  noteCount?: number;
}

export interface ElectronSessionData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
  fs: {
    scanFolder: (folderPath: string) => Promise<ScanResult>;
    writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; path: string }>;
    createFile: (parentPath: string, name?: string, content?: string) => Promise<NoteItem>;
    createFolder: (parentPath: string, name?: string) => Promise<FolderItem>;
    renamePath: (oldPath: string, newPath: string) => Promise<string>;
    deletePath: (targetPath: string) => Promise<{ ok: boolean }>;
    getRawUrl: (filePath: string) => string;
  };
  sessions: {
    list: () => Promise<ElectronSessionInfo[]>;
    get: (sessionId: string) => Promise<ElectronSessionData>;
    save: (sessionId: string, name: string | undefined, payload: string) => Promise<{ ok: boolean }>;
    delete: (sessionId: string) => Promise<{ ok: boolean }>;
  };
  state: {
    get: () => Promise<string | null>;
    save: (rawJson: string) => Promise<{ ok: boolean }>;
  };
  window?: {
    setTitleBarOverlay: (options: {
      color?: string;
      symbolColor?: string;
      height?: number;
    }) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

