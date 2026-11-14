import {
  appendWikiLinkToContent,
  removeWikiLinkFromContent,
  resolveWorkspaceConnections,
} from "../../lib/catalogUtils";
import {
  createId,
  isCodeFileName,
  sanitizeFilename,
} from "../../lib/fileUtils";
import { fsApi } from "../../lib/fsApi";
import { getDirname, joinPath } from "../../lib/pathUtils";
import {
  findFolderNode,
  findNodeById,
  findNoteAcrossFolders,
  findNoteNode,
  insertIntoTree,
  removeNodeFromTree,
  updateFolderInTree,
  updateNoteInTree,
} from "../../lib/treeUtils";
import { FolderItem, NoteItem, TopLevelFolder } from "../../types";
import {
  applyCloseTabs,
  buildDuplicateDiskFilename,
  buildOpenNoteStateUpdate,
  CONTENT_SAVE_DEBOUNCE_MS,
  contentSaveTimers,
  findNoteInFolderOrNull,
  getActiveFolderIdForCloseTabs,
  getSelectedTopFolder,
  insertAndPersistNote,
  isNotePendingSave,
  mapFolderById,
  resolveParentDiskPath,
  TITLE_RENAME_DEBOUNCE_MS,
  titleRenameTimers,
} from "../storeHelpers";
import { NotesSlice, NotesSliceState, NotesState } from "../types";

async function readOrLoadNoteContent(
  state: NotesState,
  note: NoteItem,
): Promise<string> {
  if (state.activeNoteContents[note.id] !== undefined) {
    return state.activeNoteContents[note.id];
  }
  if (note.filePath) {
    return await state.loadNoteContent(note.id, note.filePath);
  }
  return note.content;
}

function writeDiskNoteIfChanged(
  filePath: string | undefined,
  prevContent: string,
  nextContent: string,
  errorLabel: string,
): void {
  if (!filePath || nextContent === prevContent) return;
  void fsApi.writeFile(filePath, nextContent).catch((err) => {
    console.error(errorLabel, err);
  });
}

function resolveUpdatedNoteFileName(
  title: string,
  currentFilePath: string,
  currentFileType: NoteItem["fileType"],
): { newFileName: string; nextFileType: NoteItem["fileType"] } {
  const cleanName = sanitizeFilename(title.trim());
  const oldExt = currentFilePath.includes(".")
    ? currentFilePath.slice(currentFilePath.lastIndexOf("."))
    : ".md";

  if (isCodeFileName(cleanName)) {
    return { newFileName: cleanName, nextFileType: "code" };
  }
  if (cleanName.toLowerCase().endsWith(".md")) {
    return { newFileName: cleanName, nextFileType: "markdown" };
  }
  if (
    currentFileType === "code" ||
    currentFileType === "pdf" ||
    currentFileType === "image"
  ) {
    const newFileName = /\.[a-z0-9_-]+$/i.test(cleanName)
      ? cleanName
      : `${cleanName}${oldExt}`;
    return { newFileName, nextFileType: currentFileType };
  }
  return { newFileName: `${cleanName}.md`, nextFileType: "markdown" };
}

