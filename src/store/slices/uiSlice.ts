import { StoreApi } from "zustand";
import {
  applyFontSettings,
  DEFAULT_FONT_SETTINGS,
  FontSettings,
  initialFontSettings,
  saveFontSettings,
} from "../../lib/fontSettings";
import {
  getTabSessionId,
  getTabSessionName,
  setTabSessionName,
} from "../../lib/sessionManager";
import { applyTheme, initialTheme, saveTheme } from "../../themes";
import {
  clamp,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../storeHelpers";
import { NotesSlice, NotesState, UiSliceState } from "../types";

function commitFontSettings(
  set: StoreApi<NotesState>["setState"],
  next: FontSettings,
): void {
  applyFontSettings(next);
  saveFontSettings(next);
  set({ fontSettings: next });
}

export const createUiSlice: NotesSlice<UiSliceState> = (set, get) => ({
  isSidebarCollapsed: false,
  isNavbarCollapsed: false,
  isRightSidebarCollapsed: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  rightSidebarWidth: DEFAULT_RIGHT_SIDEBAR_WIDTH,
  rightSidebarTab: "outline",
  sortOrder: "name-asc",
  theme: initialTheme(),

  isHydrated: false,
  isSettingsModalOpen: false,
  settingsActiveTab: "theme",
  fontSettings: initialFontSettings(),
  isLinkModalOpen: false,
  linkModalTargetMode: "new-tab",
  isSessionModalOpen: false,
  currentSessionId: getTabSessionId(),
  currentSessionName: getTabSessionName(),

  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  toggleNavbar: () =>
    set((state) => ({ isNavbarCollapsed: !state.isNavbarCollapsed })),
  toggleRightSidebar: () =>
    set((state) => ({
      isRightSidebarCollapsed: !state.isRightSidebarCollapsed,
    })),
  setSidebarWidth: (width) =>
    set({ sidebarWidth: clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) }),
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
  },
  openSettingsModal: (tab = "theme") =>
    set({ isSettingsModalOpen: true, settingsActiveTab: tab }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  setSettingsActiveTab: (tab) => set({ settingsActiveTab: tab }),

  updateFontSettings: (updates) => {
    commitFontSettings(set, { ...get().fontSettings, ...updates });
  },

  resetFontSettings: () => {
    commitFontSettings(set, { ...DEFAULT_FONT_SETTINGS });
  },

  clearPendingRenameFolder: () => set({ pendingRenameFolderId: null }),
  clearPendingRenameNode: () => set({ pendingRenameNodeId: null }),
  clearFocusNoteTitle: () => set({ shouldFocusNoteTitle: false }),
});
