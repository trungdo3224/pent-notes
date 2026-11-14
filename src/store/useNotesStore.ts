import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  applyFontSettings,
  initialFontSettings,
  saveFontSettings,
} from "../lib/fontSettings";
import { getAllLeaves } from "../lib/paneLayoutTree";
import { getTabSessionId, sessionApi } from "../lib/sessionManager";
import { workspaceStorage } from "../lib/storage";
import {
  collectAllFolderIds,
  findAncestorFolderIds,
  findFolderNode,
  findNoteAndPath,
  normalizeExplorerNode,
  resolveActiveNoteData,
  sortExplorerNodes,
} from "../lib/treeUtils";
import { applyTheme, saveTheme } from "../themes";
import { createFoldersSlice } from "./slices/foldersSlice";
import { createNotesSlice } from "./slices/notesSlice";
import { createPanesSlice } from "./slices/panesSlice";
import { createSyncSlice } from "./slices/syncSlice";
import { createUiSlice } from "./slices/uiSlice";
import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  isNotePendingSave,
} from "./storeHelpers";
import type { NotesState } from "./types";

export {
  collectAllFolderIds,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  findAncestorFolderIds,
  findFolderNode,
  findNoteAndPath,
  isNotePendingSave,
  resolveActiveNoteData,
  sortExplorerNodes,
};
export type { NotesState };

export const useNotesStore = create<NotesState>()(
  persist(
    (...args) => ({
      ...createFoldersSlice(...args),
      ...createSyncSlice(...args),
      ...createNotesSlice(...args),
      ...createPanesSlice(...args),
      ...createUiSlice(...args),
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
            if (data?.name) state?.setSessionName(data.name);
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
