import { ExplorerNode, FolderItem, NoteItem, SortOrder, TopLevelFolder } from '../types';
import { todayDateString } from './fileUtils';

export type NoteUpdates = Partial<
  Pick<NoteItem, 'title' | 'content' | 'filePath' | 'fileType' | 'pdfData'>
>;

export type FolderUpdates = Partial<Pick<FolderItem, 'name' | 'folderPath'>>;

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortExplorerNodes(
  nodes: ExplorerNode[],
  order: SortOrder = 'name-asc'
): ExplorerNode[] {
  const folders = nodes.filter((node): node is FolderItem => node.type === 'folder');
  const notes = nodes.filter((node): node is NoteItem => node.type === 'note');

  if (order === 'name-desc') {
    folders.sort((a, b) => naturalCompare(b.name, a.name));
    notes.sort((a, b) => naturalCompare(b.title || 'Untitled', a.title || 'Untitled'));
  } else if (order === 'date-desc') {
    folders.sort((a, b) => naturalCompare(a.name, b.name));
    notes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } else if (order === 'date-asc') {
    folders.sort((a, b) => naturalCompare(a.name, b.name));
    notes.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
  } else {
    folders.sort((a, b) => naturalCompare(a.name, b.name));
    notes.sort((a, b) => naturalCompare(a.title || 'Untitled', b.title || 'Untitled'));
  }

  return [...folders, ...notes];
}

export function findDefaultNoteId(
  nodes: ExplorerNode[],
  order: SortOrder = 'name-asc'
): string | null {
  const sorted = sortExplorerNodes(nodes, order);
  for (const node of sorted) {
    if (node.type === 'note') return node.id;
  }
  for (const node of sorted) {
    if (node.type === 'folder') {
      const nestedId = findDefaultNoteId(node.children, order);
      if (nestedId) return nestedId;
    }
  }
  return null;
}

export function findNoteAndPath(
  nodes: ExplorerNode[],
  targetId: string,
  trail: string[]
): { note: NoteItem; path: string[] } | null {
  for (const node of nodes) {
    if (node.type === 'note' && node.id === targetId) {
      return { note: node, path: [...trail, node.title.trim() || 'Untitled'] };
    }
    if (node.type === 'folder') {
      const found = findNoteAndPath(node.children, targetId, [...trail, node.name]);
      if (found) return found;
    }
  }
  return null;
}

export function resolveActiveNoteData(
  folder: TopLevelFolder | null,
  selectedNoteByFolder: Record<string, string | null>,
  sortOrder: SortOrder = 'name-asc'
): { note: NoteItem; path: string[] } | null {
  if (!folder) return null;
  const preferredId = selectedNoteByFolder[folder.id];
  if (preferredId) {
    const found = findNoteAndPath(folder.items, preferredId, [folder.name]);
    if (found) return found;
  }
  const fallbackId = findDefaultNoteId(folder.items, sortOrder);
  if (fallbackId) {
    return findNoteAndPath(folder.items, fallbackId, [folder.name]);
  }
  return null;
}

export function findFolderNode(nodes: ExplorerNode[], folderId: string): FolderItem | null {
  for (const node of nodes) {
    if (node.type === 'folder') {
      if (node.id === folderId) return node;
      const found = findFolderNode(node.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

export function findNoteNode(nodes: ExplorerNode[], noteId: string): NoteItem | null {
  for (const node of nodes) {
    if (node.type === 'note' && node.id === noteId) {
      return node;
    }
    if (node.type === 'folder') {
      const found = findNoteNode(node.children, noteId);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeById(nodes: ExplorerNode[], targetId: string): ExplorerNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.type === 'folder') {
      const found = findNodeById(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function findAncestorFolderIds(
  nodes: ExplorerNode[],
  targetId: string,
  trail: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node.type === 'folder' ? [...trail, node.id] : trail;
    }
    if (node.type === 'folder') {
      const found = findAncestorFolderIds(node.children, targetId, [...trail, node.id]);
      if (found) return found;
    }
  }
  return null;
}

export function insertIntoTree(
  nodes: ExplorerNode[],
  parentFolderId: string | null,
  item: ExplorerNode
): ExplorerNode[] {
  if (!parentFolderId) {
    return [...nodes, item];
  }
  return nodes.map((node) => {
    if (node.type === 'folder') {
      if (node.id === parentFolderId) {
        return { ...node, children: [...node.children, item] };
      }
      return {
        ...node,
        children: insertIntoTree(node.children, parentFolderId, item),
      };
    }
    return node;
  });
}

export function updateNoteInTree(
  nodes: ExplorerNode[],
  noteId: string,
  updates: NoteUpdates
): ExplorerNode[] {
  return nodes.map((node) => {
    if (node.type === 'note' && node.id === noteId) {
      return {
        ...node,
        ...updates,
        updatedAt: todayDateString(),
      };
    }
    if (node.type === 'folder') {
      return {
        ...node,
        children: updateNoteInTree(node.children, noteId, updates),
      };
    }
    return node;
  });
}

export function updateFolderInTree(
  nodes: ExplorerNode[],
  folderId: string,
  updates: FolderUpdates
): ExplorerNode[] {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      if (node.id === folderId) {
        return { ...node, ...updates };
      }
      return {
        ...node,
        children: updateFolderInTree(node.children, folderId, updates),
      };
    }
    return node;
  });
}

export function removeNodeFromTree(nodes: ExplorerNode[], targetId: string): ExplorerNode[] {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) =>
      node.type === 'folder'
        ? { ...node, children: removeNodeFromTree(node.children, targetId) }
        : node
    );
}

/**
 * When scanning from disk, match nodes by filePath or folderPath to retain existing
 * stable IDs, so selected notes and open subfolders do not reset.
 */
export function matchAndPreserveIds(
  scannedNodes: ExplorerNode[],
  existingNodes: ExplorerNode[]
): ExplorerNode[] {
  const noteByPath = new Map<string, NoteItem>();
  const folderByPath = new Map<string, FolderItem>();

  function indexExisting(nodes: ExplorerNode[]) {
    for (const node of nodes) {
      if (node.type === 'note' && node.filePath) {
        noteByPath.set(node.filePath, node);
      } else if (node.type === 'folder' && node.folderPath) {
        folderByPath.set(node.folderPath, node);
        indexExisting(node.children);
      }
    }
  }
  indexExisting(existingNodes);

  function mapScanned(nodes: ExplorerNode[]): ExplorerNode[] {
    return nodes.map((node) => {
      if (node.type === 'note') {
        const existing = node.filePath ? noteByPath.get(node.filePath) : null;
        return existing ? { ...node, id: existing.id } : node;
      }
      const existing = node.folderPath ? folderByPath.get(node.folderPath) : null;
      return {
        ...node,
        id: existing ? existing.id : node.id,
        children: mapScanned(node.children),
      };
    });
  }

  return mapScanned(scannedNodes);
}

