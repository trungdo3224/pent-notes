import { StoreApi } from "zustand";
import { createId, sanitizeFilename, todayDateString } from "../lib/fileUtils";
import { fsApi } from "../lib/fsApi";
import { getAllLeaves, updateLeafInTree } from "../lib/paneLayoutTree";
import {
  findAncestorFolderIds,
  findFolderNode,
  findNoteNode,
  insertIntoTree,
  updateNoteInTree,
} from "../lib/treeUtils";
import {
  ExplorerNode,
  NoteItem,
  PaneLayoutNode,
  PaneLeafNode,
  TabGroup,
  TabGroupColorId,
  TopLevelFolder,
} from "../types";
import { NotesState } from "./types";

export const DEFAULT_SIDEBAR_WIDTH = 280;
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 270;

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 600;
export const MAX_RIGHT_SIDEBAR_WIDTH = 500;

export const CONTENT_SAVE_DEBOUNCE_MS = 400;
export const TITLE_RENAME_DEBOUNCE_MS = 800;

export const TAB_GROUP_COLORS: TabGroupColorId[] = [
  "blue",
  "purple",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

// Timer maps for debounced disk operations
export const contentSaveTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
export const titleRenameTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

export function hasPendingDiskOperations(): boolean {
  return contentSaveTimers.size > 0 || titleRenameTimers.size > 0;
}

export function isNotePendingSave(
  noteId: string,
  filePath?: string | null,
): boolean {
  if (titleRenameTimers.has(noteId)) return true;
  if (filePath && contentSaveTimers.has(filePath)) return true;
  return false;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mapFolderById(
  folders: TopLevelFolder[],
  folderId: string | null,
  updater: (folder: TopLevelFolder) => TopLevelFolder,
): TopLevelFolder[] {
  if (!folderId) return folders;
  return folders.map((folder) =>
    folder.id === folderId ? updater(folder) : folder,
  );
}

export function resolveParentDiskPath(
  folder: TopLevelFolder,
  parentFolderId: string | null,
): string | null {
  if (!folder.localPath) return null;
  if (!parentFolderId) return folder.localPath;
  const sub = findFolderNode(folder.items, parentFolderId);
  return sub?.folderPath ?? folder.localPath;
}

export function getSelectedTopFolder(state: NotesState): TopLevelFolder | null {
  if (!state.selectedFolderId) return null;
  return state.folders.find((f) => f.id === state.selectedFolderId) ?? null;
}

export function areNodeTreesEqual(
  a: ExplorerNode[],
  b: ExplorerNode[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const nodeA = a[i];
    const nodeB = b[i];
    if (nodeA.id !== nodeB.id || nodeA.type !== nodeB.type) return false;
    if (nodeA.type === "note" && nodeB.type === "note") {
      if (
        nodeA.title !== nodeB.title ||
        nodeA.content !== nodeB.content ||
        nodeA.filePath !== nodeB.filePath ||
        nodeA.fileType !== nodeB.fileType ||
        nodeA.updatedAt !== nodeB.updatedAt
      ) {
        return false;
      }
    } else if (nodeA.type === "folder" && nodeB.type === "folder") {
      if (
        nodeA.name !== nodeB.name ||
        nodeA.folderPath !== nodeB.folderPath ||
        !areNodeTreesEqual(nodeA.children, nodeB.children)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function cleanupEmptyTabGroups(
  folders: TopLevelFolder[],
  tabGroups: TabGroup[],
): TabGroup[] {
  const firstIndexByGroup = new Map<string, number>();
  folders.forEach((f, idx) => {
    if (f.groupId && !firstIndexByGroup.has(f.groupId)) {
      firstIndexByGroup.set(f.groupId, idx);
    }
  });
  return tabGroups
    .filter((g) => firstIndexByGroup.has(g.id))
    .sort(
      (a, b) =>
        (firstIndexByGroup.get(a.id) ?? 0) - (firstIndexByGroup.get(b.id) ?? 0),
    );
}

/**
 * Triggers async lazy-loading of a disk-backed subfolder's children when expanded.
 */
export function triggerSubfolderLazyLoad(
  get: StoreApi<NotesState>["getState"],
  folderId: string | null,
  subfolderId: string,
): void {
  if (!folderId) return;
  const folder = get().folders.find((f) => f.id === folderId);
  if (!folder) return;
  const node = findFolderNode(folder.items, subfolderId);
  if (node?.folderPath) {
    void get().loadSubfolderChildren(folder.id, subfolderId, node.folderPath);
  }
}

export interface OpenNoteStateOptions {
  setSelectedFolder?: boolean;
  updateActivePane?: boolean;
  selectInSingleMode?: boolean;
}

/**
 * Computes the partial state patch for opening a note: ensures it appears in
 * openNotesByFolder, expands its ancestor folders, and updates either the active
 * split pane or the single-view selection.
 */
export function buildOpenNoteStateUpdate(
  state: NotesState,
  folderId: string,
  noteId: string,
  options: OpenNoteStateOptions = {},
): Partial<NotesState> {
  const {
    setSelectedFolder = false,
    updateActivePane = true,
    selectInSingleMode = true,
  } = options;

  const currentOpen = state.openNotesByFolder[folderId] ?? [];
  const nextOpen = currentOpen.includes(noteId)
    ? currentOpen
    : [...currentOpen, noteId];

  const targetFolder = state.folders.find((f) => f.id === folderId);
  const ancestorIds = targetFolder
    ? (findAncestorFolderIds(targetFolder.items, noteId) ?? [])
    : [];
  const ancestorSet = new Set(ancestorIds);
  const nextExpanded = Array.from(
    new Set([...(state.expandedFolderIds ?? []), ...ancestorIds]),
  );
  const nextCollapsed = state.collapsedSubfolderIds.filter(
    (id) => !ancestorSet.has(id),
  );

  const patch: Partial<NotesState> = {
    collapsedSubfolderIds: nextCollapsed,
    expandedFolderIds: nextExpanded,
    openNotesByFolder: {
      ...state.openNotesByFolder,
      [folderId]: nextOpen,
    },
  };

  if (setSelectedFolder) {
    patch.selectedFolderId = folderId;
  }

  const leaves = getAllLeaves(state.paneLayout);
  if (
    updateActivePane &&
    state.isSplitViewActive &&
    state.activePaneId &&
    state.paneLayout &&
    leaves.length > 1
  ) {
    const updatedLayout = updateLeafInTree(
      state.paneLayout,
      state.activePaneId,
      (leaf) => ({
        ...leaf,
        folderId,
        noteId,
      }),
    );
    const updatedLeaves = getAllLeaves(updatedLayout);
    patch.paneLayout = updatedLayout;
    if (state.activePaneId === updatedLeaves[0]?.id) {
      patch.selectedNoteByFolder = {
        ...state.selectedNoteByFolder,
        [folderId]: noteId,
      };
    }
    return patch;
  }

  if (selectInSingleMode) {
    patch.selectedNoteByFolder = {
      ...state.selectedNoteByFolder,
      [folderId]: noteId,
    };
  }

  return patch;
}

export interface InsertAndPersistNoteOptions {
  parentFolderId: string | null;
  title: string;
  content: string;
  cachedContent?: string;
  fileType?: NoteItem["fileType"];
  pdfData?: string;
  diskFileName?: string | null;
  syncFileTypeOnDisk?: boolean;
  setFocusNoteTitle?: boolean;
}

/**
 * Optimistically inserts a note into the currently selected folder and, when
 * disk-synced, creates the backing file via fsApi.
 */
export async function insertAndPersistNote(
  set: StoreApi<NotesState>["setState"],
  get: StoreApi<NotesState>["getState"],
  options: InsertAndPersistNoteOptions,
): Promise<string | null> {
  const {
    parentFolderId,
    title,
    content,
    cachedContent = content,
    fileType,
    pdfData,
    diskFileName,
    syncFileTypeOnDisk = false,
    setFocusNoteTitle = false,
  } = options;

  const state = get();
  const currentFolder = getSelectedTopFolder(state);
  if (!currentFolder) return null;

  const newNote: NoteItem = {
    id: createId("note"),
    type: "note",
    title,
    content,
    ...(fileType ? { fileType } : {}),
    ...(pdfData ? { pdfData } : {}),
    updatedAt: todayDateString(),
  };

  const nextCollapsed = parentFolderId
    ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
    : state.collapsedSubfolderIds;

  set((s) => ({
    activeNoteContents: {
      ...s.activeNoteContents,
      [newNote.id]: cachedContent,
    },
    folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
      ...folder,
      items: insertIntoTree(folder.items, parentFolderId, newNote),
    })),
    selectedNoteByFolder: {
      ...s.selectedNoteByFolder,
      [currentFolder.id]: newNote.id,
    },
    openNotesByFolder: {
      ...s.openNotesByFolder,
      [currentFolder.id]: [
        ...(s.openNotesByFolder[currentFolder.id] || []),
        newNote.id,
      ],
    },
    collapsedSubfolderIds: nextCollapsed,
    ...(setFocusNoteTitle ? { shouldFocusNoteTitle: true } : {}),
  }));

  const parentPath = resolveParentDiskPath(currentFolder, parentFolderId);
  if (parentPath && diskFileName) {
    try {
      const diskNote = await fsApi.createFile(
        parentPath,
        diskFileName,
        cachedContent,
      );
      set((s) => ({
        folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
          ...folder,
          items: updateNoteInTree(folder.items, newNote.id, {
            title: diskNote.title,
            filePath: diskNote.filePath,
            ...(syncFileTypeOnDisk && fileType ? { fileType } : {}),
          }),
        })),
      }));
    } catch (err) {
      console.error("Failed to create file on disk:", err);
    }
  }

  return newNote.id;
}

