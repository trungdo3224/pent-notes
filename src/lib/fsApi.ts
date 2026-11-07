import { ExplorerNode, FolderItem, NoteItem } from "../types";
import { postJson } from "./httpClient";

export interface ScanResult {
  rootName: string;
  rootPath: string;
  items: ExplorerNode[];
}

export const fsApi = {
  async scanFolder(folderPath: string): Promise<ScanResult> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.scanFolder(folderPath);
    }
    return postJson<ScanResult>(
      "/api/fs/scan",
      { path: folderPath },
      "Failed to scan local folder.",
    );
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      await window.electronAPI.fs.writeFile(filePath, content);
      return;
    }
    await postJson<{ ok: boolean }>(
      "/api/fs/write-file",
      { path: filePath, content },
      "Failed to save file to disk.",
    );
  },

  async createFile(
    parentPath: string,
    name?: string,
    content?: string,
  ): Promise<NoteItem> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.createFile(parentPath, name, content);
    }
    const data = await postJson<{ note: NoteItem }>(
      "/api/fs/create-file",
      { parentPath, name, content },
      "Failed to create file on disk.",
    );
    return data.note;
  },

  async createFolder(parentPath: string, name?: string): Promise<FolderItem> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.createFolder(parentPath, name);
    }
    const data = await postJson<{ folder: FolderItem }>(
      "/api/fs/create-folder",
      { parentPath, name },
      "Failed to create folder on disk.",
    );
    return data.folder;
  },

  async renamePath(oldPath: string, newPath: string): Promise<string> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.renamePath(oldPath, newPath);
    }
    const data = await postJson<{ path: string }>(
      "/api/fs/rename",
      { oldPath, newPath },
      "Failed to rename on disk.",
    );
    return data.path;
  },

  async deletePath(targetPath: string): Promise<void> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      await window.electronAPI.fs.deletePath(targetPath);
      return;
    }
    await postJson<{ ok: boolean }>(
      "/api/fs/delete",
      { path: targetPath },
      "Failed to delete on disk.",
    );
  },

  async readFile(filePath: string): Promise<string> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.readFile(filePath);
    }
    const data = await postJson<{ content: string }>(
      "/api/fs/read-file",
      { path: filePath },
      "Failed to read file from disk.",
    );
    return data.content;
  },

  async readDir(dirPath: string): Promise<ExplorerNode[]> {
    if (typeof window !== "undefined" && window.electronAPI?.fs) {
      return await window.electronAPI.fs.readDir(dirPath);
    }
    const data = await postJson<{ items: ExplorerNode[] }>(
      "/api/fs/read-dir",
      { path: dirPath },
      "Failed to read directory.",
    );
    return data.items;
  },
};
