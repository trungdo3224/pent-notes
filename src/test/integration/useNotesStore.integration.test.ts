import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fsApi } from "../../lib/fsApi";
import { getAllLeaves } from "../../lib/paneLayoutTree";
import { findFolderNode, findNoteNode } from "../../lib/treeUtils";
import { useNotesStore } from "../../store/useNotesStore";
import { resetNotesStore } from "../testUtils";

describe("useNotesStore integration workflows", () => {
  beforeEach(() => {
    resetNotesStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("manages top-level folders and tab groups lifecycle end-to-end", () => {
    const store = useNotesStore.getState();

    store.createTopFolder();
    store.createTopFolder();
    const firstFolders = useNotesStore.getState().folders;
    expect(firstFolders).toHaveLength(2);

    const [f1, f2] = firstFolders;
    useNotesStore.getState().renameTopFolder(f1.id, "Recon");
    useNotesStore.getState().renameTopFolder(f2.id, "Exploit");

    const groupId = useNotesStore
      .getState()
      .createTabGroupFromFolder(f1.id, "RedOps", "emerald");
    useNotesStore.getState().assignFolderToTabGroup(f2.id, groupId);

    let state = useNotesStore.getState();
    expect(state.tabGroups).toHaveLength(1);
    expect(state.tabGroups[0]).toMatchObject({
      id: groupId,
      name: "RedOps",
      color: "emerald",
    });
    expect(state.folders.every((f) => f.groupId === groupId)).toBe(true);

    useNotesStore.getState().renameTabGroup(groupId, "Engagement");
    useNotesStore.getState().setTabGroupColor(groupId, "rose");
    expect(useNotesStore.getState().tabGroups[0]).toMatchObject({
      name: "Engagement",
      color: "rose",
    });

    // Reorder f2 before f1 inside same group
    useNotesStore.getState().reorderTopFolders(f2.id, f1.id, "before", groupId);
    expect(useNotesStore.getState().folders.map((f) => f.id)).toEqual([
      f2.id,
      f1.id,
    ]);

    // Deleting one folder keeps non-empty group; ungrouping removes group
    useNotesStore.getState().deleteTopFolder(f2.id);
    expect(useNotesStore.getState().folders.map((f) => f.id)).toEqual([f1.id]);
    expect(useNotesStore.getState().tabGroups).toHaveLength(1);

    useNotesStore.getState().ungroupTabGroup(groupId);
    state = useNotesStore.getState();
    expect(state.tabGroups).toHaveLength(0);
    expect(state.folders[0].groupId).toBeUndefined();
  });

  it("creates notes, code files, subfolders, duplicates notes, navigates deeply, and toggles wikilinks", async () => {
    const store = useNotesStore.getState();
    store.createTopFolder();
    const topFolderId = useNotesStore.getState().folders[0].id;
    useNotesStore.getState().renameTopFolder(topFolderId, "Audit");

    const subId = await useNotesStore.getState().createSubfolder(null);
    expect(subId).toBeTruthy();
    useNotesStore.getState().renameSubfolder(subId!, "Findings");

    const noteId = await useNotesStore.getState().createNote(subId!);
    const codeId = await useNotesStore
      .getState()
      .createCodeFile(subId!, "poc.py");
    expect(noteId).toBeTruthy();
    expect(codeId).toBeTruthy();

    useNotesStore.getState().updateNote(noteId!, {
      title: "SQL Injection",
      content: "Initial finding details",
    });

    const dupId = await useNotesStore.getState().duplicateNote(noteId!, subId!);
    expect(dupId).toBeTruthy();
    const dupNode = findNoteNode(
      useNotesStore.getState().folders[0].items,
      dupId!,
    );
    expect(dupNode?.title).toBe("SQL Injection (Copy)");
    expect(dupNode?.content).toBe("Initial finding details");

    // Link SQL Injection -> poc.py and verify wikilink append + removal
    await useNotesStore.getState().toggleNoteLink(noteId!, codeId!);
    expect(useNotesStore.getState().activeNoteContents[noteId!]).toContain(
      "[[poc.py]]",
    );

    await useNotesStore.getState().toggleNoteLink(noteId!, codeId!);
    expect(useNotesStore.getState().activeNoteContents[noteId!]).not.toContain(
      "[[poc.py]]",
    );

    // Collapse subfolder then navigateToNote should re-expand its ancestor chain
    useNotesStore.getState().collapseAllSubfolders();
    expect(useNotesStore.getState().expandedFolderIds).not.toContain(subId);

    useNotesStore.getState().navigateToNote(topFolderId, noteId!);
    expect(useNotesStore.getState().expandedFolderIds).toContain(subId);
    expect(useNotesStore.getState().selectedNoteByFolder[topFolderId]).toBe(
      noteId,
    );

    // Tab close operations
    expect(useNotesStore.getState().openNotesByFolder[topFolderId]).toEqual([
      noteId,
      codeId,
      dupId,
    ]);
    useNotesStore.getState().closeNotesToTheRight(codeId!, topFolderId);
    expect(useNotesStore.getState().openNotesByFolder[topFolderId]).toEqual([
      noteId,
      codeId,
    ]);
    useNotesStore.getState().closeOtherNoteTabs(noteId!, topFolderId);
    expect(useNotesStore.getState().openNotesByFolder[topFolderId]).toEqual([
      noteId,
    ]);
    useNotesStore.getState().closeAllNoteTabs(topFolderId);
    expect(useNotesStore.getState().openNotesByFolder[topFolderId]).toEqual([]);
    expect(
      useNotesStore.getState().selectedNoteByFolder[topFolderId],
    ).toBeNull();
  });

  it("orchestrates multi-pane split view lifecycle, resizing, switching, and closing", async () => {
    useNotesStore.getState().createTopFolder();
    const folderId = useNotesStore.getState().folders[0].id;
    const n1 = await useNotesStore.getState().createNote(null);
    const n2 = await useNotesStore.getState().createNote(null);
    const n3 = await useNotesStore.getState().createNote(null);

    useNotesStore.getState().selectNote(n1!);
    useNotesStore.getState().openInSplitView(folderId, n2!, "horizontal");

    let state = useNotesStore.getState();
    expect(state.isSplitViewActive).toBe(true);
    let leaves = getAllLeaves(state.paneLayout);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.noteId)).toEqual([n1, n2]);

    // Split second pane vertically with third note
    const secondLeafId = leaves[1].id;
    useNotesStore.getState().splitPane("vertical", folderId, n3!, secondLeafId);
    leaves = getAllLeaves(useNotesStore.getState().paneLayout);
    expect(leaves).toHaveLength(3);

    // Reassign leaf note & resize root branch
    const thirdLeafId = leaves[2].id;
    useNotesStore.getState().setPaneNote(thirdLeafId, folderId, n1!);
    expect(getAllLeaves(useNotesStore.getState().paneLayout)[2]?.noteId).toBe(
      n1,
    );

    const rootBranchId = useNotesStore.getState().paneLayout!.id;
    useNotesStore.getState().resizePaneBranch(rootBranchId, 0, 0.2);
    const branch = useNotesStore.getState().paneLayout;
    expect(branch?.type === "branch" ? branch.sizes[0] : 0).toBeCloseTo(0.7);

    useNotesStore.getState().resetPaneSizes(rootBranchId);
    const resetBranch = useNotesStore.getState().paneLayout;
    expect(resetBranch?.type === "branch" ? resetBranch.sizes : []).toEqual([
      0.5, 0.5,
    ]);

    // Close down to 1 pane exits split view and selects remaining leaf's note
    useNotesStore.getState().closeOtherPanes(secondLeafId);
    state = useNotesStore.getState();
    expect(state.isSplitViewActive).toBe(false);
    expect(state.paneLayout).toBeNull();
    expect(state.selectedNoteByFolder[folderId]).toBe(n2);
  });

  it("syncs local folders from disk, lazy-loads note content, and loads subfolder children", async () => {
    const scanSpy = vi.spyOn(fsApi, "scanFolder").mockResolvedValue({
      rootName: "VaultDisk",
      rootPath: "C:/VaultDisk",
      items: [
        {
          id: "sub-disk",
          type: "folder",
          name: "Reports",
          folderPath: "C:/VaultDisk/Reports",
          hasChildren: true,
          children: [],
        },
        {
          id: "note-disk",
          type: "note",
          title: "Overview",
          content: "",
          filePath: "C:/VaultDisk/Overview.md",
          fileType: "markdown",
          updatedAt: "2026-02-01",
        },
      ],
    });
    const readFileSpy = vi
      .spyOn(fsApi, "readFile")
      .mockResolvedValue("# Loaded from disk");
    const readDirSpy = vi.spyOn(fsApi, "readDir").mockResolvedValue([
      {
        id: "child-note",
        type: "note",
        title: "Summary",
        content: "",
        filePath: "C:/VaultDisk/Reports/Summary.md",
        fileType: "markdown",
        updatedAt: "2026-02-02",
      },
    ]);

    const opened = await useNotesStore
      .getState()
      .openLocalFolderAsTab("C:/VaultDisk");
    expect(opened).toBe(true);
    expect(scanSpy).toHaveBeenCalledWith("C:/VaultDisk");

    const topFolder = useNotesStore.getState().folders[0];
    expect(topFolder.name).toBe("VaultDisk");

    const loadedText = await useNotesStore
      .getState()
      .loadNoteContent("note-disk", "C:/VaultDisk/Overview.md");
    expect(readFileSpy).toHaveBeenCalledWith("C:/VaultDisk/Overview.md");
    expect(loadedText).toBe("# Loaded from disk");

    // Expanding disk-backed subfolder triggers lazy readDir
    useNotesStore.getState().toggleSubfolderCollapse("sub-disk");
    await vi.waitFor(() => {
      const sub = findFolderNode(
        useNotesStore.getState().folders[0].items,
        "sub-disk",
      );
      expect(sub?.isLoaded).toBe(true);
      expect(sub?.children).toHaveLength(1);
    });
    expect(readDirSpy).toHaveBeenCalledWith("C:/VaultDisk/Reports");
  });
});
