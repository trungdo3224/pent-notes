import { ExplorerNode, FolderItem, NoteItem } from '../types';

export interface ScanResult {
  rootName: string;
  rootPath: string;
  items: ExplorerNode[];
}

export const fsApi = {
  async scanFolder(folderPath: string): Promise<ScanResult> {
    const res = await fetch('/api/fs/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to scan local folder.');
    }
    return res.json();
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    const res = await fetch('/api/fs/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save file to disk.');
    }
  },

  async createFile(
    parentPath: string,
    name?: string,
    content?: string
  ): Promise<NoteItem> {
    const res = await fetch('/api/fs/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath, name, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create file on disk.');
    }
    const data = await res.json();
    return data.note;
  },

  async createFolder(parentPath: string, name?: string): Promise<FolderItem> {
    const res = await fetch('/api/fs/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create folder on disk.');
    }
    const data = await res.json();
    return data.folder;
  },

  async renamePath(oldPath: string, newPath: string): Promise<string> {
    const res = await fetch('/api/fs/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to rename on disk.');
    }
    const data = await res.json();
    return data.path;
  },

  async deletePath(targetPath: string): Promise<void> {
    const res = await fetch('/api/fs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete on disk.');
    }
  },
};

