import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveNoteFileType,
  triggerBrowserDownload,
} from "../../lib/fileUtils";
import { fsApi } from "../../lib/fsApi";
import { createLeafNode } from "../../lib/paneLayoutTree";
import {
  findNoteAcrossFolders,
  findNoteAndPathAcrossFolders,
} from "../../lib/treeUtils";
import {
  applyCloseTabs,
  buildOpenNoteStateUpdate,
  exitSplitViewState,
} from "../../store/storeHelpers";
import { useNotesStore } from "../../store/useNotesStore";
import { NoteItem, PaneBranchNode, TopLevelFolder } from "../../types";
import { resetNotesStore } from "../testUtils";

function makeNote(
  id: string,
  title: string,
  extra?: Partial<NoteItem>,
): NoteItem {
  return {
    id,
    type: "note",
    title,
    content: "",
    updatedAt: "2026-03-01",
    fileType: "markdown",
    ...extra,
  };
}

function makeFolders(): TopLevelFolder[] {
  return [
    {
      id: "top-a",
      name: "Alpha",
      items: [makeNote("n-1", "Root Note")],
    },
    {
      id: "top-b",
      name: "Beta",
      items: [
        {
          id: "sub-1",
          type: "folder",
          name: "Subdir",
          children: [makeNote("n-2", "Nested Note"), makeNote("n-3", "Third")],
        },
      ],
    },
  ];
}

