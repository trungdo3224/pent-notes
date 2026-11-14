import { StateCreator } from "zustand";
import { FontSettings } from "../lib/fontSettings";
import { NoteUpdates } from "../lib/treeUtils";
import { ThemeId } from "../themes";
import {
  CatalogTab,
  ExplorerNode,
  LinkModalTargetMode,
  NoteItem,
  PaneLayoutNode,
  SortOrder,
  SplitDirection,
  TabGroup,
  TabGroupColorId,
  TopLevelFolder,
} from "../types";

export interface FoldersSliceState {
  folders: TopLevelFolder[];
  tabGroups: TabGroup[];
  selectedFolderId: string | null;
  collapsedSubfolderIds: string[];
  expandedFolderIds: string[];
  pendingRenameFolderId: string | null;
  pendingRenameGroupId: string | null;

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

  toggleSubfolderCollapse: (subfolderId: string) => void;
  expandSubfolder: (subfolderId: string) => void;
  collapseAllSubfolders: () => void;
  expandAllSubfolders: () => void;
  toggleCollapseAllSubfolders: () => void;
}

export interface SyncSliceState {
  lastSyncTimeByFolder: Record<string, number>;
  activeNoteContents: Record<string, string>;
  loadingNoteIds: Record<string, boolean>;
  isSyncingFolderId: string | null;

  loadNoteContent: (noteId: string, filePath?: string) => Promise<string>;
  loadSubfolderChildren: (
    folderId: string,
    subfolderId: string,
    subfolderPath: string,
  ) => Promise<void>;
  importNotes: (notes: NoteItem[]) => void;
  importNotesFiles: (files: File[]) => Promise<void>;
  importFolder: (
    rootName: string,
    items: ExplorerNode[],
    placement: boolean | LinkModalTargetMode,
    localPath?: string,
  ) => void;
  syncFolderFromDisk: (folderId: string) => Promise<boolean>;
  linkFolderToDisk: (folderId: string, localPath: string) => Promise<boolean>;
  unlinkFolderFromDisk: (folderId: string) => void;
  openLocalFolderAsTab: (
    localPath: string,
    customName?: string,
  ) => Promise<boolean>;
}

export interface NotesSliceState {
  selectedNoteByFolder: Record<string, string | null>;
  openNotesByFolder: Record<string, string[]>;
  pendingRenameNodeId: string | null;
  shouldFocusNoteTitle: boolean;

  selectNote: (noteId: string) => void;
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
}

export interface PanesSliceState {
  paneLayout: PaneLayoutNode | null;
  activePaneId: string | null;
  isSplitViewActive: boolean;
  splitDirection: SplitDirection;

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
}

export interface UiSliceState {
  isSidebarCollapsed: boolean;
  isNavbarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  sidebarWidth: number;
  rightSidebarWidth: number;
  rightSidebarTab: CatalogTab;
  sortOrder: SortOrder;
  theme: ThemeId;

  isHydrated: boolean;
  isSettingsModalOpen: boolean;
  settingsActiveTab: "theme" | "fonts" | "layout";
  fontSettings: FontSettings;
  isLinkModalOpen: boolean;
  linkModalTargetMode: LinkModalTargetMode;
  isSessionModalOpen: boolean;
  currentSessionId: string;
  currentSessionName: string;

  setHydrated: (hydrated: boolean) => void;
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

export type NotesState = FoldersSliceState &
  SyncSliceState &
  NotesSliceState &
  PanesSliceState &
  UiSliceState;

export type NotesSlice<T> = StateCreator<NotesState, [], [], T>;
