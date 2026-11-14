import { createId } from "../../lib/fileUtils";
import { collectAllFolderIds, findFolderNode } from "../../lib/treeUtils";
import { TabGroup, TopLevelFolder } from "../../types";
import {
  cleanupEmptyTabGroups,
  mapFolderById,
  TAB_GROUP_COLORS,
  triggerSubfolderLazyLoad,
} from "../storeHelpers";
import { FoldersSliceState, NotesSlice } from "../types";

function findGroupIndexRange(
  folders: TopLevelFolder[],
  groupId: string,
): [number, number] | null {
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < folders.length; i++) {
    if (folders[i].groupId === groupId) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }
  return firstIdx === -1 ? null : [firstIdx, lastIdx];
}

export const createFoldersSlice: NotesSlice<FoldersSliceState> = (
  set,
  get,
) => ({
  folders: [],
  tabGroups: [],
  selectedFolderId: null,
  collapsedSubfolderIds: [],
  expandedFolderIds: [],
  pendingRenameFolderId: null,
  pendingRenameGroupId: null,

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
      if (targetKind === "group" && draggedGroupId === targetId) return state;

      const groupFolders = state.folders.filter(
        (f) => f.groupId === draggedGroupId,
      );
      if (groupFolders.length === 0) return state;

      const remainingFolders = state.folders.filter(
        (f) => f.groupId !== draggedGroupId,
      );

      let insertIndex = -1;
      if (targetKind === "group") {
        const range = findGroupIndexRange(remainingFolders, targetId);
        if (!range) return state;
        insertIndex = position === "before" ? range[0] : range[1] + 1;
      } else {
        const targetFolderIdx = remainingFolders.findIndex(
          (f) => f.id === targetId,
        );
        if (targetFolderIdx === -1) return state;
        const otherGroupId = remainingFolders[targetFolderIdx].groupId;
        const range = otherGroupId
          ? findGroupIndexRange(remainingFolders, otherGroupId)
          : null;
        if (range) {
          insertIndex = position === "before" ? range[0] : range[1] + 1;
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
        const range = findGroupIndexRange(nextFolders, groupId);
        const insertAt = range ? range[1] + 1 : folderIndex;
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
      }

      const prevRange = targetFolder.groupId
        ? findGroupIndexRange(nextFolders, targetFolder.groupId)
        : null;
      const lastSiblingIndex = prevRange ? prevRange[1] + 1 : folderIndex;
      nextFolders.splice(lastSiblingIndex, 0, updatedFolder);
      return {
        folders: nextFolders,
        tabGroups: cleanupEmptyTabGroups(nextFolders, state.tabGroups),
      };
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
      const nextFolders = state.folders.filter((f) => f.groupId !== groupId);
      const nextNoteMap = { ...state.selectedNoteByFolder };
      for (const id of removedFolderIds) {
        delete nextNoteMap[id];
      }
      const nextSelectedId =
        state.selectedFolderId && removedFolderIds.has(state.selectedFolderId)
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
        const neighbor = nextFolders[index] ?? nextFolders[index - 1] ?? null;
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

  toggleSubfolderCollapse: (subfolderId) => {
    const state = get();
    const isExpanded = (state.expandedFolderIds ?? []).includes(subfolderId);
    if (!isExpanded) {
      triggerSubfolderLazyLoad(get, state.selectedFolderId, subfolderId);
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
    triggerSubfolderLazyLoad(get, state.selectedFolderId, subfolderId);
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
      if (findFolderNode(currentFolder.items, fId)?.folderPath) {
        triggerSubfolderLazyLoad(get, currentFolder.id, fId);
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
    if (allIds.every((id) => expandedSet.has(id))) {
      get().collapseAllSubfolders();
    } else {
      get().expandAllSubfolders();
    }
  },
});