export const createNotesSlice: NotesSlice<NotesSliceState> = (set, get) => ({
  selectedNoteByFolder: {},
  openNotesByFolder: {},
  pendingRenameNodeId: null,
  shouldFocusNoteTitle: false,

  selectNote: (noteId) => {
    const state = get();
    if (!state.selectedFolderId) return;
    const targetFolder = state.folders.find(
      (f) => f.id === state.selectedFolderId,
    );
    const targetNote = findNoteInFolderOrNull(targetFolder, noteId);
    if (
      targetNote?.filePath &&
      targetNote.fileType !== "pdf" &&
      targetNote.fileType !== "image" &&
      state.activeNoteContents[noteId] === undefined
    ) {
      void get().loadNoteContent(noteId, targetNote.filePath);
    }

    set((s) =>
      s.selectedFolderId
        ? buildOpenNoteStateUpdate(s, s.selectedFolderId, noteId)
        : s,
    );
  },

  closeNoteTab: (noteId, folderId) =>
    set((state) => {
      const targetFolderId = getActiveFolderIdForCloseTabs(state, folderId);
      if (!targetFolderId) return state;
      return applyCloseTabs(state, targetFolderId, (id) => id !== noteId);
    }),

  closeOtherNoteTabs: (noteId, folderId) =>
    set((state) => {
      const targetFolderId = getActiveFolderIdForCloseTabs(state, folderId);
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
      const targetFolderId = getActiveFolderIdForCloseTabs(state, folderId);
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
      const targetFolderId = getActiveFolderIdForCloseTabs(state, folderId);
      if (!targetFolderId) return state;
      const targetFolder = state.folders.find((f) => f.id === targetFolderId);
      return applyCloseTabs(state, targetFolderId, (id) => {
        const noteNode = findNoteInFolderOrNull(targetFolder, id);
        return isNotePendingSave(id, noteNode?.filePath);
      });
    }),

  closeAllNoteTabs: (folderId) =>
    set((state) => {
      const targetFolderId = getActiveFolderIdForCloseTabs(state, folderId);
      if (!targetFolderId) return state;
      return applyCloseTabs(state, targetFolderId, () => false);
    }),

  navigateToNote: (topFolderId, noteId) =>
    set((state) =>
      buildOpenNoteStateUpdate(state, topFolderId, noteId, {
        setSelectedFolder: true,
      }),
    ),

  toggleNoteLink: async (activeNoteId, targetNoteId) => {
    if (!activeNoteId || !targetNoteId || activeNoteId === targetNoteId) return;
    const state = get();
    const activeNote = findNoteAcrossFolders(state.folders, activeNoteId)?.note;
    const targetNote = findNoteAcrossFolders(state.folders, targetNoteId)?.note;
    if (!activeNote || !targetNote) return;

    const activeCurrentContent = await readOrLoadNoteContent(state, activeNote);
    const targetCurrentContent = await readOrLoadNoteContent(state, targetNote);

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

      writeDiskNoteIfChanged(
        activeNote.filePath,
        activeCurrentContent,
        nextActiveContent,
        "Failed to write unlinked active note to disk:",
      );
      writeDiskNoteIfChanged(
        targetNote.filePath,
        targetCurrentContent,
        nextTargetContent,
        "Failed to write unlinked target note to disk:",
      );
      return;
    }

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

    writeDiskNoteIfChanged(
      activeNote.filePath,
      activeCurrentContent,
      nextActiveContent,
      "Failed to write linked active note to disk:",
    );
  },

  createNote: async (parentFolderId) =>
    await insertAndPersistNote(set, get, {
      parentFolderId,
      title: "Untitled Note",
      content: "",
      cachedContent: "",
      diskFileName: "Untitled Note.md",
      setFocusNoteTitle: true,
    }),

  createCodeFile: async (parentFolderId, customFileName) => {
    const rawFileName = customFileName?.trim() || "script.py";
    return await insertAndPersistNote(set, get, {
      parentFolderId,
      title: rawFileName,
      content: "",
      cachedContent: "",
      fileType: "code",
      diskFileName: rawFileName,
      syncFileTypeOnDisk: true,
      setFocusNoteTitle: true,
    });
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

    return await insertAndPersistNote(set, get, {
      parentFolderId,
      title: copyTitle,
      content: parentPath ? "" : sourceContent,
      cachedContent: sourceContent,
      fileType: sourceNote.fileType,
      pdfData: sourceNote.pdfData,
      diskFileName: buildDuplicateDiskFilename(sourceNote, copyTitle),
    });
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
          folders: mapFolderById(s.folders, s.selectedFolderId, (folder) => ({
            ...folder,
            items: updateFolderInTree(folder.items, newSubfolder.id, {
              name: diskFolder.name,
              folderPath: diskFolder.folderPath,
            }),
          })),
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

    const targetSubfolder = findFolderNode(currentFolder.items, subfolderId);
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
      const newFolderPath = joinPath(parentDir, sanitizeFilename(newName));
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
    const containingFolder: TopLevelFolder | null =
      findNoteAcrossFolders(state.folders, noteId)?.folder ??
      getSelectedTopFolder(state);
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
          const { newFileName, nextFileType } = resolveUpdatedNoteFileName(
            updates.title!,
            currentFilePath,
            targetNote.fileType,
          );
          const newPath = joinPath(dir, newFileName);
          if (newPath !== currentFilePath) {
            const actualPath = await fsApi.renamePath(currentFilePath, newPath);
            set((s) => ({
              folders: mapFolderById(s.folders, targetFolderId, (folder) => ({
                ...folder,
                items: updateNoteInTree(folder.items, noteId, {
                  filePath: actualPath,
                  fileType: nextFileType,
                }),
              })),
            }));
          }
        } catch (err) {
          console.error("Failed to rename note file on disk:", err);
        }
      }, TITLE_RENAME_DEBOUNCE_MS);
      titleRenameTimers.set(noteId, timer);
    }
  },
});