export function applyCloseTabs(
  state: NotesState,
  targetFolderId: string,
  filterFn: (noteId: string, index: number, all: string[]) => boolean,
  preferredSelectedId?: string | null,
): Partial<NotesState> {
  const currentOpen = state.openNotesByFolder[targetFolderId] || [];
  const nextOpen = currentOpen.filter(filterFn);
  const closedIds = currentOpen.filter((id) => !nextOpen.includes(id));

  let nextLayout = state.paneLayout;
  if (nextLayout) {
    let currentTree: PaneLayoutNode = nextLayout;
    const leaves = getAllLeaves(currentTree);
    for (const leaf of leaves) {
      if (
        leaf.noteId &&
        (closedIds.includes(leaf.noteId) ||
          !filterFn(leaf.noteId, -1, currentOpen))
      ) {
        if (!closedIds.includes(leaf.noteId)) {
          closedIds.push(leaf.noteId);
        }
        currentTree = updateLeafInTree(currentTree, leaf.id, (l) => ({
          ...l,
          noteId: null,
        }));
      }
    }
    nextLayout = currentTree;
  }

  if (
    nextOpen.length === currentOpen.length &&
    nextLayout === state.paneLayout
  ) {
    return {};
  }

  let nextSelected = state.selectedNoteByFolder[targetFolderId];

  if (nextOpen.length === 0) {
    nextSelected = null;
  } else if (!nextSelected || closedIds.includes(nextSelected)) {
    if (preferredSelectedId && nextOpen.includes(preferredSelectedId)) {
      nextSelected = preferredSelectedId;
    } else {
      const lastClosedIdx = nextSelected
        ? currentOpen.indexOf(nextSelected)
        : 0;
      if (lastClosedIdx >= nextOpen.length) {
        nextSelected = nextOpen[nextOpen.length - 1];
      } else {
        nextSelected = nextOpen[lastClosedIdx] ?? nextOpen[0];
      }
    }
  }

  const nextContents = { ...state.activeNoteContents };
  for (const id of closedIds) {
    delete nextContents[id];
  }

  return {
    activeNoteContents: nextContents,
    paneLayout: nextLayout,
    openNotesByFolder: {
      ...state.openNotesByFolder,
      [targetFolderId]: nextOpen,
    },
    selectedNoteByFolder: {
      ...state.selectedNoteByFolder,
      [targetFolderId]: nextSelected,
    },
  };
}

