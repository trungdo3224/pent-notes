import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  appendWikiLinkToContent,
  removeWikiLinkFromContent,
  resolveWorkspaceConnections,
} from "../lib/catalogUtils";
import {
  buildNoteItemsFromFiles,
  createId,
  isCodeFileName,
  sanitizeFilename,
  todayDateString,
} from "../lib/fileUtils";
import { fsApi } from "../lib/fsApi";
import { getDirname, joinPath } from "../lib/pathUtils";
import {
  getTabSessionId,
  getTabSessionName,
  sessionApi,
  setTabSessionName,
} from "../lib/sessionManager";
import { workspaceStorage } from "../lib/storage";
import {
  collectAllFolderIds,
  findAncestorFolderIds,
  findDefaultNoteId,
  findFolderNode,
  findNodeById,
  findNoteAndPath,
  findNoteNode,
  insertIntoTree,
  matchAndPreserveIds,
  normalizeExplorerNode,
  NoteUpdates,
  removeNodeFromTree,
  resolveActiveNoteData,
  sortExplorerNodes,
  updateFolderInTree,
  updateNoteInTree,
} from "../lib/treeUtils";
import { applyTheme, initialTheme, saveTheme, ThemeId } from "../themes";
import {
  applyFontSettings,
  DEFAULT_FONT_SETTINGS,
  FontSettings,
  initialFontSettings,
  saveFontSettings,
} from "../lib/fontSettings";
import {
  createBranchId,
  createLeafNode,
  findLeaf,
  getAllLeaves,
  removeLeafFromTree,
  resetBranchSizes,
  resizeBranchInTree,
  splitLeafInTree,
  toggleBranchDirection,
  updateLeafInTree,
} from "../lib/paneLayoutTree";
import {
  CatalogTab,
  ExplorerNode,
  FolderItem,
  LinkModalTargetMode,
  NoteItem,
  PaneLayoutNode,
  SortOrder,
  SplitDirection,
  TabGroup,
  TabGroupColorId,
  TopLevelFolder,
} from "../types";

export {
  collectAllFolderIds,
  findAncestorFolderIds,
  findFolderNode,
  findNoteAndPath,
  resolveActiveNoteData,
  sortExplorerNodes,
};

export const DEFAULT_SIDEBAR_WIDTH = 280;
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 270;

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;
const MAX_RIGHT_SIDEBAR_WIDTH = 500;

const CONTENT_SAVE_DEBOUNCE_MS = 400;
const TITLE_RENAME_DEBOUNCE_MS = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapFolderById(
  folders: TopLevelFolder[],
  folderId: string | null,
  updater: (folder: TopLevelFolder) => TopLevelFolder,
): TopLevelFolder[] {
  if (!folderId) return folders;
  return folders.map((folder) =>
    folder.id === folderId ? updater(folder) : folder,
  );
}

function resolveParentDiskPath(
  folder: TopLevelFolder,
  parentFolderId: string | null,
): string | null {
  if (!folder.localPath) return null;
  if (!parentFolderId) return folder.localPath;
  const sub = findFolderNode(folder.items, parentFolderId);
  return sub?.folderPath ?? folder.localPath;
}

