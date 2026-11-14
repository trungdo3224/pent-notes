import type { ExplorerNode, FolderItem, NoteItem } from "../../types";

export function readDirectoryShallow(dirPath: string): Promise<ExplorerNode[]>;
export function scanFolder(
  folderPath: string,
): Promise<{ rootName: string; rootPath: string; items: ExplorerNode[] }>;
export function readFile(filePath: string): Promise<string>;
export function writeFile(
  filePath: string,
  content?: string,
): Promise<{ ok: boolean; path: string }>;
export function createFile(
  parentPath: string,
  name?: string,
  content?: string,
): Promise<NoteItem>;
export function createFolder(
  parentPath: string,
  name?: string,
): Promise<FolderItem>;
export function renamePath(oldPath: string, newPath: string): Promise<string>;
export function deletePath(targetPath: string): Promise<{ ok: boolean }>;
export function saveImage(
  parentDir: string,
  fileName: string,
  base64Data: string,
): Promise<{ ok: boolean; absolutePath: string; relativePath: string }>;
export function resolveLocalMediaPath(rawPath: string): Promise<string | null>;
