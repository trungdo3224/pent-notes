import { buildNoteItemsFromFiles, createId } from "../../lib/fileUtils";
import { fsApi } from "../../lib/fsApi";
import {
  findDefaultNoteId,
  findFolderNode,
  findNodeById,
  findNoteNode,
  matchAndPreserveIds,
  normalizeExplorerNode,
  updateFolderInTree,
} from "../../lib/treeUtils";
import { ExplorerNode, FolderItem, TopLevelFolder } from "../../types";
import {
  areNodeTreesEqual,
  hasPendingDiskOperations,
  mapFolderById,
} from "../storeHelpers";
import { NotesSlice, SyncSliceState } from "../types";

async function refreshLoadedSubfolders(
  scannedList: ExplorerNode[],
  existingList: ExplorerNode[],
  expandedSet: Set<string>,
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
            (existingFolder.children && existingFolder.children.length > 0))) ||
        expandedSet.has(node.id) ||
        (existingFolder && expandedSet.has(existingFolder.id)),
      );
      if (!wasLoadedOrExpanded) return node;

      try {
        const diskChildren = await fsApi.readDir(node.folderPath);
        const existingChildren =
          existingFolder?.children || node.children || [];
        const refreshedChildren = await refreshLoadedSubfolders(
          diskChildren,
          existingChildren,
          expandedSet,
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
    }),
  );
}

export const createSyncSlice: NotesSlice<SyncSliceState> = (set, get) => ({
  lastSyncTimeByFolder: {},
  activeNoteContents: {},
  loadingNoteIds: {},
  isSyncingFolderId: null,

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
          if (n?.content) {
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
          folders: mapFolderById(state.folders, activeFolderId, (folder) => ({
            ...folder,
            name: folder.name === "Untitled Folder" ? rootName : folder.name,
            items: [...folder.items, ...items],
            localPath: localPath ?? folder.localPath,
          })),
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

  syncFolderFromDisk: async (folderId) => {
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
      const mergedItems = await refreshLoadedSubfolders(
        result.items,
        latestFolder.items,
        expandedSet,
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

  linkFolderToDisk: async (folderId, localPath) => {
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

  unlinkFolderFromDisk: (folderId) => {
    set((state) => ({
      folders: mapFolderById(state.folders, folderId, (f) => ({
        ...f,
        localPath: undefined,
      })),
    }));
  },

  openLocalFolderAsTab: async (localPath, customName) => {
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
});
