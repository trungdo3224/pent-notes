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
} from "../../lib/paneLayoutTree";
import { PaneLayoutNode } from "../../types";
import { buildOpenNoteStateUpdate, exitSplitViewState } from "../storeHelpers";
import { NotesSlice, PanesSliceState } from "../types";

export const createPanesSlice: NotesSlice<PanesSliceState> = (set, get) => ({
  paneLayout: null,
  activePaneId: null,
  isSplitViewActive: false,
  splitDirection: "horizontal",

  splitPane: (direction, targetFolderId, targetNoteId, fromPaneId) => {
    const state = get();
    let fId: string | null = targetFolderId ?? null;
    let nId: string | null = targetNoteId ?? null;

    if (!nId) {
      const originId = fromPaneId || state.activePaneId;
      const activeLeaf =
        state.paneLayout && originId
          ? findLeaf(state.paneLayout, originId)
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
      updatedLayout.type === "branch" ? updatedLayout.direction : "horizontal";
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
      set((s) => exitSplitViewState(s, remainingLeaf));
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
    const targetLeaf = targetId ? findLeaf(state.paneLayout, targetId) : null;
    if (!targetLeaf) {
      get().closeSplitView();
      return;
    }
    set((s) => exitSplitViewState(s, targetLeaf));
  },

  toggleSplitView: () => {
    if (get().isSplitViewActive) {
      get().closePane("secondary");
    } else {
      get().splitPane("horizontal");
    }
  },

  openInSplitView: (folderId, noteId, direction = "horizontal") => {
    const state = get();
    const leaves = getAllLeaves(state.paneLayout);

    const existingLeaf = leaves.find(
      (l) => l.noteId === noteId && l.folderId === folderId,
    );
    if (existingLeaf) {
      state.setActivePaneId(existingLeaf.id);
      return;
    }

    if (state.isSplitViewActive && state.paneLayout && leaves.length === 2) {
      const targetLeaf =
        leaves.find((l) => l.id !== state.activePaneId) ?? leaves[1];
      state.setPaneNote(targetLeaf.id, folderId, noteId);
      state.setActivePaneId(targetLeaf.id);
      set((s) =>
        buildOpenNoteStateUpdate(s, folderId, noteId, {
          updateActivePane: false,
          selectInSingleMode: false,
        }),
      );
      return;
    }

    get().splitPane(direction, folderId, noteId);
    set((s) =>
      buildOpenNoteStateUpdate(s, folderId, noteId, {
        updateActivePane: false,
        selectInSingleMode: false,
      }),
    );
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
    const updatedLayout = updateLeafInTree(state.paneLayout, paneId, (l) => ({
      ...l,
      folderId,
      noteId,
    }));
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
    set({
      paneLayout: resizeBranchInTree(
        state.paneLayout,
        branchId,
        index,
        deltaRatio,
      ),
    });
  },

  resetPaneSizes: (branchId) => {
    const state = get();
    if (!state.paneLayout) return;
    set({ paneLayout: resetBranchSizes(state.paneLayout, branchId) });
  },
});
