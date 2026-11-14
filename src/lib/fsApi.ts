import { ExplorerNode, FolderItem, NoteItem } from "../types";
import { postJson } from "./httpClient";

export interface ScanResult {
  rootName: string;
  rootPath: string;
  items: ExplorerNode[];
}

function getElectronFs() {
  return typeof window !== "undefined" ? window.electronAPI?.fs : undefined;
}

export const fsApi = {
  getRawFileUrl(filePath: string): string {
    const electronFs = getElectronFs();
    if (electronFs?.getRawUrl) {
      return electronFs.getRawUrl(filePath);
    }
    return `/api/fs/raw?path=${encodeURIComponent(filePath)}`;
  },

  async scanFolder(folderPath: string): Promise<ScanResult> {
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.scanFolder(folderPath);
    }
    return postJson<ScanResult>(
      "/api/fs/scan",
      { path: folderPath },
      "Failed to scan local folder.",
    );
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    const electronFs = getElectronFs();
    if (electronFs) {
      await electronFs.writeFile(filePath, content);
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
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.createFile(parentPath, name, content);
    }
    const data = await postJson<{ note: NoteItem }>(
      "/api/fs/create-file",
      { parentPath, name, content },
      "Failed to create file on disk.",
    );
    return data.note;
  },

  async createFolder(parentPath: string, name?: string): Promise<FolderItem> {
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.createFolder(parentPath, name);
    }
    const data = await postJson<{ folder: FolderItem }>(
      "/api/fs/create-folder",
      { parentPath, name },
      "Failed to create folder on disk.",
    );
    return data.folder;
  },

  async renamePath(oldPath: string, newPath: string): Promise<string> {
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.renamePath(oldPath, newPath);
    }
    const data = await postJson<{ path: string }>(
      "/api/fs/rename",
      { oldPath, newPath },
      "Failed to rename on disk.",
    );
    return data.path;
  },

  async deletePath(targetPath: string): Promise<void> {
    const electronFs = getElectronFs();
    if (electronFs) {
      await electronFs.deletePath(targetPath);
      return;
    }
    await postJson<{ ok: boolean }>(
      "/api/fs/delete",
      { path: targetPath },
      "Failed to delete on disk.",
    );
  },

  async readFile(filePath: string): Promise<string> {
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.readFile(filePath);
    }
    const data = await postJson<{ content: string }>(
      "/api/fs/read-file",
      { path: filePath },
      "Failed to read file from disk.",
    );
    return data.content;
  },

  async readDir(dirPath: string): Promise<ExplorerNode[]> {
    const electronFs = getElectronFs();
    if (electronFs) {
      return await electronFs.readDir(dirPath);
    }
    const data = await postJson<{ items: ExplorerNode[] }>(
      "/api/fs/read-dir",
      { path: dirPath },
      "Failed to read directory.",
    );
    return data.items;
  },

  async saveImage(
    parentDir: string,
    fileName: string,
    base64Data: string,
  ): Promise<{ ok: boolean; absolutePath: string; relativePath: string }> {
    const electronFs = getElectronFs();
    if (electronFs?.saveImage) {
      return await electronFs.saveImage(parentDir, fileName, base64Data);
    }
    throw new Error("Native filesystem image saving is not available");
  },
};
