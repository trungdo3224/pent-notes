import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ImportTargetMode } from '../components/ImportModal';
import { fsApi } from '../lib/fsApi';
import { getDirname, joinPath } from '../lib/pathUtils';
import {
  getTabSessionId,
  getTabSessionName,
  sessionApi,
  setTabSessionName,
} from '../lib/sessionManager';
import { workspaceStorage } from '../lib/storage';
import { applyTheme, initialTheme, saveTheme, ThemeId } from '../themes';
import {
  EditorViewMode,
  ExplorerNode,
  FolderItem,
  NoteItem,
  SortOrder,
  TopLevelFolder,
} from '../types';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileDateString(file: File): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toISOString().slice(0, 10);
  }
  return todayDateString();
}

function stripNoteExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdx|txt)$/i, '').trim() || 'Untitled';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled';
}

async function buildNoteItemsFromFiles(files: File[]): Promise<NoteItem[]> {
  const results: NoteItem[] = [];
  for (const file of files) {
    const content = await file.text();
    results.push({
      id: createId('note'),
      type: 'note',
      title: stripNoteExtension(file.name),
      content,
      updatedAt: fileDateString(file),
    });
  }
  return results;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortExplorerNodes(
  nodes: ExplorerNode[],
  order: SortOrder = 'name-asc'
): ExplorerNode[] {
  const folders = nodes.filter((n): n is FolderItem => n.type === 'folder');
  const notes = nodes.filter((n): n is NoteItem => n.type === 'note');

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
    // 'name-asc' (default): Natural alphanumeric and numeric order (1, 2, ..., 9, 10, A-Z)
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

function insertIntoTree(
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

function updateNoteInTree(
  nodes: ExplorerNode[],
  noteId: string,
  updates: Partial<Pick<NoteItem, 'title' | 'content' | 'filePath'>>
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

function updateFolderInTree(
  nodes: ExplorerNode[],
  folderId: string,
  updates: Partial<Pick<FolderItem, 'name' | 'folderPath'>>
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

function renameSubfolderInTree(
  nodes: ExplorerNode[],
  subfolderId: string,
  newName: string
): ExplorerNode[] {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      if (node.id === subfolderId) {
        return { ...node, name: newName };
      }
      return {
        ...node,
        children: renameSubfolderInTree(node.children, subfolderId, newName),
      };
    }
    return node;
  });
}

function removeNodeFromTree(nodes: ExplorerNode[], targetId: string): ExplorerNode[] {
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
function matchAndPreserveIds(
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
        if (existing) {
          return { ...node, id: existing.id };
        }
        return node;
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

// Timer maps for debounced disk operations
const contentSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const titleRenameTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface NotesState {
  // Persisted workspace state
  folders: TopLevelFolder[];
  selectedFolderId: string | null;
  selectedNoteByFolder: Record<string, string | null>;
  collapsedSubfolderIds: string[];
  viewMode: EditorViewMode;
  isSidebarCollapsed: boolean;
  isNavbarCollapsed: boolean;
  sidebarWidth: number;
  editorSplitRatio: number;
  sortOrder: SortOrder;
  theme: ThemeId;
  lastSyncTimeByFolder: Record<string, number>;

  // Transient UI state
  isHydrated: boolean;
  isThemeModalOpen: boolean;
  isLinkModalOpen: boolean;
  isSessionModalOpen: boolean;
  currentSessionId: string;
  currentSessionName: string;
  isSyncingFolderId: string | null;
  importModalMode: ImportTargetMode | null;
  pendingRenameFolderId: string | null;
  pendingRenameNodeId: string | null;
  shouldFocusNoteTitle: boolean;

  // Actions
  setHydrated: (hydrated: boolean) => void;
  selectFolder: (folderId: string) => void;
  createTopFolder: () => void;
  renameTopFolder: (folderId: string, newName: string) => void;
  deleteTopFolder: (folderId: string) => void;

  selectNote: (noteId: string) => void;
  createNote: (parentFolderId: string | null) => Promise<string | null>;
  createSubfolder: (parentFolderId: string | null) => Promise<string | null>;
  renameSubfolder: (subfolderId: string, newName: string) => void;
  deleteNode: (nodeId: string) => void;
  updateNote: (
    noteId: string,
    updates: Partial<Pick<NoteItem, 'title' | 'content' | 'filePath'>>
  ) => void;

  importNotes: (notes: NoteItem[]) => void;
  importNotesFiles: (files: File[]) => Promise<void>;
  importFolder: (
    rootName: string,
    items: ExplorerNode[],
    asTopLevel: boolean,
    localPath?: string
  ) => void;

  // Local folder direct two-way sync actions
  syncFolderFromDisk: (folderId: string) => Promise<boolean>;
  linkFolderToDisk: (folderId: string, localPath: string) => Promise<boolean>;
  unlinkFolderFromDisk: (folderId: string) => void;
  openLocalFolderAsTab: (localPath: string, customName?: string) => Promise<boolean>;

  toggleSubfolderCollapse: (subfolderId: string) => void;
  expandSubfolder: (subfolderId: string) => void;

  setViewMode: (mode: EditorViewMode) => void;
  toggleSidebar: () => void;
  toggleNavbar: () => void;
  setSidebarWidth: (width: number) => void;
  setEditorSplitRatio: (ratio: number) => void;
  setSortOrder: (order: SortOrder) => void;
  chooseTheme: (theme: ThemeId) => void;

  openImportModal: (mode: ImportTargetMode) => void;
  closeImportModal: () => void;
  openLinkModal: () => void;
  closeLinkModal: () => void;
  openSessionModal: () => void;
  closeSessionModal: () => void;
  setSessionName: (name: string) => void;
  openThemeModal: () => void;
  closeThemeModal: () => void;
  clearPendingRenameFolder: () => void;
  clearPendingRenameNode: () => void;
  clearFocusNoteTitle: () => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      folders: [],
      selectedFolderId: null,
      selectedNoteByFolder: {},
      collapsedSubfolderIds: [],
      viewMode: 'write',
      isSidebarCollapsed: false,
      isNavbarCollapsed: false,
      sidebarWidth: 280,
      editorSplitRatio: 50,
      sortOrder: 'name-asc',
      theme: initialTheme(),
      lastSyncTimeByFolder: {},

      isHydrated: false,
      isThemeModalOpen: false,
      isLinkModalOpen: false,
      isSessionModalOpen: false,
      currentSessionId: getTabSessionId(),
      currentSessionName: getTabSessionName(),
      isSyncingFolderId: null,
      importModalMode: null,
      pendingRenameFolderId: null,
      pendingRenameNodeId: null,
      shouldFocusNoteTitle: false,

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      selectFolder: (folderId) => set({ selectedFolderId: folderId }),

      createTopFolder: () => {
        const newFolder: TopLevelFolder = {
          id: createId('top'),
          name: 'Untitled Folder',
          items: [],
        };
        set((state) => ({
          folders: [...state.folders, newFolder],
          selectedFolderId: newFolder.id,
          pendingRenameFolderId: newFolder.id,
        }));
      },

      renameTopFolder: (folderId, newName) =>
        set((state) => ({
          folders: state.folders.map((f) => (f.id === folderId ? { ...f, name: newName } : f)),
        })),

      deleteTopFolder: (folderId) =>
        set((state) => {
          const index = state.folders.findIndex((f) => f.id === folderId);
          const nextFolders = state.folders.filter((f) => f.id !== folderId);
          let nextSelectedId = state.selectedFolderId;
          if (state.selectedFolderId === folderId) {
            const neighbor = nextFolders[index] ?? nextFolders[index - 1] ?? null;
            nextSelectedId = neighbor ? neighbor.id : null;
          }
          const nextNoteMap = { ...state.selectedNoteByFolder };
          delete nextNoteMap[folderId];
          return {
            folders: nextFolders,
            selectedFolderId: nextSelectedId,
            selectedNoteByFolder: nextNoteMap,
          };
        }),

      selectNote: (noteId) =>
        set((state) => {
          if (!state.selectedFolderId) return state;
          return {
            selectedNoteByFolder: {
              ...state.selectedNoteByFolder,
              [state.selectedFolderId]: noteId,
            },
          };
        }),

      createNote: async (parentFolderId) => {
        const state = get();
        if (!state.selectedFolderId) return null;
        const currentFolder = state.folders.find((f) => f.id === state.selectedFolderId);
        if (!currentFolder) return null;

        const newNote: NoteItem = {
          id: createId('note'),
          type: 'note',
          title: 'Untitled Note',
          content: '',
          updatedAt: todayDateString(),
        };

        const nextCollapsed = parentFolderId
          ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
          : state.collapsedSubfolderIds;

        set((s) => ({
          folders: s.folders.map((folder) =>
            folder.id === s.selectedFolderId
              ? { ...folder, items: insertIntoTree(folder.items, parentFolderId, newNote) }
              : folder
          ),
          selectedNoteByFolder: {
            ...s.selectedNoteByFolder,
            [s.selectedFolderId!]: newNote.id,
          },
          collapsedSubfolderIds: nextCollapsed,
          viewMode: s.viewMode === 'preview' ? 'write' : s.viewMode,
          shouldFocusNoteTitle: true,
        }));

        // If folder is linked to disk, create the file physically on disk
        if (currentFolder.localPath) {
          let parentPath = currentFolder.localPath;
          if (parentFolderId) {
            const sub = findFolderNode(currentFolder.items, parentFolderId);
            if (sub?.folderPath) {
              parentPath = sub.folderPath;
            }
          }

          try {
            const diskNote = await fsApi.createFile(parentPath, 'Untitled Note.md', '');
            set((s) => ({
              folders: s.folders.map((folder) => {
                if (folder.id !== s.selectedFolderId) return folder;
                return {
                  ...folder,
                  items: updateNoteInTree(folder.items, newNote.id, {
                    title: diskNote.title,
                    filePath: diskNote.filePath,
                  }),
                };
              }),
            }));
          } catch (err) {
            console.error('Failed to create file on disk:', err);
          }
        }

        return newNote.id;
      },

      createSubfolder: async (parentFolderId) => {
        const state = get();
        if (!state.selectedFolderId) return null;
        const currentFolder = state.folders.find((f) => f.id === state.selectedFolderId);
        if (!currentFolder) return null;

        const newSubfolder: FolderItem = {
          id: createId('sub'),
          type: 'folder',
          name: 'New Folder',
          children: [],
        };

        const nextCollapsed = parentFolderId
          ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
          : state.collapsedSubfolderIds;

        set((s) => ({
          folders: s.folders.map((folder) =>
            folder.id === s.selectedFolderId
              ? { ...folder, items: insertIntoTree(folder.items, parentFolderId, newSubfolder) }
              : folder
          ),
          collapsedSubfolderIds: nextCollapsed,
          pendingRenameNodeId: newSubfolder.id,
        }));

        // If folder is linked to disk, create folder physically on disk
        if (currentFolder.localPath) {
          let parentPath = currentFolder.localPath;
          if (parentFolderId) {
            const sub = findFolderNode(currentFolder.items, parentFolderId);
            if (sub?.folderPath) {
              parentPath = sub.folderPath;
            }
          }

          try {
            const diskFolder = await fsApi.createFolder(parentPath, newSubfolder.name);
            set((s) => ({
              folders: s.folders.map((folder) => {
                if (folder.id !== s.selectedFolderId) return folder;
                return {
                  ...folder,
                  items: updateFolderInTree(folder.items, newSubfolder.id, {
                    name: diskFolder.name,
                    folderPath: diskFolder.folderPath,
                  }),
                };
              }),
            }));
          } catch (err) {
            console.error('Failed to create folder on disk:', err);
          }
        }

        return newSubfolder.id;
      },

      renameSubfolder: (subfolderId, newName) => {
        const state = get();
        if (!state.selectedFolderId) return;
        const currentFolder = state.folders.find((f) => f.id === state.selectedFolderId);
        if (!currentFolder) return;

        const targetSubfolder = findFolderNode(currentFolder.items, subfolderId);
        const oldFolderPath = targetSubfolder?.folderPath;

        set((s) => ({
          folders: s.folders.map((folder) =>
            folder.id === s.selectedFolderId
              ? { ...folder, items: renameSubfolderInTree(folder.items, subfolderId, newName) }
              : folder
          ),
        }));

        // If on disk and path changed, rename on disk and re-scan to refresh all nested child paths
        if (oldFolderPath && currentFolder.localPath) {
          const parentDir = getDirname(oldFolderPath);
          const clean = sanitizeFilename(newName);
          const newFolderPath = joinPath(parentDir, clean);
          if (newFolderPath !== oldFolderPath) {
            fsApi
              .renamePath(oldFolderPath, newFolderPath)
              .then(() => {
                void get().syncFolderFromDisk(currentFolder.id);
              })
              .catch((err) => {
                console.error('Failed to rename folder on disk:', err);
              });
          }
        }
      },

      deleteNode: (nodeId) => {
        const state = get();
        if (!state.selectedFolderId) return;
        const currentFolder = state.folders.find((f) => f.id === state.selectedFolderId);
        if (!currentFolder) return;

        const nodeToDelete = findNodeById(currentFolder.items, nodeId);
        const diskPath =
          nodeToDelete?.type === 'note'
            ? nodeToDelete.filePath
            : (nodeToDelete as FolderItem | null)?.folderPath;

        set((s) => ({
          folders: s.folders.map((folder) =>
            folder.id === s.selectedFolderId
              ? { ...folder, items: removeNodeFromTree(folder.items, nodeId) }
              : folder
          ),
          collapsedSubfolderIds: s.collapsedSubfolderIds.filter((id) => id !== nodeId),
        }));

        if (diskPath) {
          fsApi.deletePath(diskPath).catch((err) => {
            console.error('Failed to delete path on disk:', err);
          });
        }
      },

      updateNote: (noteId, updates) => {
        const state = get();
        if (!state.selectedFolderId) return;
        const currentFolder = state.folders.find((f) => f.id === state.selectedFolderId);
        if (!currentFolder) return;

        const targetNote = findNoteNode(currentFolder.items, noteId);

        set((s) => ({
          folders: s.folders.map((folder) =>
            folder.id === s.selectedFolderId
              ? { ...folder, items: updateNoteInTree(folder.items, noteId, updates) }
              : folder
          ),
        }));

        if (targetNote?.filePath) {
          // Debounced content save
          if (updates.content !== undefined) {
            const existing = contentSaveTimers.get(targetNote.filePath);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(async () => {
              contentSaveTimers.delete(targetNote.filePath!);
              try {
                await fsApi.writeFile(targetNote.filePath!, updates.content!);
              } catch (err) {
                console.error('Failed to write file to disk:', err);
              }
            }, 400);
            contentSaveTimers.set(targetNote.filePath, timer);
          }

          // Debounced title rename
          if (
            updates.title !== undefined &&
            updates.title.trim() &&
            updates.title !== targetNote.title
          ) {
            const oldPath = targetNote.filePath;
            const existing = titleRenameTimers.get(noteId);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(async () => {
              titleRenameTimers.delete(noteId);
              try {
                const dir = getDirname(oldPath);
                const cleanName = sanitizeFilename(updates.title!.trim());
                const newPath = joinPath(dir, `${cleanName}.md`);
                if (newPath !== oldPath) {
                  const actualPath = await fsApi.renamePath(oldPath, newPath);
                  set((s) => ({
                    folders: s.folders.map((folder) =>
                      folder.id === s.selectedFolderId
                        ? {
                            ...folder,
                            items: updateNoteInTree(folder.items, noteId, {
                              filePath: actualPath,
                            }),
                          }
                        : folder
                    ),
                  }));
                }
              } catch (err) {
                console.error('Failed to rename note file on disk:', err);
              }
            }, 800);
            titleRenameTimers.set(noteId, timer);
          }
        }
      },

      importNotes: (importedNotes) =>
        set((state) => {
          if (importedNotes.length === 0) return state;
          const firstNoteId = importedNotes[0].id;

          if (!state.selectedFolderId) {
            const newTopFolder: TopLevelFolder = {
              id: createId('top'),
              name: 'Imported',
              items: importedNotes,
            };
            return {
              folders: [...state.folders, newTopFolder],
              selectedFolderId: newTopFolder.id,
              selectedNoteByFolder: {
                ...state.selectedNoteByFolder,
                [newTopFolder.id]: firstNoteId,
              },
            };
          }

          return {
            folders: state.folders.map((folder) =>
              folder.id === state.selectedFolderId
                ? { ...folder, items: [...folder.items, ...importedNotes] }
                : folder
            ),
            selectedNoteByFolder: {
              ...state.selectedNoteByFolder,
              [state.selectedFolderId]: firstNoteId,
            },
          };
        }),

      importNotesFiles: async (files) => {
        if (files.length === 0) return;
        const notes = await buildNoteItemsFromFiles(files);
        get().importNotes(notes);
      },

      importFolder: (rootName, items, asTopLevel, localPath) =>
        set((state) => {
          if (asTopLevel || !state.selectedFolderId) {
            const newTopFolder: TopLevelFolder = {
              id: createId('top'),
              name: rootName,
              items,
              localPath,
            };
            const firstNoteId = findDefaultNoteId(newTopFolder.items, state.sortOrder);
            return {
              folders: [...state.folders, newTopFolder],
              selectedFolderId: newTopFolder.id,
              selectedNoteByFolder: {
                ...state.selectedNoteByFolder,
                [newTopFolder.id]: firstNoteId,
              },
              lastSyncTimeByFolder: localPath
                ? {
                    ...state.lastSyncTimeByFolder,
                    [newTopFolder.id]: Date.now(),
                  }
                : state.lastSyncTimeByFolder,
            };
          }

          const newSubfolder: FolderItem = {
            id: createId('sub'),
            type: 'folder',
            name: rootName,
            children: items,
            folderPath: localPath,
          };
          const firstNoteId = findDefaultNoteId(newSubfolder.children, state.sortOrder);
          return {
            folders: state.folders.map((folder) =>
              folder.id === state.selectedFolderId
                ? { ...folder, items: [...folder.items, newSubfolder] }
                : folder
            ),
            selectedNoteByFolder: firstNoteId
              ? {
                  ...state.selectedNoteByFolder,
                  [state.selectedFolderId]: firstNoteId,
                }
              : state.selectedNoteByFolder,
          };
        }),

      // Direct local folder operations
      syncFolderFromDisk: async (folderId: string): Promise<boolean> => {
        const folder = get().folders.find((f) => f.id === folderId);
        if (!folder || !folder.localPath) return false;

        set({ isSyncingFolderId: folderId });
        try {
          const result = await fsApi.scanFolder(folder.localPath);
          const mergedItems = matchAndPreserveIds(result.items, folder.items);

          set((state) => {
            const currentSelected = state.selectedNoteByFolder[folderId];
            let nextSelectedNote = currentSelected;
            if (!currentSelected || !findNodeById(mergedItems, currentSelected)) {
              nextSelectedNote = findDefaultNoteId(mergedItems, state.sortOrder);
            }

            return {
              folders: state.folders.map((f) =>
                f.id === folderId
                  ? {
                      ...f,
                      name: f.name === 'Untitled Folder' ? result.rootName : f.name,
                      items: mergedItems,
                      localPath: result.rootPath,
                    }
                  : f
              ),
              selectedNoteByFolder: {
                ...state.selectedNoteByFolder,
                [folderId]: nextSelectedNote,
              },
              lastSyncTimeByFolder: {
                ...state.lastSyncTimeByFolder,
                [folderId]: Date.now(),
              },
            };
          });
          return true;
        } catch (err) {
          console.error('Failed to sync folder from disk:', err);
          return false;
        } finally {
          set({ isSyncingFolderId: null });
        }
      },

      linkFolderToDisk: async (folderId: string, localPath: string): Promise<boolean> => {
        const folder = get().folders.find((f) => f.id === folderId);
        if (!folder) return false;

        set((state) => ({
          folders: state.folders.map((f) => (f.id === folderId ? { ...f, localPath } : f)),
        }));

        return await get().syncFolderFromDisk(folderId);
      },

      unlinkFolderFromDisk: (folderId: string) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === folderId ? { ...f, localPath: undefined } : f
          ),
        }));
      },

      openLocalFolderAsTab: async (localPath: string, customName?: string): Promise<boolean> => {
        try {
          const result = await fsApi.scanFolder(localPath);
          const newTopFolder: TopLevelFolder = {
            id: createId('top'),
            name: customName?.trim() || result.rootName || 'Local Notes',
            items: result.items,
            localPath: result.rootPath,
          };
          const firstNoteId = findDefaultNoteId(newTopFolder.items, get().sortOrder);

          set((state) => ({
            folders: [...state.folders, newTopFolder],
            selectedFolderId: newTopFolder.id,
            selectedNoteByFolder: {
              ...state.selectedNoteByFolder,
              [newTopFolder.id]: firstNoteId,
            },
            lastSyncTimeByFolder: {
              ...state.lastSyncTimeByFolder,
              [newTopFolder.id]: Date.now(),
            },
          }));
          return true;
        } catch (err) {
          console.error('Failed to open local folder as tab:', err);
          throw err;
        }
      },

      toggleSubfolderCollapse: (subfolderId) =>
        set((state) => {
          const exists = state.collapsedSubfolderIds.includes(subfolderId);
          return {
            collapsedSubfolderIds: exists
              ? state.collapsedSubfolderIds.filter((id) => id !== subfolderId)
              : [...state.collapsedSubfolderIds, subfolderId],
          };
        }),

      expandSubfolder: (subfolderId) =>
        set((state) => {
          if (!state.collapsedSubfolderIds.includes(subfolderId)) return state;
          return {
            collapsedSubfolderIds: state.collapsedSubfolderIds.filter((id) => id !== subfolderId),
          };
        }),

      setViewMode: (mode) => set({ viewMode: mode }),

      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleNavbar: () => set((state) => ({ isNavbarCollapsed: !state.isNavbarCollapsed })),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(600, Math.max(180, width)) }),
      setEditorSplitRatio: (ratio) =>
        set({ editorSplitRatio: Math.min(85, Math.max(15, ratio)) }),
      setSortOrder: (order) => set({ sortOrder: order }),

      chooseTheme: (nextTheme) => {
        applyTheme(nextTheme);
        saveTheme(nextTheme);
        set({ theme: nextTheme });
      },

      openImportModal: (mode) => set({ importModalMode: mode }),
      closeImportModal: () => set({ importModalMode: null }),
      openLinkModal: () => set({ isLinkModalOpen: true }),
      closeLinkModal: () => set({ isLinkModalOpen: false }),
      openSessionModal: () => set({ isSessionModalOpen: true }),
      closeSessionModal: () => set({ isSessionModalOpen: false }),
      setSessionName: (name) => {
        setTabSessionName(name);
        set({ currentSessionName: name });
        void sessionApi.renameSession(get().currentSessionId, name);
      },
      openThemeModal: () => set({ isThemeModalOpen: true }),
      closeThemeModal: () => set({ isThemeModalOpen: false }),
      clearPendingRenameFolder: () => set({ pendingRenameFolderId: null }),
      clearPendingRenameNode: () => set({ pendingRenameNodeId: null }),
      clearFocusNoteTitle: () => set({ shouldFocusNoteTitle: false }),
    }),
    {
      name: 'pentnotes-workspace-v1',
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (state) => ({
        folders: state.folders,
        selectedFolderId: state.selectedFolderId,
        selectedNoteByFolder: state.selectedNoteByFolder,
        collapsedSubfolderIds: state.collapsedSubfolderIds,
        viewMode: state.viewMode,
        isSidebarCollapsed: state.isSidebarCollapsed,
        isNavbarCollapsed: state.isNavbarCollapsed,
        sidebarWidth: state.sidebarWidth,
        editorSplitRatio: state.editorSplitRatio,
        sortOrder: state.sortOrder,
        theme: state.theme,
        lastSyncTimeByFolder: state.lastSyncTimeByFolder,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme);
          saveTheme(state.theme);
        }
        const sessionId = getTabSessionId();
        sessionApi
          .getSession(sessionId)
          .then((data) => {
            if (data?.name) {
              state?.setSessionName(data.name);
            }
          })
          .catch(() => {});
        state?.setHydrated(true);
      },
    }
  )
);