/**
 * Collapses split view down to single-pane mode, preserving selection from the
 * remaining leaf when present.
 */
export function exitSplitViewState(
  state: NotesState,
  remainingLeaf: PaneLeafNode | null,
): Partial<NotesState> {
  const baseReset: Partial<NotesState> = {
    paneLayout: null,
    activePaneId: null,
    isSplitViewActive: false,
  };
  if (remainingLeaf && remainingLeaf.folderId && remainingLeaf.noteId) {
    return {
      ...baseReset,
      selectedFolderId: remainingLeaf.folderId,
      selectedNoteByFolder: {
        ...state.selectedNoteByFolder,
        [remainingLeaf.folderId]: remainingLeaf.noteId,
      },
    };
  }
  return baseReset;
}

export function buildDuplicateDiskFilename(
  sourceNote: NoteItem,
  copyTitle: string,
): string | null {
  if (sourceNote.fileType === "pdf" || sourceNote.fileType === "image") {
    return null;
  }
  const oldExt = sourceNote.filePath?.includes(".")
    ? sourceNote.filePath.slice(sourceNote.filePath.lastIndexOf("."))
    : ".md";
  const ext = sourceNote.fileType === "code" ? oldExt : ".md";
  return `${sanitizeFilename(copyTitle)}${ext}`;
}

export function getActiveFolderIdForCloseTabs(
  state: NotesState,
  explicitFolderId?: string,
): string | null {
  return explicitFolderId || state.selectedFolderId;
}

export function findNoteInFolderOrNull(
  folder: TopLevelFolder | undefined,
  noteId: string,
): NoteItem | null {
  return folder ? findNoteNode(folder.items, noteId) : null;
}