// Timer maps for debounced disk operations
const contentSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const titleRenameTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hasPendingDiskOperations(): boolean {
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

function areNodeTreesEqual(a: ExplorerNode[], b: ExplorerNode[]): boolean {
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

const TAB_GROUP_COLORS: TabGroupColorId[] = [
  "blue",
  "purple",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

function cleanupEmptyTabGroups(
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

export interface NotesState {
  // Persisted workspace state
  folders: TopLevelFolder[];
  tabGroups: TabGroup[];
  selectedFolderId: string | null;
  selectedNoteByFolder: Record<string, string | null>;
  openNotesByFolder: Record<string, string[]>;
  collapsedSubfolderIds: string[];
  expandedFolderIds: string[];
  isSidebarCollapsed: boolean;
  isNavbarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  sidebarWidth: number;
  rightSidebarWidth: number;
  rightSidebarTab: CatalogTab;
  sortOrder: SortOrder;
  theme: ThemeId;
  lastSyncTimeByFolder: Record<string, number>;

  // Multi-file Split View state (VS Code & Obsidian style recursive multi-pane)
  paneLayout: PaneLayoutNode | null;
  activePaneId: string | null;
  isSplitViewActive: boolean;
  splitDirection: SplitDirection;

  // RFC-042 Pillar 1: Decoupled working document content
  activeNoteContents: Record<string, string>;
  loadingNoteIds: Record<string, boolean>;

  // Transient UI state
  isHydrated: boolean;
  isSettingsModalOpen: boolean;
  settingsActiveTab: "theme" | "fonts" | "layout";
  fontSettings: FontSettings;
  isLinkModalOpen: boolean;
  linkModalTargetMode: LinkModalTargetMode;
  isSessionModalOpen: boolean;
  currentSessionId: string;
  currentSessionName: string;
  isSyncingFolderId: string | null;
  pendingRenameFolderId: string | null;
  pendingRenameGroupId: string | null;
  pendingRenameNodeId: string | null;
  shouldFocusNoteTitle: boolean;

  // Actions
  setHydrated: (hydrated: boolean) => void;
  selectFolder: (folderId: string) => void;
  createTopFolder: () => void;
  renameTopFolder: (folderId: string, newName: string) => void;
  deleteTopFolder: (folderId: string) => void;
  reorderTopFolders: (
    draggedFolderId: string,
    targetFolderId: string,
    position: "before" | "after",
    targetGroupId?: string | null,
  ) => void;
  reorderTabGroup: (
    draggedGroupId: string,
    targetId: string,
    targetKind: "folder" | "group",
    position: "before" | "after",
  ) => void;
  createTabGroupFromFolder: (
    folderId: string,
    name?: string,
    color?: TabGroupColorId,
  ) => string;
  assignFolderToTabGroup: (folderId: string, groupId: string | null) => void;
  renameTabGroup: (groupId: string, newName: string) => void;
  setTabGroupColor: (groupId: string, color: TabGroupColorId) => void;
  toggleTabGroupCollapse: (groupId: string) => void;
  ungroupTabGroup: (groupId: string) => void;
  deleteTabGroupAndFolders: (groupId: string) => void;
  clearPendingRenameGroup: () => void;

  selectNote: (noteId: string) => void;
  loadNoteContent: (noteId: string, filePath?: string) => Promise<string>;
  loadSubfolderChildren: (
    folderId: string,
    subfolderId: string,
    subfolderPath: string,
  ) => Promise<void>;
  closeNoteTab: (noteId: string, folderId?: string) => void;
  closeOtherNoteTabs: (noteId: string, folderId?: string) => void;
  closeNotesToTheRight: (noteId: string, folderId?: string) => void;
  closeSavedNoteTabs: (folderId?: string) => void;
  closeAllNoteTabs: (folderId?: string) => void;
  navigateToNote: (topFolderId: string, noteId: string) => void;
  toggleNoteLink: (activeNoteId: string, targetNoteId: string) => Promise<void>;
  createNote: (parentFolderId: string | null) => Promise<string | null>;
  createCodeFile: (
    parentFolderId: string | null,
    customFileName?: string,
  ) => Promise<string | null>;
  duplicateNote: (
    noteId: string,
    parentFolderId: string | null,
  ) => Promise<string | null>;
  createSubfolder: (parentFolderId: string | null) => Promise<string | null>;
  renameSubfolder: (subfolderId: string, newName: string) => void;
  deleteNode: (nodeId: string) => void;
  updateNote: (noteId: string, updates: NoteUpdates) => void;

  // Multi-file Split View actions (VS Code & Obsidian style recursive multi-pane)
  splitPane: (
    direction: SplitDirection,
    targetFolderId?: string,
    targetNoteId?: string,
    fromPaneId?: string,
  ) => void;
  toggleSplitDirection: (branchId?: string) => void;
  closePane: (pane?: string | "primary" | "secondary") => void;
  closeOtherPanes: (keepPaneId?: string) => void;
  toggleSplitView: () => void;
  openInSplitView: (
    folderId: string,
    noteId: string,
    direction?: SplitDirection,
  ) => void;
  closeSplitView: () => void;
  setActivePaneId: (paneId: string) => void;
  setPaneNote: (paneId: string, folderId: string, noteId: string) => void;
  resizePaneBranch: (
    branchId: string,
    dividerIndex: number,
    deltaRatio: number,
  ) => void;
  resetPaneSizes: (branchId?: string) => void;

  collapseAllSubfolders: () => void;
  expandAllSubfolders: () => void;
  toggleCollapseAllSubfolders: () => void;

  importNotes: (notes: NoteItem[]) => void;
  importNotesFiles: (files: File[]) => Promise<void>;
  importFolder: (
    rootName: string,
    items: ExplorerNode[],
    placement: boolean | LinkModalTargetMode,
    localPath?: string,
  ) => void;

  // Local folder direct two-way sync actions
  syncFolderFromDisk: (folderId: string) => Promise<boolean>;
  linkFolderToDisk: (folderId: string, localPath: string) => Promise<boolean>;
  unlinkFolderFromDisk: (folderId: string) => void;
  openLocalFolderAsTab: (
    localPath: string,
    customName?: string,
  ) => Promise<boolean>;

  toggleSubfolderCollapse: (subfolderId: string) => void;
  expandSubfolder: (subfolderId: string) => void;

  toggleSidebar: () => void;
  toggleNavbar: () => void;
  toggleRightSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  resetLayoutWidths: () => void;
  setRightSidebarTab: (tab: CatalogTab) => void;
  setSortOrder: (order: SortOrder) => void;
  chooseTheme: (theme: ThemeId) => void;

  openLinkModal: (mode?: LinkModalTargetMode) => void;
  closeLinkModal: () => void;
  openSessionModal: () => void;
  closeSessionModal: () => void;
  setSessionName: (name: string) => void;
  openSettingsModal: (tab?: "theme" | "fonts" | "layout") => void;
  closeSettingsModal: () => void;
  setSettingsActiveTab: (tab: "theme" | "fonts" | "layout") => void;
  updateFontSettings: (updates: Partial<FontSettings>) => void;
  resetFontSettings: () => void;
  clearPendingRenameFolder: () => void;
  clearPendingRenameNode: () => void;
  clearFocusNoteTitle: () => void;
}

function getSelectedTopFolder(state: NotesState): TopLevelFolder | null {
  if (!state.selectedFolderId) return null;
  return state.folders.find((f) => f.id === state.selectedFolderId) ?? null;
}

function applyCloseTabs(
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

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      folders: [],
      tabGroups: [],
      selectedFolderId: null,
      selectedNoteByFolder: {},
      openNotesByFolder: {},
      collapsedSubfolderIds: [],
      expandedFolderIds: [],
      isSidebarCollapsed: false,
      isNavbarCollapsed: false,
      isRightSidebarCollapsed: false,
      isChatBoxOpen: false,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      rightSidebarWidth: DEFAULT_RIGHT_SIDEBAR_WIDTH,
      rightSidebarTab: "outline",
      sortOrder: "name-asc",
      theme: initialTheme(),
      lastSyncTimeByFolder: {},

      paneLayout: null,
      activePaneId: null,
      isSplitViewActive: false,
      splitDirection: "horizontal",
      activeNoteContents: {},
      loadingNoteIds: {},

      isHydrated: false,
      isSettingsModalOpen: false,
      settingsActiveTab: "theme",
      fontSettings: initialFontSettings(),
      isLinkModalOpen: false,
      linkModalTargetMode: "new-tab",
      isSessionModalOpen: false,
      currentSessionId: getTabSessionId(),
      currentSessionName: getTabSessionName(),
      isSyncingFolderId: null,
      pendingRenameFolderId: null,
      pendingRenameGroupId: null,
      pendingRenameNodeId: null,
      shouldFocusNoteTitle: false,

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      selectFolder: (folderId) => {
        set({ selectedFolderId: folderId });
        const target = get().folders.find((f) => f.id === folderId);
        if (target?.localPath) {
          void get().syncFolderFromDisk(folderId);
        }
      },

      createTopFolder: () => {
        const newFolder: TopLevelFolder = {
          id: createId("top"),
          name: "Untitled Folder",
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
          folders: mapFolderById(state.folders, folderId, (f) => ({
            ...f,
            name: newName,
          })),
        })),

      reorderTopFolders: (
        draggedFolderId,
        targetFolderId,
        position,
        targetGroupId,
      ) =>
        set((state) => {
          if (draggedFolderId === targetFolderId) return state;
          const fromIndex = state.folders.findIndex(
            (f) => f.id === draggedFolderId,
          );
          const targetIndex = state.folders.findIndex(
            (f) => f.id === targetFolderId,
          );
          if (fromIndex === -1 || targetIndex === -1) return state;

          const nextFolders = [...state.folders];
          const [draggedFolder] = nextFolders.splice(fromIndex, 1);
          const targetFolder = state.folders[targetIndex];
          const resolvedGroupId =
            targetGroupId !== undefined
              ? (targetGroupId ?? undefined)
              : targetFolder.groupId;
          const updatedDraggedFolder: TopLevelFolder = {
            ...draggedFolder,
            groupId: resolvedGroupId,
          };

          const nextTargetIndex = nextFolders.findIndex(
            (f) => f.id === targetFolderId,
          );
          const insertIndex =
            position === "before" ? nextTargetIndex : nextTargetIndex + 1;
          nextFolders.splice(insertIndex, 0, updatedDraggedFolder);

          return {
            folders: nextFolders,
            tabGroups: cleanupEmptyTabGroups(nextFolders, state.tabGroups),
          };
        }),

      reorderTabGroup: (draggedGroupId, targetId, targetKind, position) =>
        set((state) => {
          if (targetKind === "group" && draggedGroupId === targetId)
            return state;

          const groupFolders = state.folders.filter(
            (f) => f.groupId === draggedGroupId,
          );
          if (groupFolders.length === 0) return state;

          const remainingFolders = state.folders.filter(
            (f) => f.groupId !== draggedGroupId,
          );
          let insertIndex = -1;

          if (targetKind === "group") {
            let firstTargetIdx = -1;
            let lastTargetIdx = -1;
            for (let i = 0; i < remainingFolders.length; i++) {
              if (remainingFolders[i].groupId === targetId) {
                if (firstTargetIdx === -1) firstTargetIdx = i;
                lastTargetIdx = i;
              }
            }
            if (firstTargetIdx === -1) return state;
            insertIndex =
              position === "before" ? firstTargetIdx : lastTargetIdx + 1;
          } else {
            const targetFolderIdx = remainingFolders.findIndex(
              (f) => f.id === targetId,
            );
            if (targetFolderIdx === -1) return state;
            const otherGroupId = remainingFolders[targetFolderIdx].groupId;
            if (otherGroupId) {
              let firstOtherIdx = -1;
              let lastOtherIdx = -1;
              for (let i = 0; i < remainingFolders.length; i++) {
                if (remainingFolders[i].groupId === otherGroupId) {
                  if (firstOtherIdx === -1) firstOtherIdx = i;
                  lastOtherIdx = i;
                }
              }
              insertIndex =
                position === "before" ? firstOtherIdx : lastOtherIdx + 1;
            } else {
              insertIndex =
                position === "before" ? targetFolderIdx : targetFolderIdx + 1;
            }
          }

          const nextFolders = [...remainingFolders];
          nextFolders.splice(insertIndex, 0, ...groupFolders);

          return {
            folders: nextFolders,
            tabGroups: cleanupEmptyTabGroups(nextFolders, state.tabGroups),
          };
        }),

      createTabGroupFromFolder: (folderId, name, color) => {
        const state = get();
        const nextColor =
          color ??
          TAB_GROUP_COLORS[state.tabGroups.length % TAB_GROUP_COLORS.length];
        const newGroup: TabGroup = {
          id: createId("grp"),
          name: name?.trim() || `Group ${state.tabGroups.length + 1}`,
          color: nextColor,
          collapsed: false,
        };
        set((s) => {
          const nextFolders = mapFolderById(s.folders, folderId, (f) => ({
            ...f,
            groupId: newGroup.id,
          }));
          return {
            folders: nextFolders,
            tabGroups: cleanupEmptyTabGroups(nextFolders, [
              ...s.tabGroups,
              newGroup,
            ]),
            pendingRenameGroupId: newGroup.id,
          };
        });
        return newGroup.id;
      },

      assignFolderToTabGroup: (folderId, groupId) =>
        set((state) => {
          const folderIndex = state.folders.findIndex((f) => f.id === folderId);
          if (folderIndex === -1) return state;

          const nextFolders = [...state.folders];
          const [targetFolder] = nextFolders.splice(folderIndex, 1);
          const updatedFolder: TopLevelFolder = {
            ...targetFolder,
            groupId: groupId ?? undefined,
          };

          if (groupId) {
            let lastMemberIndex = -1;
            for (let i = 0; i < nextFolders.length; i++) {
              if (nextFolders[i].groupId === groupId) {
                lastMemberIndex = i;
              }
            }
            const insertAt =
              lastMemberIndex !== -1 ? lastMemberIndex + 1 : folderIndex;
            nextFolders.splice(insertAt, 0, updatedFolder);
            return {
              folders: nextFolders,
              tabGroups: cleanupEmptyTabGroups(
                nextFolders,
                state.tabGroups.map((g) =>
                  g.id === groupId ? { ...g, collapsed: false } : g,
                ),
              ),
            };
          } else {
            let lastSiblingIndex = folderIndex;
            const prevGroupId = targetFolder.groupId;
            if (prevGroupId) {
              for (let i = 0; i < nextFolders.length; i++) {
                if (nextFolders[i].groupId === prevGroupId) {
                  lastSiblingIndex = i + 1;
                }
              }
            }
            nextFolders.splice(lastSiblingIndex, 0, updatedFolder);
            return {
              folders: nextFolders,
              tabGroups: cleanupEmptyTabGroups(nextFolders, state.tabGroups),
            };
          }
        }),

      renameTabGroup: (groupId, newName) =>
        set((state) => ({
          tabGroups: state.tabGroups.map((g) =>
            g.id === groupId ? { ...g, name: newName.trim() || g.name } : g,
          ),
        })),

      setTabGroupColor: (groupId, color) =>
        set((state) => ({
          tabGroups: state.tabGroups.map((g) =>
            g.id === groupId ? { ...g, color } : g,
          ),
        })),

      toggleTabGroupCollapse: (groupId) =>
        set((state) => ({
          tabGroups: state.tabGroups.map((g) =>
            g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
          ),
        })),

      ungroupTabGroup: (groupId) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.groupId === groupId ? { ...f, groupId: undefined } : f,
          ),
          tabGroups: state.tabGroups.filter((g) => g.id !== groupId),
        })),

      deleteTabGroupAndFolders: (groupId) =>
        set((state) => {
          const removedFolderIds = new Set(
            state.folders.filter((f) => f.groupId === groupId).map((f) => f.id),
          );
          const nextFolders = state.folders.filter(
            (f) => f.groupId !== groupId,
          );
          const nextNoteMap = { ...state.selectedNoteByFolder };
          for (const id of removedFolderIds) {
            delete nextNoteMap[id];
          }
          const nextSelectedId =
            state.selectedFolderId &&
            removedFolderIds.has(state.selectedFolderId)
              ? (nextFolders[0]?.id ?? null)
              : state.selectedFolderId;
          return {
            folders: nextFolders,
            tabGroups: state.tabGroups.filter((g) => g.id !== groupId),
            selectedFolderId: nextSelectedId,
            selectedNoteByFolder: nextNoteMap,
          };
        }),

      clearPendingRenameGroup: () => set({ pendingRenameGroupId: null }),

      deleteTopFolder: (folderId) =>
        set((state) => {
          const index = state.folders.findIndex((f) => f.id === folderId);
          const nextFolders = state.folders.filter((f) => f.id !== folderId);
          let nextSelectedId = state.selectedFolderId;
          if (state.selectedFolderId === folderId) {
            const neighbor =
              nextFolders[index] ?? nextFolders[index - 1] ?? null;
            nextSelectedId = neighbor ? neighbor.id : null;
          }
          const nextNoteMap = { ...state.selectedNoteByFolder };
          delete nextNoteMap[folderId];
          return {
            folders: nextFolders,
            tabGroups: cleanupEmptyTabGroups(nextFolders, state.tabGroups),
            selectedFolderId: nextSelectedId,
            selectedNoteByFolder: nextNoteMap,
          };
        }),

      selectNote: (noteId) => {
        const state = get();
        if (!state.selectedFolderId) return;
        const targetFolder = state.folders.find(
          (f) => f.id === state.selectedFolderId,
        );
        const targetNote = targetFolder
          ? findNoteNode(targetFolder.items, noteId)
          : null;
        if (
          targetNote?.filePath &&
          targetNote.fileType !== "pdf" &&
          targetNote.fileType !== "image" &&
          state.activeNoteContents[noteId] === undefined
        ) {
          void get().loadNoteContent(noteId, targetNote.filePath);
        }

        set((s) => {
          if (!s.selectedFolderId) return s;
          const folderId = s.selectedFolderId;
          const currentOpen = s.openNotesByFolder[folderId] ?? [];
          const nextOpen = currentOpen.includes(noteId)
            ? currentOpen
            : [...currentOpen, noteId];

          const targetFolder = s.folders.find((f) => f.id === folderId);
          const ancestorIds = targetFolder
            ? (findAncestorFolderIds(targetFolder.items, noteId) ?? [])
            : [];
          const nextExpanded = Array.from(
            new Set([...(s.expandedFolderIds ?? []), ...ancestorIds]),
          );
          const ancestorSet = new Set(ancestorIds);
          const nextCollapsed = s.collapsedSubfolderIds.filter(
            (id) => !ancestorSet.has(id),
          );

          const leaves = getAllLeaves(s.paneLayout);
          if (s.isSplitViewActive && s.activePaneId && leaves.length > 1) {
            const updatedLayout = updateLeafInTree(
              s.paneLayout!,
              s.activePaneId,
              (l) => ({
                ...l,
                folderId: s.selectedFolderId,
                noteId,
              }),
            );
            const updatedLeaves = getAllLeaves(updatedLayout);
            return {
              paneLayout: updatedLayout,
              collapsedSubfolderIds: nextCollapsed,
              expandedFolderIds: nextExpanded,
              openNotesByFolder: {
                ...s.openNotesByFolder,
                [folderId]: nextOpen,
              },
              selectedNoteByFolder:
                s.activePaneId === updatedLeaves[0]?.id
                  ? { ...s.selectedNoteByFolder, [s.selectedFolderId]: noteId }
                  : s.selectedNoteByFolder,
            };
          }
          return {
            collapsedSubfolderIds: nextCollapsed,
            expandedFolderIds: nextExpanded,
            openNotesByFolder: {
              ...s.openNotesByFolder,
              [folderId]: nextOpen,
            },
            selectedNoteByFolder: {
              ...s.selectedNoteByFolder,
              [s.selectedFolderId]: noteId,
            },
          };
        });
      },

      loadNoteContent: async (noteId, filePath) => {
        const state = get();
        if (state.activeNoteContents[noteId] !== undefined) {
          return state.activeNoteContents[noteId];
        }
        if (state.loadingNoteIds[noteId]) {
          return "";
        }
        set((s) => ({
          loadingNoteIds: { ...s.loadingNoteIds, [noteId]: true },
        }));

        try {
          let content = "";
          if (filePath) {
            content = await fsApi.readFile(filePath);
          } else {
            for (const f of state.folders) {
              const n = findNoteNode(f.items, noteId);
              if (n && n.content) {
                content = n.content;
                break;
              }
            }
          }
          set((s) => {
            const nextLoading = { ...s.loadingNoteIds };
            delete nextLoading[noteId];
            return {
              activeNoteContents: {
                ...s.activeNoteContents,
                [noteId]: content,
              },
              loadingNoteIds: nextLoading,
            };
          });
          return content;
        } catch (err) {
          console.error(`Failed to load note content for ${noteId}:`, err);
          set((s) => {
            const nextLoading = { ...s.loadingNoteIds };
            delete nextLoading[noteId];
            return { loadingNoteIds: nextLoading };
          });
          return "";
        }
      },

      loadSubfolderChildren: async (folderId, subfolderId, subfolderPath) => {
        try {
          const rawChildren = await fsApi.readDir(subfolderPath);
          const currentFolder = get().folders.find((f) => f.id === folderId);
          const existingNode = currentFolder
            ? findFolderNode(currentFolder.items, subfolderId)
            : null;
          const mergedChildren = existingNode
            ? matchAndPreserveIds(rawChildren, existingNode.children || [])
            : rawChildren.map(normalizeExplorerNode);

          set((s) => ({
            folders: mapFolderById(s.folders, folderId, (folder) => ({
              ...folder,
              items: updateFolderInTree(folder.items, subfolderId, {
                children: mergedChildren,
                hasChildren: mergedChildren.length > 0,
                isLoaded: true,
              }),
            })),
          }));
        } catch (err) {
          console.error(
            `Failed to load subfolder children for ${subfolderId}:`,
            err,
          );
        }
      },

      closeNoteTab: (noteId, folderId) =>
        set((state) => {
          const targetFolderId = folderId || state.selectedFolderId;
          if (!targetFolderId) return state;
          return applyCloseTabs(state, targetFolderId, (id) => id !== noteId);
        }),

      closeOtherNoteTabs: (noteId, folderId) =>
        set((state) => {
          const targetFolderId = folderId || state.selectedFolderId;
          if (!targetFolderId) return state;
          return applyCloseTabs(
            state,
            targetFolderId,
            (id) => id === noteId,
            noteId,
          );
        }),

      closeNotesToTheRight: (noteId, folderId) =>
        set((state) => {
          const targetFolderId = folderId || state.selectedFolderId;
          if (!targetFolderId) return state;
          const currentOpen = state.openNotesByFolder[targetFolderId] || [];
          const anchorIdx = currentOpen.indexOf(noteId);
          if (anchorIdx === -1) return state;
          return applyCloseTabs(
            state,
            targetFolderId,
            (_id, idx) => idx <= anchorIdx,
            noteId,
          );
        }),

      closeSavedNoteTabs: (folderId) =>
        set((state) => {
          const targetFolderId = folderId || state.selectedFolderId;
          if (!targetFolderId) return state;
          const targetFolder = state.folders.find(
            (f) => f.id === targetFolderId,
          );
          return applyCloseTabs(state, targetFolderId, (id) => {
            const noteNode = targetFolder
              ? findNoteNode(targetFolder.items, id)
              : null;
            return isNotePendingSave(id, noteNode?.filePath);
          });
        }),

      closeAllNoteTabs: (folderId) =>
        set((state) => {
          const targetFolderId = folderId || state.selectedFolderId;
          if (!targetFolderId) return state;
          return applyCloseTabs(state, targetFolderId, () => false);
        }),

      navigateToNote: (topFolderId, noteId) =>
        set((state) => {
          const currentOpen = state.openNotesByFolder[topFolderId] ?? [];
          const nextOpen = currentOpen.includes(noteId)
            ? currentOpen
            : [...currentOpen, noteId];

          const targetTopFolder = state.folders.find(
            (f) => f.id === topFolderId,
          );
          const ancestors = targetTopFolder
            ? (findAncestorFolderIds(targetTopFolder.items, noteId) ?? [])
            : [];
          const ancestorSet = new Set(ancestors);
          const leaves = getAllLeaves(state.paneLayout);

          if (
            state.isSplitViewActive &&
            state.activePaneId &&
            leaves.length > 1
          ) {
            const updatedLayout = updateLeafInTree(
              state.paneLayout!,
              state.activePaneId,
              (l) => ({
                ...l,
                folderId: topFolderId,
                noteId,
              }),
            );
            const updatedLeaves = getAllLeaves(updatedLayout);
            const nextExpanded = Array.from(
              new Set([...(state.expandedFolderIds ?? []), ...ancestorSet]),
            );
            return {
              selectedFolderId: topFolderId,
              paneLayout: updatedLayout,
              collapsedSubfolderIds: state.collapsedSubfolderIds.filter(
                (id) => !ancestorSet.has(id),
              ),
              expandedFolderIds: nextExpanded,
              openNotesByFolder: {
                ...state.openNotesByFolder,
                [topFolderId]: nextOpen,
              },
              selectedNoteByFolder:
                state.activePaneId === updatedLeaves[0]?.id
                  ? { ...state.selectedNoteByFolder, [topFolderId]: noteId }
                  : state.selectedNoteByFolder,
            };
          }

          const nextExpanded = Array.from(
            new Set([...(state.expandedFolderIds ?? []), ...ancestorSet]),
          );
          return {
            selectedFolderId: topFolderId,
            expandedFolderIds: nextExpanded,
            openNotesByFolder: {
              ...state.openNotesByFolder,
              [topFolderId]: nextOpen,
            },
            selectedNoteByFolder: {
              ...state.selectedNoteByFolder,
              [topFolderId]: noteId,
            },
            collapsedSubfolderIds: state.collapsedSubfolderIds.filter(
              (id) => !ancestorSet.has(id),
            ),
          };
        }),

      toggleNoteLink: async (activeNoteId, targetNoteId) => {
        if (!activeNoteId || !targetNoteId || activeNoteId === targetNoteId)
          return;
        const state = get();

        let activeNote: NoteItem | null = null;
        let targetNote: NoteItem | null = null;
        for (const f of state.folders) {
          if (!activeNote) activeNote = findNoteNode(f.items, activeNoteId);
          if (!targetNote) targetNote = findNoteNode(f.items, targetNoteId);
        }
        if (!activeNote || !targetNote) return;

        const activeCurrentContent =
          state.activeNoteContents[activeNoteId] ??
          (activeNote.filePath
            ? await get().loadNoteContent(activeNoteId, activeNote.filePath)
            : activeNote.content);

        const targetCurrentContent =
          state.activeNoteContents[targetNoteId] ??
          (targetNote.filePath
            ? await get().loadNoteContent(targetNoteId, targetNote.filePath)
            : targetNote.content);

        const latestState = get();
        const connections = resolveWorkspaceConnections(
          latestState.folders,
          activeNoteId,
          activeCurrentContent,
          latestState.activeNoteContents,
        );
        const isCurrentlyLinked = connections.linkedNoteIds.has(targetNoteId);

        if (isCurrentlyLinked) {
          const nextActiveContent = removeWikiLinkFromContent(
            activeCurrentContent,
            targetNote.title,
          );
          const nextTargetContent = removeWikiLinkFromContent(
            targetCurrentContent,
            activeNote.title,
          );

          set((s) => ({
            activeNoteContents: {
              ...s.activeNoteContents,
              [activeNoteId]: nextActiveContent,
              [targetNoteId]: nextTargetContent,
            },
            folders: s.folders.map((folder) => ({
              ...folder,
              items: updateNoteInTree(
                updateNoteInTree(folder.items, activeNoteId, {
                  content: activeNote.filePath ? "" : nextActiveContent,
                }),
                targetNoteId,
                { content: targetNote.filePath ? "" : nextTargetContent },
              ),
            })),
          }));

          if (
            activeNote.filePath &&
            nextActiveContent !== activeCurrentContent
          ) {
            void fsApi
              .writeFile(activeNote.filePath, nextActiveContent)
              .catch((err) => {
                console.error(
                  "Failed to write unlinked active note to disk:",
                  err,
                );
              });
          }
          if (
            targetNote.filePath &&
            nextTargetContent !== targetCurrentContent
          ) {
            void fsApi
              .writeFile(targetNote.filePath, nextTargetContent)
              .catch((err) => {
                console.error(
                  "Failed to write unlinked target note to disk:",
                  err,
                );
              });
          }
        } else {
          const nextActiveContent = appendWikiLinkToContent(
            activeCurrentContent,
            targetNote.title,
          );

          set((s) => ({
            activeNoteContents: {
              ...s.activeNoteContents,
              [activeNoteId]: nextActiveContent,
            },
            folders: s.folders.map((folder) => ({
              ...folder,
              items: updateNoteInTree(folder.items, activeNoteId, {
                content: activeNote.filePath ? "" : nextActiveContent,
              }),
            })),
          }));

          if (activeNote.filePath) {
            void fsApi
              .writeFile(activeNote.filePath, nextActiveContent)
              .catch((err) => {
                console.error(
                  "Failed to write linked active note to disk:",
                  err,
                );
              });
          }
        }
      },

      createNote: async (parentFolderId) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return null;

        const newNote: NoteItem = {
          id: createId("note"),
          type: "note",
          title: "Untitled Note",
          content: "",
          updatedAt: todayDateString(),
        };

        const nextCollapsed = parentFolderId
          ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
          : state.collapsedSubfolderIds;

        set((s) => ({
          activeNoteContents: {
            ...s.activeNoteContents,
            [newNote.id]: "",
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
          shouldFocusNoteTitle: true,
        }));

        const parentPath = resolveParentDiskPath(currentFolder, parentFolderId);
        if (parentPath) {
          try {
            const diskNote = await fsApi.createFile(
              parentPath,
              "Untitled Note.md",
              "",
            );
            set((s) => ({
              folders: mapFolderById(
                s.folders,
                s.selectedFolderId,
                (folder) => ({
                  ...folder,
                  items: updateNoteInTree(folder.items, newNote.id, {
                    title: diskNote.title,
                    filePath: diskNote.filePath,
                  }),
                }),
              ),
            }));
          } catch (err) {
            console.error("Failed to create file on disk:", err);
          }
        }

        return newNote.id;
      },

      createCodeFile: async (parentFolderId, customFileName) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return null;

        const rawFileName = customFileName?.trim() || "script.py";
        const newNote: NoteItem = {
          id: createId("note"),
          type: "note",
          title: rawFileName,
          content: "",
          fileType: "code",
          updatedAt: todayDateString(),
        };

        const nextCollapsed = parentFolderId
          ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
          : state.collapsedSubfolderIds;

        set((s) => ({
          activeNoteContents: {
            ...s.activeNoteContents,
            [newNote.id]: "",
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
          shouldFocusNoteTitle: true,
        }));

        const parentPath = resolveParentDiskPath(currentFolder, parentFolderId);
        if (parentPath) {
          try {
            const diskNote = await fsApi.createFile(
              parentPath,
              rawFileName,
              "",
            );
            set((s) => ({
              folders: mapFolderById(
                s.folders,
                s.selectedFolderId,
                (folder) => ({
                  ...folder,
                  items: updateNoteInTree(folder.items, newNote.id, {
                    title: diskNote.title,
                    filePath: diskNote.filePath,
                    fileType: "code",
                  }),
                }),
              ),
            }));
          } catch (err) {
            console.error("Failed to create code file on disk:", err);
          }
        }

        return newNote.id;
      },

      duplicateNote: async (noteId, parentFolderId) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return null;

        const sourceNote = findNoteNode(currentFolder.items, noteId);
        if (!sourceNote) return null;

        const sourceContent =
          state.activeNoteContents[noteId] ??
          (sourceNote.filePath && sourceNote.fileType !== "pdf"
            ? await get().loadNoteContent(noteId, sourceNote.filePath)
            : sourceNote.content);

        const copyTitle = `${(sourceNote.title || "Untitled").trim()} (Copy)`;
        const parentPath = resolveParentDiskPath(currentFolder, parentFolderId);
        const duplicated: NoteItem = {
          id: createId("note"),
          type: "note",
          title: copyTitle,
          content: parentPath ? "" : sourceContent,
          fileType: sourceNote.fileType,
          pdfData: sourceNote.pdfData,
          updatedAt: todayDateString(),
        };

        set((s) => ({
          activeNoteContents: {
            ...s.activeNoteContents,
            [duplicated.id]: sourceContent,
          },
          folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
            ...folder,
            items: insertIntoTree(folder.items, parentFolderId, duplicated),
          })),
          selectedNoteByFolder: {
            ...s.selectedNoteByFolder,
            [currentFolder.id]: duplicated.id,
          },
          openNotesByFolder: {
            ...s.openNotesByFolder,
            [currentFolder.id]: [
              ...(s.openNotesByFolder[currentFolder.id] || []),
              duplicated.id,
            ],
          },
        }));

        if (
          parentPath &&
          sourceNote.fileType !== "pdf" &&
          sourceNote.fileType !== "image"
        ) {
          try {
            const oldExt = sourceNote.filePath?.includes(".")
              ? sourceNote.filePath.slice(sourceNote.filePath.lastIndexOf("."))
              : ".md";
            const ext = sourceNote.fileType === "code" ? oldExt : ".md";
            const filename = `${sanitizeFilename(copyTitle)}${ext}`;
            const diskNote = await fsApi.createFile(
              parentPath,
              filename,
              sourceContent,
            );
            set((s) => ({
              folders: mapFolderById(
                s.folders,
                s.selectedFolderId,
                (folder) => ({
                  ...folder,
                  items: updateNoteInTree(folder.items, duplicated.id, {
                    title: diskNote.title,
                    filePath: diskNote.filePath,
                  }),
                }),
              ),
            }));
          } catch (err) {
            console.error("Failed to duplicate file on disk:", err);
          }
        }

        return duplicated.id;
      },

      createSubfolder: async (parentFolderId) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return null;

        const newSubfolder: FolderItem = {
          id: createId("sub"),
          type: "folder",
          name: "New Folder",
          children: [],
        };

        const nextCollapsed = parentFolderId
          ? state.collapsedSubfolderIds.filter((id) => id !== parentFolderId)
          : state.collapsedSubfolderIds;

        set((s) => ({
          folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
            ...folder,
            items: insertIntoTree(folder.items, parentFolderId, newSubfolder),
          })),
          collapsedSubfolderIds: nextCollapsed,
          pendingRenameNodeId: newSubfolder.id,
        }));

        const parentPath = resolveParentDiskPath(currentFolder, parentFolderId);
        if (parentPath) {
          try {
            const diskFolder = await fsApi.createFolder(
              parentPath,
              newSubfolder.name,
            );
            set((s) => ({
              folders: mapFolderById(
                s.folders,
                s.selectedFolderId,
                (folder) => ({
                  ...folder,
                  items: updateFolderInTree(folder.items, newSubfolder.id, {
                    name: diskFolder.name,
                    folderPath: diskFolder.folderPath,
                  }),
                }),
              ),
            }));
          } catch (err) {
            console.error("Failed to create folder on disk:", err);
          }
        }

        return newSubfolder.id;
      },

      renameSubfolder: (subfolderId, newName) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return;

        const targetSubfolder = findFolderNode(
          currentFolder.items,
          subfolderId,
        );
        const oldFolderPath = targetSubfolder?.folderPath;

        set((s) => ({
          folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
            ...folder,
            items: updateFolderInTree(folder.items, subfolderId, {
              name: newName,
            }),
          })),
        }));

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
                console.error("Failed to rename folder on disk:", err);
              });
          }
        }
      },

      deleteNode: (nodeId) => {
        const state = get();
        const currentFolder = getSelectedTopFolder(state);
        if (!currentFolder) return;

        const nodeToDelete = findNodeById(currentFolder.items, nodeId);
        const diskPath =
          nodeToDelete?.type === "note"
            ? nodeToDelete.filePath
            : nodeToDelete?.folderPath;

        set((s) => ({
          folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
            ...folder,
            items: removeNodeFromTree(folder.items, nodeId),
          })),
          openNotesByFolder: Object.fromEntries(
            Object.entries(s.openNotesByFolder).map(([fId, ids]) => [
              fId,
              ids.filter((id) => id !== nodeId),
            ]),
          ),
          collapsedSubfolderIds: s.collapsedSubfolderIds.filter(
            (id) => id !== nodeId,
          ),
        }));

        if (diskPath) {
          fsApi.deletePath(diskPath).catch((err) => {
            console.error("Failed to delete path on disk:", err);
          });
        }
      },

      updateNote: (noteId, updates) => {
        const state = get();
        let containingFolder: TopLevelFolder | null = null;
        for (const f of state.folders) {
          if (findNoteNode(f.items, noteId)) {
            containingFolder = f;
            break;
          }
        }
        if (!containingFolder) {
          containingFolder = getSelectedTopFolder(state);
        }
        if (!containingFolder) return;

        const targetFolderId = containingFolder.id;
        const targetNote = findNoteNode(containingFolder.items, noteId);
        const detectedFileType =
          updates.title && isCodeFileName(updates.title)
            ? "code"
            : updates.title && updates.title.toLowerCase().endsWith(".md")
              ? "markdown"
              : undefined;

        set((s) => ({
          activeNoteContents:
            updates.content !== undefined
              ? { ...s.activeNoteContents, [noteId]: updates.content }
              : s.activeNoteContents,
          folders: mapFolderById(s.folders, targetFolderId, (folder) => ({
            ...folder,
            items: updateNoteInTree(folder.items, noteId, {
              ...updates,
              ...(detectedFileType ? { fileType: detectedFileType } : {}),
              content: "", // RFC-042: tree node does not hold raw file body
            }),
          })),
        }));

        if (!targetNote?.filePath) return;

        const currentFilePath = targetNote.filePath;

        // Debounced content save
        if (updates.content !== undefined) {
          const existing = contentSaveTimers.get(currentFilePath);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            contentSaveTimers.delete(currentFilePath);
            try {
              await fsApi.writeFile(currentFilePath, updates.content!);
            } catch (err) {
              console.error("Failed to write file to disk:", err);
            }
          }, CONTENT_SAVE_DEBOUNCE_MS);
          contentSaveTimers.set(currentFilePath, timer);
        }

        // Debounced title rename
        if (
          updates.title !== undefined &&
          updates.title.trim() &&
          updates.title !== targetNote.title
        ) {
          const existing = titleRenameTimers.get(noteId);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            titleRenameTimers.delete(noteId);
            try {
              const dir = getDirname(currentFilePath);
              const cleanName = sanitizeFilename(updates.title!.trim());
              const oldExt = currentFilePath.includes(".")
                ? currentFilePath.slice(currentFilePath.lastIndexOf("."))
                : ".md";
              let newFileName = cleanName;
              let nextFileType = targetNote.fileType;

              if (isCodeFileName(cleanName)) {
                newFileName = cleanName;
                nextFileType = "code";
              } else if (cleanName.toLowerCase().endsWith(".md")) {
                newFileName = cleanName;
                nextFileType = "markdown";
              } else if (
                targetNote.fileType === "code" ||
                targetNote.fileType === "pdf" ||
                targetNote.fileType === "image"
              ) {
                if (!/\.[a-z0-9_-]+$/i.test(cleanName)) {
                  newFileName = `${cleanName}${oldExt}`;
                }
              } else {
                newFileName = `${cleanName}.md`;
                nextFileType = "markdown";
              }
              const newPath = joinPath(dir, newFileName);
              if (newPath !== currentFilePath) {
                const actualPath = await fsApi.renamePath(
                  currentFilePath,
                  newPath,
                );
                set((s) => ({
                  folders: mapFolderById(
                    s.folders,
                    targetFolderId,
                    (folder) => ({
                      ...folder,
                      items: updateNoteInTree(folder.items, noteId, {
                        filePath: actualPath,
                        fileType: nextFileType,
                      }),
                    }),
                  ),
                }));
              }
            } catch (err) {
              console.error("Failed to rename note file on disk:", err);
            }
          }, TITLE_RENAME_DEBOUNCE_MS);
          titleRenameTimers.set(noteId, timer);
        }
      },

      importNotes: (importedNotes) =>
        set((state) => {
          if (importedNotes.length === 0) return state;
          const firstNoteId = importedNotes[0].id;

          if (!state.selectedFolderId) {
            const newTopFolder: TopLevelFolder = {
              id: createId("top"),
              name: "Imported",
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
            folders: mapFolderById(
              state.folders,
              state.selectedFolderId,
              (folder) => ({
                ...folder,
                items: [...folder.items, ...importedNotes],
              }),
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

      importFolder: (rootName, items, placement, localPath) =>
        set((state) => {
          const isTopLevel =
            placement === true ||
            placement === "new-tab" ||
            !state.selectedFolderId;

          if (isTopLevel) {
            const newTopFolder: TopLevelFolder = {
              id: createId("top"),
              name: rootName,
              items,
              localPath,
            };
            const firstNoteId = findDefaultNoteId(
              newTopFolder.items,
              state.sortOrder,
            );
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

          if (placement === "current-tab" && state.selectedFolderId) {
            const activeFolderId = state.selectedFolderId;
            const firstNoteId = findDefaultNoteId(items, state.sortOrder);
            return {
              folders: mapFolderById(
                state.folders,
                activeFolderId,
                (folder) => ({
                  ...folder,
                  name:
                    folder.name === "Untitled Folder" ? rootName : folder.name,
                  items: [...folder.items, ...items],
                  localPath: localPath ?? folder.localPath,
                }),
              ),
              selectedNoteByFolder:
                !state.selectedNoteByFolder[activeFolderId] && firstNoteId
                  ? {
                      ...state.selectedNoteByFolder,
                      [activeFolderId]: firstNoteId,
                    }
                  : state.selectedNoteByFolder,
            };
          }

          const newSubfolder: FolderItem = {
            id: createId("sub"),
            type: "folder",
            name: rootName,
            children: items,
            folderPath: localPath,
          };
          const firstNoteId = findDefaultNoteId(
            newSubfolder.children,
            state.sortOrder,
          );
          return {
            folders: mapFolderById(
              state.folders,
              state.selectedFolderId!,
              (folder) => ({
                ...folder,
                items: [...folder.items, newSubfolder],
              }),
            ),
            selectedNoteByFolder: firstNoteId
              ? {
                  ...state.selectedNoteByFolder,
                  [state.selectedFolderId!]: firstNoteId,
                }
              : state.selectedNoteByFolder,
          };
        }),

      syncFolderFromDisk: async (folderId: string): Promise<boolean> => {
        const stateSnapshot = get();
        if (stateSnapshot.isSyncingFolderId || hasPendingDiskOperations()) {
          return false;
        }
        const folder = stateSnapshot.folders.find((f) => f.id === folderId);
        if (!folder || !folder.localPath) return false;

        set({ isSyncingFolderId: folderId });
        try {
          const result = await fsApi.scanFolder(folder.localPath);
          if (hasPendingDiskOperations()) {
            return false;
          }

          const latestFolder = get().folders.find((f) => f.id === folderId);
          if (!latestFolder || !latestFolder.localPath) return false;

          const expandedSet = new Set(get().expandedFolderIds ?? []);
          async function refreshLoadedSubfolders(
            scannedList: ExplorerNode[],
            existingList: ExplorerNode[],
          ): Promise<ExplorerNode[]> {
            const merged = matchAndPreserveIds(scannedList, existingList);
            return await Promise.all(
              merged.map(async (node) => {
                if (node.type !== "folder" || !node.folderPath) return node;
                const existingFolder = existingList.find(
                  (ex): ex is FolderItem =>
                    ex.type === "folder" && ex.folderPath === node.folderPath,
                );
                const wasLoadedOrExpanded = Boolean(
                  node.isLoaded ||
                  (existingFolder &&
                    (existingFolder.isLoaded ||
                      (existingFolder.children &&
                        existingFolder.children.length > 0))) ||
                  expandedSet.has(node.id) ||
                  (existingFolder && expandedSet.has(existingFolder.id)),
                );
                if (wasLoadedOrExpanded) {
                  try {
                    const diskChildren = await fsApi.readDir(node.folderPath);
                    const existingChildren =
                      existingFolder?.children || node.children || [];
                    const refreshedChildren = await refreshLoadedSubfolders(
                      diskChildren,
                      existingChildren,
                    );
                    return {
                      ...node,
                      children: refreshedChildren,
                      hasChildren: refreshedChildren.length > 0,
                      isLoaded: true,
                    };
                  } catch {
                    return node;
                  }
                }
                return node;
              }),
            );
          }

          const mergedItems = await refreshLoadedSubfolders(
            result.items,
            latestFolder.items,
          );
          const nextName =
            latestFolder.name === "Untitled Folder"
              ? result.rootName
              : latestFolder.name;

          if (
            areNodeTreesEqual(latestFolder.items, mergedItems) &&
            latestFolder.name === nextName &&
            latestFolder.localPath === result.rootPath
          ) {
            return true;
          }

          set((state) => {
            const currentSelected = state.selectedNoteByFolder[folderId];
            const nextSelectedNote =
              currentSelected && findNodeById(mergedItems, currentSelected)
                ? currentSelected
                : findDefaultNoteId(mergedItems, state.sortOrder);

            return {
              folders: mapFolderById(state.folders, folderId, (f) => ({
                ...f,
                name: nextName,
                items: mergedItems,
                localPath: result.rootPath,
              })),
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
          console.error("Failed to sync folder from disk:", err);
          return false;
        } finally {
          set({ isSyncingFolderId: null });
        }
      },

      linkFolderToDisk: async (
        folderId: string,
        localPath: string,
      ): Promise<boolean> => {
        const folder = get().folders.find((f) => f.id === folderId);
        if (!folder) return false;

        set((state) => ({
          folders: mapFolderById(state.folders, folderId, (f) => ({
            ...f,
            localPath,
          })),
        }));

        return await get().syncFolderFromDisk(folderId);
      },

      unlinkFolderFromDisk: (folderId: string) => {
        set((state) => ({
          folders: mapFolderById(state.folders, folderId, (f) => ({
            ...f,
            localPath: undefined,
          })),
        }));
      },

      openLocalFolderAsTab: async (
        localPath: string,
        customName?: string,
      ): Promise<boolean> => {
        try {
          const result = await fsApi.scanFolder(localPath);
          const newTopFolder: TopLevelFolder = {
            id: createId("top"),
            name: customName?.trim() || result.rootName || "Local Notes",
            items: result.items,
            localPath: result.rootPath,
          };
          const firstNoteId = findDefaultNoteId(
            newTopFolder.items,
            get().sortOrder,
          );

          set((state) => ({
            folders: [...state.folders, newTopFolder],
            selectedFolderId: newTopFolder.id,
            selectedNoteByFolder: {
              ...state.selectedNoteByFolder,
              [newTopFolder.id]: firstNoteId,
            },
            openNotesByFolder: {
              ...state.openNotesByFolder,
              [newTopFolder.id]: firstNoteId ? [firstNoteId] : [],
            },
            lastSyncTimeByFolder: {
              ...state.lastSyncTimeByFolder,
              [newTopFolder.id]: Date.now(),
            },
          }));
          return true;
        } catch (err) {
          console.error("Failed to open local folder as tab:", err);
          throw err;
        }
      },

      toggleSubfolderCollapse: (subfolderId) => {
        const state = get();
        const isExpanded = (state.expandedFolderIds ?? []).includes(
          subfolderId,
        );
        if (!isExpanded && state.selectedFolderId) {
          const currentFolder = state.folders.find(
            (f) => f.id === state.selectedFolderId,
          );
          if (currentFolder) {
            const node = findFolderNode(currentFolder.items, subfolderId);
            if (node?.folderPath) {
              void get().loadSubfolderChildren(
                currentFolder.id,
                subfolderId,
                node.folderPath,
              );
            }
          }
        }
        const nextExpanded = isExpanded
          ? (state.expandedFolderIds ?? []).filter((id) => id !== subfolderId)
          : [...(state.expandedFolderIds ?? []), subfolderId];
        set({
          expandedFolderIds: nextExpanded,
          collapsedSubfolderIds: isExpanded
            ? [...state.collapsedSubfolderIds, subfolderId]
            : state.collapsedSubfolderIds.filter((id) => id !== subfolderId),
        });
      },

      expandSubfolder: (subfolderId) => {
        const state = get();
        if ((state.expandedFolderIds ?? []).includes(subfolderId)) return;
        if (state.selectedFolderId) {
          const currentFolder = state.folders.find(
            (f) => f.id === state.selectedFolderId,
          );
          if (currentFolder) {
            const node = findFolderNode(currentFolder.items, subfolderId);
            if (node?.folderPath) {
              void get().loadSubfolderChildren(
                currentFolder.id,
                subfolderId,
                node.folderPath,
              );
            }
          }
        }
        set({
          expandedFolderIds: [...(state.expandedFolderIds ?? []), subfolderId],
          collapsedSubfolderIds: state.collapsedSubfolderIds.filter(
            (id) => id !== subfolderId,
          ),
        });
      },

      collapseAllSubfolders: () => {
        const state = get();
        const currentFolder = state.folders.find(
          (f) => f.id === state.selectedFolderId,
        );
        const allIds = currentFolder
          ? collectAllFolderIds(currentFolder.items)
          : [];
        set({
          expandedFolderIds: [],
          collapsedSubfolderIds: allIds,
        });
      },

      expandAllSubfolders: () => {
        const state = get();
        const currentFolder = state.folders.find(
          (f) => f.id === state.selectedFolderId,
        );
        if (!currentFolder) {
          set({ expandedFolderIds: [], collapsedSubfolderIds: [] });
          return;
        }
        const allIds = collectAllFolderIds(currentFolder.items);
        for (const fId of allIds) {
          const node = findFolderNode(currentFolder.items, fId);
          if (node?.folderPath) {
            void get().loadSubfolderChildren(
              currentFolder.id,
              fId,
              node.folderPath,
            );
          }
        }
        set({
          expandedFolderIds: allIds,
          collapsedSubfolderIds: [],
        });
      },

      toggleCollapseAllSubfolders: () => {
        const state = get();
        const currentFolder = state.folders.find(
          (f) => f.id === state.selectedFolderId,
        );
        if (!currentFolder) return;
        const allIds = collectAllFolderIds(currentFolder.items);
        if (allIds.length === 0) return;
        const expandedSet = new Set(state.expandedFolderIds ?? []);
        const allAreExpanded = allIds.every((id) => expandedSet.has(id));
        if (allAreExpanded) {
          get().collapseAllSubfolders();
        } else {
          get().expandAllSubfolders();
        }
      },

      splitPane: (direction, targetFolderId, targetNoteId, fromPaneId) => {
        const state = get();
        let fId: string | null = targetFolderId ?? null;
        let nId: string | null = targetNoteId ?? null;

        // If target file not specified, clone active file of fromPaneId (or active pane)
        if (!nId) {
          const activeLeaf =
            state.paneLayout && (fromPaneId || state.activePaneId)
              ? findLeaf(state.paneLayout, (fromPaneId || state.activePaneId)!)
              : null;

          if (activeLeaf && activeLeaf.noteId) {
            fId = activeLeaf.folderId;
            nId = activeLeaf.noteId;
          } else {
            fId = state.selectedFolderId;
            nId = state.selectedFolderId
              ? (state.selectedNoteByFolder[state.selectedFolderId] ?? null)
              : null;
          }
        }

        const newLeaf = createLeafNode(fId ?? state.selectedFolderId, nId);

        let nextLayout: PaneLayoutNode;
        if (!state.paneLayout || getAllLeaves(state.paneLayout).length <= 1) {
          // Starting from single view mode
          const primaryFolderId = state.selectedFolderId;
          const primaryNoteId = primaryFolderId
            ? (state.selectedNoteByFolder[primaryFolderId] ?? null)
            : null;
          const primaryLeaf = createLeafNode(
            primaryFolderId,
            primaryNoteId,
            "pane-primary",
          );
          nextLayout = {
            id: createBranchId(),
            type: "branch",
            direction,
            children: [primaryLeaf, newLeaf],
            sizes: [0.5, 0.5],
          };
        } else {
          // Split from specific origin pane
          const originId =
            fromPaneId ??
            state.activePaneId ??
            getAllLeaves(state.paneLayout)[0].id;
          nextLayout = splitLeafInTree(
            state.paneLayout,
            originId,
            direction,
            newLeaf,
          );
        }

        const leaves = getAllLeaves(nextLayout);
        const currentOpen = fId ? (state.openNotesByFolder[fId] ?? []) : [];
        const nextOpen =
          fId && nId && !currentOpen.includes(nId)
            ? [...currentOpen, nId]
            : currentOpen;

        set({
          paneLayout: nextLayout,
          activePaneId: newLeaf.id,
          isSplitViewActive: leaves.length > 1,
          splitDirection:
            nextLayout.type === "branch" ? nextLayout.direction : direction,
          openNotesByFolder: fId
            ? {
                ...state.openNotesByFolder,
                [fId]: nextOpen,
              }
            : state.openNotesByFolder,
        });
      },

      toggleSplitDirection: (branchId) => {
        const state = get();
        if (!state.paneLayout) {
          set((s) => ({
            splitDirection:
              s.splitDirection === "horizontal" ? "vertical" : "horizontal",
          }));
          return;
        }
        const updatedLayout = toggleBranchDirection(state.paneLayout, branchId);
        const dir =
          updatedLayout.type === "branch"
            ? updatedLayout.direction
            : "horizontal";
        set({
          paneLayout: updatedLayout,
          splitDirection: dir,
        });
      },

      closePane: (targetPane) => {
        const state = get();
        if (!state.paneLayout) return;

        const leaves = getAllLeaves(state.paneLayout);
        let paneIdToClose: string | null = null;

        if (
          typeof targetPane === "string" &&
          targetPane !== "primary" &&
          targetPane !== "secondary"
        ) {
          paneIdToClose = targetPane;
        } else if (targetPane === "primary") {
          paneIdToClose = leaves[0]?.id ?? null;
        } else if (targetPane === "secondary") {
          paneIdToClose = leaves[1]?.id ?? null;
        } else {
          paneIdToClose =
            state.activePaneId ?? leaves[leaves.length - 1]?.id ?? null;
        }

        if (!paneIdToClose) return;

        const nextLayout = removeLeafFromTree(state.paneLayout, paneIdToClose);
        if (!nextLayout || nextLayout.type === "leaf") {
          const remainingLeaf =
            nextLayout ?? leaves.find((l) => l.id !== paneIdToClose) ?? null;
          if (remainingLeaf && remainingLeaf.folderId && remainingLeaf.noteId) {
            const fId = remainingLeaf.folderId;
            const nId = remainingLeaf.noteId;
            set((s) => ({
              paneLayout: null,
              activePaneId: null,
              isSplitViewActive: false,
              selectedFolderId: fId,
              selectedNoteByFolder: {
                ...s.selectedNoteByFolder,
                [fId]: nId,
              },
            }));
          } else {
            set({
              paneLayout: null,
              activePaneId: null,
              isSplitViewActive: false,
            });
          }
          return;
        }

        const remainingLeaves = getAllLeaves(nextLayout);
        const nextActiveId =
          state.activePaneId === paneIdToClose
            ? (remainingLeaves[0]?.id ?? null)
            : state.activePaneId;

        set({
          paneLayout: nextLayout,
          activePaneId: nextActiveId,
          isSplitViewActive: remainingLeaves.length > 1,
        });
      },

      closeOtherPanes: (keepPaneId) => {
        const state = get();
        if (!state.paneLayout) return;
        const targetId = keepPaneId ?? state.activePaneId;
        const targetLeaf = targetId
          ? findLeaf(state.paneLayout, targetId)
          : null;
        if (!targetLeaf) {
          get().closeSplitView();
          return;
        }
        if (targetLeaf.folderId && targetLeaf.noteId) {
          const fId = targetLeaf.folderId;
          const nId = targetLeaf.noteId;
          set((s) => ({
            paneLayout: null,
            activePaneId: null,
            isSplitViewActive: false,
            selectedFolderId: fId,
            selectedNoteByFolder: {
              ...s.selectedNoteByFolder,
              [fId]: nId,
            },
          }));
        } else {
          set({
            paneLayout: null,
            activePaneId: null,
            isSplitViewActive: false,
          });
        }
      },

      toggleSplitView: () => {
        const state = get();
        if (state.isSplitViewActive) {
          get().closePane("secondary");
        } else {
          get().splitPane("horizontal");
        }
      },

      openInSplitView: (folderId, noteId, direction = "horizontal") => {
        const state = get();
        const leaves = getAllLeaves(state.paneLayout);

        // 1. If note is already open in one of the split panes, focus it
        const existingLeaf = leaves.find(
          (l) => l.noteId === noteId && l.folderId === folderId,
        );
        if (existingLeaf) {
          state.setActivePaneId(existingLeaf.id);
          return;
        }

        // 2. If split view is already active with 2 panes, reuse the secondary pane
        if (
          state.isSplitViewActive &&
          state.paneLayout &&
          leaves.length === 2
        ) {
          const targetLeaf =
            leaves.find((l) => l.id !== state.activePaneId) ?? leaves[1];
          state.setPaneNote(targetLeaf.id, folderId, noteId);
          state.setActivePaneId(targetLeaf.id);

          const currentOpen = state.openNotesByFolder[folderId] ?? [];
          const nextOpen = currentOpen.includes(noteId)
            ? currentOpen
            : [...currentOpen, noteId];
          const targetTopFolder = state.folders.find((f) => f.id === folderId);
          const ancestors = targetTopFolder
            ? (findAncestorFolderIds(targetTopFolder.items, noteId) ?? [])
            : [];
          const ancestorSet = new Set(ancestors);
          set({
            openNotesByFolder: {
              ...state.openNotesByFolder,
              [folderId]: nextOpen,
            },
            expandedFolderIds: Array.from(
              new Set([...(state.expandedFolderIds ?? []), ...ancestorSet]),
            ),
            collapsedSubfolderIds: state.collapsedSubfolderIds.filter(
              (id) => !ancestorSet.has(id),
            ),
          });
          return;
        }

        // 3. Otherwise perform a standard split
        get().splitPane(direction, folderId, noteId);

        const nextState = get();
        const currentOpen = nextState.openNotesByFolder[folderId] ?? [];
        const nextOpen = currentOpen.includes(noteId)
          ? currentOpen
          : [...currentOpen, noteId];
        const targetTopFolder = nextState.folders.find(
          (f) => f.id === folderId,
        );
        const ancestors = targetTopFolder
          ? (findAncestorFolderIds(targetTopFolder.items, noteId) ?? [])
          : [];
        const ancestorSet = new Set(ancestors);
        set({
          openNotesByFolder: {
            ...nextState.openNotesByFolder,
            [folderId]: nextOpen,
          },
          expandedFolderIds: Array.from(
            new Set([...(nextState.expandedFolderIds ?? []), ...ancestorSet]),
          ),
          collapsedSubfolderIds: nextState.collapsedSubfolderIds.filter(
            (id) => !ancestorSet.has(id),
          ),
        });
      },

      closeSplitView: () => {
        get().closeOtherPanes(get().activePaneId ?? undefined);
      },

      setActivePaneId: (paneId) => {
        set({ activePaneId: paneId });
      },

      setPaneNote: (paneId, folderId, noteId) => {
        const state = get();
        if (!state.paneLayout) return;
        const updatedLayout = updateLeafInTree(
          state.paneLayout,
          paneId,
          (l) => ({
            ...l,
            folderId,
            noteId,
          }),
        );
        const currentOpen = state.openNotesByFolder[folderId] ?? [];
        const nextOpen = currentOpen.includes(noteId)
          ? currentOpen
          : [...currentOpen, noteId];
        set({
          paneLayout: updatedLayout,
          activePaneId: paneId,
          openNotesByFolder: {
            ...state.openNotesByFolder,
            [folderId]: nextOpen,
          },
        });
      },

      resizePaneBranch: (branchId, index, deltaRatio) => {
        const state = get();
        if (!state.paneLayout) return;
        const updatedLayout = resizeBranchInTree(
          state.paneLayout,
          branchId,
          index,
          deltaRatio,
        );
        set({ paneLayout: updatedLayout });
      },

      resetPaneSizes: (branchId) => {
        const state = get();
        if (!state.paneLayout) return;
        const updatedLayout = resetBranchSizes(state.paneLayout, branchId);
        set({ paneLayout: updatedLayout });
      },

      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleNavbar: () =>
        set((state) => ({ isNavbarCollapsed: !state.isNavbarCollapsed })),
      toggleRightSidebar: () =>
        set((state) => ({
          isRightSidebarCollapsed: !state.isRightSidebarCollapsed,
        })),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
        }),
      setRightSidebarWidth: (width) =>
        set({
          rightSidebarWidth: clamp(
            width,
            MIN_SIDEBAR_WIDTH,
            MAX_RIGHT_SIDEBAR_WIDTH,
          ),
        }),
      resetLayoutWidths: () =>
        set({
          sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
          rightSidebarWidth: DEFAULT_RIGHT_SIDEBAR_WIDTH,
        }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
      setSortOrder: (order) => set({ sortOrder: order }),

      chooseTheme: (nextTheme) => {
        applyTheme(nextTheme);
        saveTheme(nextTheme);
        set({ theme: nextTheme });
      },

      openLinkModal: (mode = "new-tab") =>
        set({ isLinkModalOpen: true, linkModalTargetMode: mode }),
      closeLinkModal: () => set({ isLinkModalOpen: false }),
      openSessionModal: () => set({ isSessionModalOpen: true }),
      closeSessionModal: () => set({ isSessionModalOpen: false }),
      setSessionName: (name) => {
        setTabSessionName(name);
        set({ currentSessionName: name });
        void sessionApi.renameSession(get().currentSessionId, name);
      },
      openSettingsModal: (tab = "theme") =>
        set({ isSettingsModalOpen: true, settingsActiveTab: tab }),
      closeSettingsModal: () => set({ isSettingsModalOpen: false }),
      setSettingsActiveTab: (tab) => set({ settingsActiveTab: tab }),

      updateFontSettings: (updates) => {
        const next = { ...get().fontSettings, ...updates };
        applyFontSettings(next);
        saveFontSettings(next);
        set({ fontSettings: next });
      },

      resetFontSettings: () => {
        const next = { ...DEFAULT_FONT_SETTINGS };
        applyFontSettings(next);
        saveFontSettings(next);
        set({ fontSettings: next });
      },
      clearPendingRenameFolder: () => set({ pendingRenameFolderId: null }),
      clearPendingRenameNode: () => set({ pendingRenameNodeId: null }),
      clearFocusNoteTitle: () => set({ shouldFocusNoteTitle: false }),
    }),
    {
      name: "pentnotes-workspace-v1",
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (state) => ({
        folders: state.folders,
        tabGroups: state.tabGroups,
        selectedFolderId: state.selectedFolderId,
        selectedNoteByFolder: state.selectedNoteByFolder,
        openNotesByFolder: state.openNotesByFolder,
        collapsedSubfolderIds: state.collapsedSubfolderIds,
        expandedFolderIds: state.expandedFolderIds,
        isSidebarCollapsed: state.isSidebarCollapsed,
        isNavbarCollapsed: state.isNavbarCollapsed,
        isRightSidebarCollapsed: state.isRightSidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarTab: state.rightSidebarTab,
        sortOrder: state.sortOrder,
        theme: state.theme,
        fontSettings: state.fontSettings,
        lastSyncTimeByFolder: state.lastSyncTimeByFolder,
        isSplitViewActive: state.isSplitViewActive,
        splitDirection: state.splitDirection,
        paneLayout: state.paneLayout,
        activePaneId: state.activePaneId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.theme) {
            applyTheme(state.theme);
            saveTheme(state.theme);
          }
          if (state.fontSettings) {
            applyFontSettings(state.fontSettings);
            saveFontSettings(state.fontSettings);
          } else {
            applyFontSettings(initialFontSettings());
          }
          if (state.paneLayout && getAllLeaves(state.paneLayout).length > 1) {
            state.isSplitViewActive = true;
          }
          if (Array.isArray(state.folders)) {
            state.folders = state.folders.map((f) => ({
              ...f,
              items: f.items.map(normalizeExplorerNode),
            }));
          }
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
        if (state?.selectedFolderId) {
          void state.syncFolderFromDisk(state.selectedFolderId);
        }
        state?.setHydrated(true);
      },
    },
  ),
);