describe("Extracted lib and store helpers", () => {
  afterEach(() => {
    resetNotesStore();
    delete window.electronAPI;
    vi.restoreAllMocks();
  });

  it("finds notes and breadcrumb paths across folders with preferredFolderId priority", () => {
    const folders = makeFolders();

    const direct = findNoteAcrossFolders(folders, "n-2");
    expect(direct?.folder.id).toBe("top-b");
    expect(direct?.note.title).toBe("Nested Note");

    const preferredFallback = findNoteAndPathAcrossFolders(
      folders,
      "n-2",
      "top-a",
    );
    expect(preferredFallback?.folder.id).toBe("top-b");
    expect(preferredFallback?.path).toEqual(["Beta", "Subdir", "Nested Note"]);

    // Duplicate ID across two folders resolves preferredFolderId first
    const duplicateFolders: TopLevelFolder[] = [
      { id: "top-1", name: "First", items: [makeNote("shared", "In First")] },
      { id: "top-2", name: "Second", items: [makeNote("shared", "In Second")] },
    ];
    const preferred = findNoteAcrossFolders(
      duplicateFolders,
      "shared",
      "top-2",
    );
    expect(preferred?.note.title).toBe("In Second");

    expect(findNoteAcrossFolders(folders, "missing")).toBeNull();
    expect(findNoteAndPathAcrossFolders(folders, "missing")).toBeNull();
  });

  it("normalizes viewer types via resolveNoteFileType for filenames and NoteItems", () => {
    expect(resolveNoteFileType("report.pdf")).toBe("pdf");
    expect(resolveNoteFileType("diagram.webp")).toBe("image");
    expect(resolveNoteFileType("script.ts")).toBe("code");
    expect(resolveNoteFileType("notes.md")).toBe("markdown");

    expect(
      resolveNoteFileType({
        fileType: undefined,
        pdfData: "data:application/pdf;base64,abc",
      }),
    ).toBe("pdf");
    expect(
      resolveNoteFileType({
        fileType: undefined,
        imageData: "data:image/png;base64,abc",
      }),
    ).toBe("image");
    expect(
      resolveNoteFileType({ fileType: "code", filePath: "/tmp/app.rs" }),
    ).toBe("code");
    expect(
      resolveNoteFileType({ fileType: undefined, title: "Plain note" }),
    ).toBe("markdown");
  });

  it("triggers transient anchor downloads via triggerBrowserDownload and no-ops when empty", () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    triggerBrowserDownload("", "empty.txt");
    expect(appendSpy).not.toHaveBeenCalled();

    triggerBrowserDownload("blob:demo-url", "report.pdf");
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("blob:demo-url");
    expect(anchor.getAttribute("download")).toBe("report.pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(document.body.contains(anchor)).toBe(false);
  });

  it("resolves raw file URLs via Electron bridge when present or HTTP fallback otherwise", () => {
    expect(fsApi.getRawFileUrl("C:/notes/diagram.png")).toBe(
      `/api/fs/raw?path=${encodeURIComponent("C:/notes/diagram.png")}`,
    );

    const getRawUrl = vi.fn(() => "pent://raw/diagram.png");
    window.electronAPI = {
      isElectron: true,
      platform: "win32",
      fs: {
        getRawUrl,
      },
    } as unknown as NonNullable<Window["electronAPI"]>;

    expect(fsApi.getRawFileUrl("C:/notes/diagram.png")).toBe(
      "pent://raw/diagram.png",
    );
    expect(getRawUrl).toHaveBeenCalledWith("C:/notes/diagram.png");
  });

  it("builds open-note state patches in single-pane and multi-pane split layouts", () => {
    resetNotesStore();
    const folders = makeFolders();
    useNotesStore.setState({
      folders,
      selectedFolderId: "top-a",
      openNotesByFolder: { "top-b": ["n-3"] },
      collapsedSubfolderIds: ["sub-1"],
      expandedFolderIds: [],
      selectedNoteByFolder: { "top-a": "n-1", "top-b": "n-3" },
      isSplitViewActive: false,
      paneLayout: null,
      activePaneId: null,
    });

    const singlePatch = buildOpenNoteStateUpdate(
      useNotesStore.getState(),
      "top-b",
      "n-2",
      { setSelectedFolder: true },
    );
    expect(singlePatch.selectedFolderId).toBe("top-b");
    expect(singlePatch.openNotesByFolder?.["top-b"]).toEqual(["n-3", "n-2"]);
    expect(singlePatch.expandedFolderIds).toContain("sub-1");
    expect(singlePatch.collapsedSubfolderIds).toEqual([]);
    expect(singlePatch.selectedNoteByFolder?.["top-b"]).toBe("n-2");

    // Multi-pane split updates only the active pane and leaves single selection synced for leaf 0
    const leftLeaf = { ...createLeafNode("top-a", "n-1"), id: "pane-left" };
    const rightLeaf = { ...createLeafNode("top-b", "n-3"), id: "pane-right" };
    const splitTree: PaneBranchNode = {
      type: "branch",
      id: "branch-1",
      direction: "horizontal",
      sizes: [50, 50],
      children: [leftLeaf, rightLeaf],
    };
    useNotesStore.setState({
      isSplitViewActive: true,
      paneLayout: splitTree,
      activePaneId: "pane-right",
    });

    const splitPatch = buildOpenNoteStateUpdate(
      useNotesStore.getState(),
      "top-b",
      "n-2",
    );
    const updatedRight = (splitPatch.paneLayout as PaneBranchNode).children[1];
    expect(updatedRight.type).toBe("leaf");
    if (updatedRight.type === "leaf") {
      expect(updatedRight.noteId).toBe("n-2");
    }
    expect(splitPatch.selectedNoteByFolder).toBeUndefined();
  });

  it("closes filtered tabs, prunes cache/panes, and collapses split view cleanly", () => {
    resetNotesStore();
    const leftLeaf = { ...createLeafNode("top-b", "n-2"), id: "pane-left" };
    const rightLeaf = { ...createLeafNode("top-b", "n-3"), id: "pane-right" };
    const splitTree: PaneBranchNode = {
      type: "branch",
      id: "branch-1",
      direction: "horizontal",
      sizes: [50, 50],
      children: [leftLeaf, rightLeaf],
    };

    useNotesStore.setState({
      openNotesByFolder: { "top-b": ["n-2", "n-3"] },
      selectedNoteByFolder: { "top-b": "n-2" },
      activeNoteContents: { "n-2": "cache a", "n-3": "cache b" },
      paneLayout: splitTree,
      activePaneId: "pane-left",
      isSplitViewActive: true,
    });

    const unchanged = applyCloseTabs(
      useNotesStore.getState(),
      "top-b",
      () => true,
    );
    expect(unchanged).toEqual({});

    const closedPatch = applyCloseTabs(
      useNotesStore.getState(),
      "top-b",
      (id) => id !== "n-2",
    );
    expect(closedPatch.openNotesByFolder?.["top-b"]).toEqual(["n-3"]);
    expect(closedPatch.selectedNoteByFolder?.["top-b"]).toBe("n-3");
    expect(closedPatch.activeNoteContents).toEqual({ "n-3": "cache b" });
    const clearedLeft = (closedPatch.paneLayout as PaneBranchNode).children[0];
    if (clearedLeft.type === "leaf") {
      expect(clearedLeft.noteId).toBeNull();
    }

    const exitPatch = exitSplitViewState(useNotesStore.getState(), rightLeaf);
    expect(exitPatch.isSplitViewActive).toBe(false);
    expect(exitPatch.paneLayout).toBeNull();
    expect(exitPatch.activePaneId).toBeNull();
    expect(exitPatch.selectedFolderId).toBe("top-b");
    expect(exitPatch.selectedNoteByFolder?.["top-b"]).toBe("n-3");

    expect(exitSplitViewState(useNotesStore.getState(), null)).toEqual({
      paneLayout: null,
      activePaneId: null,
      isSplitViewActive: false,
    });
  });
});
