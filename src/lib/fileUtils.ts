import { ExplorerNode, FolderItem, NoteItem } from '../types';

export const NOTE_FILE_ACCEPT = '.md,.markdown,.mdx,.txt,.pdf';
export const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;

export const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  '.obsidian',
  '.vscode',
  '.idea',
  'dist',
  'build',
  '__pycache__',
]);

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fileDateString(file: File): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toISOString().slice(0, 10);
  }
  return todayDateString();
}

export function stripNoteExtension(fileName: string): string {
  return fileName.replace(NOTE_EXT_REGEX, '').trim() || 'Untitled';
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled';
}

export function isSupportedNoteFile(fileName: string): boolean {
  return NOTE_EXT_REGEX.test(fileName);
}

export function isPdfFileName(fileName?: string): boolean {
  return Boolean(fileName?.toLowerCase().endsWith('.pdf'));
}

export function isPdfNote(note: Pick<NoteItem, 'fileType' | 'filePath' | 'pdfData'>): boolean {
  return Boolean(note.fileType === 'pdf' || isPdfFileName(note.filePath) || note.pdfData);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function buildNoteItemFromFile(file: File): Promise<NoteItem> {
  const isPdf = isPdfFileName(file.name);
  const pdfData = isPdf ? await readFileAsDataUrl(file) : undefined;
  const content = isPdf ? '' : await file.text();

  return {
    id: createId('note'),
    type: 'note',
    title: stripNoteExtension(file.name),
    content,
    fileType: isPdf ? 'pdf' : 'markdown',
    pdfData,
    updatedAt: fileDateString(file),
  };
}

export async function buildNoteItemsFromFiles(files: File[]): Promise<NoteItem[]> {
  const results: NoteItem[] = [];
  for (const file of files) {
    results.push(await buildNoteItemFromFile(file));
  }
  return results;
}

function ensureFolderPathInTree(container: ExplorerNode[], segments: string[]): ExplorerNode[] {
  let currentLevel = container;
  for (const segment of segments) {
    let existingFolder = currentLevel.find(
      (node): node is FolderItem => node.type === 'folder' && node.name === segment
    );
    if (!existingFolder) {
      existingFolder = {
        id: createId('sub'),
        type: 'folder',
        name: segment,
        children: [],
      };
      currentLevel.push(existingFolder);
    }
    currentLevel = existingFolder.children;
  }
  return currentLevel;
}

export async function buildExplorerTreeFromFiles(
  files: File[],
  customRootName?: string
): Promise<{ rootName: string; items: ExplorerNode[] }> {
  const firstRelativePath = (files[0]?.webkitRelativePath || files[0]?.name || '').replace(
    /\\/g,
    '/'
  );
  const firstParts = firstRelativePath.split('/').filter(Boolean);
  const detectedRoot = firstParts.length > 1 ? firstParts[0] : 'Imported Folder';
  const rootName = customRootName?.trim() || detectedRoot;

  const rootItems: ExplorerNode[] = [];

  for (const file of files) {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = relativePath.split('/').filter(Boolean);
    const innerParts = parts.length > 1 ? parts.slice(1) : parts;

    if (innerParts.some((seg) => seg.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(seg))) {
      continue;
    }

    const fileName = innerParts[innerParts.length - 1];
    if (!isSupportedNoteFile(fileName)) {
      continue;
    }

    const targetContainer = ensureFolderPathInTree(rootItems, innerParts.slice(0, -1));
    const noteItem = await buildNoteItemFromFile(file);
    targetContainer.push(noteItem);
  }

  return { rootName, items: rootItems };
}

