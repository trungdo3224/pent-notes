import { describe, expect, it } from "vitest";
import {
  buildExplorerTreeFromFiles,
  buildNoteItemsFromFiles,
  getCodeLanguageLabel,
  isCodeFileName,
  isCodeNote,
  isImageNote,
  isPdfNote,
  sanitizeFilename,
} from "../../lib/fileUtils";
import {
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
  removeNodeFromTree,
  resolveActiveNoteData,
  sortExplorerNodes,
  updateFolderInTree,
  updateNoteInTree,
} from "../../lib/treeUtils";
import {
  ExplorerNode,
  FolderItem,
  NoteItem,
  PaneBranchNode,
  TopLevelFolder,
} from "../../types";

function makeNote(
  id: string,
  title: string,
  overrides: Partial<NoteItem> = {},
): NoteItem {
  return {
    id,
    type: "note",
    title,
    content: "",
    updatedAt: "2026-01-01",
    fileType: "markdown",
    ...overrides,
  };
}

function makeFolder(
  id: string,
  name: string,
  children: ExplorerNode[] = [],
  overrides: Partial<FolderItem> = {},
): FolderItem {
  return {
    id,
    type: "folder",
    name,
    children,
    ...overrides,
  };
}

describe("treeUtils", () => {
  const sampleTree: ExplorerNode[] = [
    makeNote("n-root-pdf", "diagram.pdf", {
      fileType: "pdf",
      updatedAt: "2026-01-05",
    }),
    makeNote("n-root-md", "Zebra Note", { updatedAt: "2026-01-03" }),
    makeFolder("f-alpha", "Alpha", [
      makeFolder("f-nested", "Deep", [
        makeNote("n-deep", "Deep Thought", { updatedAt: "2026-01-10" }),
      ]),
      makeNote("n-alpha", "Alpha Note", { updatedAt: "2026-01-02" }),
    ]),
  ];

  it("collects all nested folder IDs recursively", () => {
    expect(collectAllFolderIds(sampleTree)).toEqual(["f-alpha", "f-nested"]);
  });

  it("sorts folders before notes using natural and date comparators", () => {
    const asc = sortExplorerNodes(sampleTree, "name-asc");
    expect(asc.map((n) => n.id)).toEqual([
      "f-alpha",
      "n-root-pdf",
      "n-root-md",
    ]);

    const desc = sortExplorerNodes(sampleTree, "name-desc");
    expect(desc.map((n) => n.id)).toEqual([
      "f-alpha",
      "n-root-md",
      "n-root-pdf",
    ]);

    const dateDesc = sortExplorerNodes(sampleTree, "date-desc");
    expect(dateDesc.map((n) => n.id)).toEqual([
      "f-alpha",
      "n-root-pdf",
      "n-root-md",
    ]);
  });

  it("prefers non-PDF/non-image default notes and falls back cleanly", () => {
    expect(findDefaultNoteId(sampleTree)).toBe("n-root-md");

    const onlyMedia: ExplorerNode[] = [
      makeNote("img-1", "pic.png", { fileType: "image" }),
      makeFolder("f-1", "Sub", [makeNote("md-1", "Inside")]),
    ];
    expect(findDefaultNoteId(onlyMedia)).toBe("img-1");

    const folderOnly: ExplorerNode[] = [
      makeFolder("f-1", "Sub", [makeNote("md-1", "Inside")]),
    ];
    expect(findDefaultNoteId(folderOnly)).toBe("md-1");
  });

  it("resolves notes, paths, ancestor IDs, and active note data", () => {
    expect(findNoteAndPath(sampleTree, "n-deep", ["Root"])).toEqual({
      note: expect.objectContaining({ id: "n-deep" }),
      path: ["Root", "Alpha", "Deep", "Deep Thought"],
    });
    expect(findAncestorFolderIds(sampleTree, "n-deep")).toEqual([
      "f-alpha",
      "f-nested",
    ]);
    expect(findAncestorFolderIds(sampleTree, "f-nested")).toEqual([
      "f-alpha",
      "f-nested",
    ]);
    expect(findFolderNode(sampleTree, "f-nested")?.name).toBe("Deep");
    expect(findNoteNode(sampleTree, "n-alpha")?.title).toBe("Alpha Note");
    expect(findNodeById(sampleTree, "f-alpha")?.id).toBe("f-alpha");

    const topFolder: TopLevelFolder = {
      id: "top-1",
      name: "Workspace",
      items: sampleTree,
    };
    expect(
      resolveActiveNoteData(topFolder, { "top-1": "n-deep" })?.path,
    ).toEqual(["Workspace", "Alpha", "Deep", "Deep Thought"]);
    expect(
      resolveActiveNoteData(topFolder, { "top-1": "missing" })?.note.id,
    ).toBe("n-root-md");
  });

  it("inserts, updates, removes, and normalizes nodes immutably", () => {
    const newNote = makeNote("n-added", "Added");
    const inserted = insertIntoTree(sampleTree, "f-nested", newNote);
    expect(findNoteNode(inserted, "n-added")?.title).toBe("Added");
    expect(findNoteNode(sampleTree, "n-added")).toBeNull();

    const updatedNoteTree = updateNoteInTree(inserted, "n-added", {
      title: "Renamed",
      content: "Hello",
    });
    expect(findNoteNode(updatedNoteTree, "n-added")?.content).toBe("Hello");

    const updatedFolderTree = updateFolderInTree(updatedNoteTree, "f-nested", {
      name: "Deep Renamed",
      isLoaded: true,
    });
    expect(findFolderNode(updatedFolderTree, "f-nested")?.isLoaded).toBe(true);

    const removed = removeNodeFromTree(updatedFolderTree, "n-added");
    expect(findNoteNode(removed, "n-added")).toBeNull();

    const normalized = normalizeExplorerNode(
      makeNote("code-1", "script", {
        fileType: undefined,
        filePath: "/repo/script.ts",
      }),
    );
    expect(normalized).toMatchObject({
      fileType: "code",
      title: "script.ts",
    });
  });

  it("preserves existing IDs and cached children when matching scanned trees", () => {
    const existing: ExplorerNode[] = [
      makeFolder(
        "stable-f",
        "Docs",
        [
          makeNote("stable-n", "Intro", {
            filePath: "/root/Docs/Intro.md",
            content: "Cached content",
          }),
        ],
        { folderPath: "/root/Docs", isLoaded: true },
      ),
    ];

    const scanned: ExplorerNode[] = [
      makeFolder("temp-f", "Docs", [], {
        folderPath: "/root/Docs",
        hasChildren: true,
        isLoaded: false,
      }),
    ];

    const merged = matchAndPreserveIds(scanned, existing);
    const folder = merged[0] as FolderItem;
    expect(folder.id).toBe("stable-f");
    expect(folder.isLoaded).toBe(true);
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({
      id: "stable-n",
      content: "Cached content",
    });
  });
});

describe("paneLayoutTree", () => {
  it("splits leaves, adds sibling on same-direction split, and nests perpendicular splits", () => {
    const leaf1 = createLeafNode("top-1", "n-1", "pane-1");
    const leaf2 = createLeafNode("top-1", "n-2", "pane-2");
    const leaf3 = createLeafNode("top-1", "n-3", "pane-3");

    const branch = splitLeafInTree(leaf1, "pane-1", "horizontal", leaf2);
    expect(branch.type).toBe("branch");
    expect(getAllLeaves(branch).map((l) => l.id)).toEqual(["pane-1", "pane-2"]);

    const threeHorizontal = splitLeafInTree(
      branch,
      "pane-1",
      "horizontal",
      leaf3,
    );
    expect((threeHorizontal as PaneBranchNode).sizes).toEqual([
      0.25, 0.25, 0.5,
    ]);

    const nestedVertical = splitLeafInTree(
      branch,
      "pane-2",
      "vertical",
      leaf3,
    ) as PaneBranchNode;
    expect(nestedVertical.children[1].type).toBe("branch");
    expect((nestedVertical.children[1] as PaneBranchNode).direction).toBe(
      "vertical",
    );
  });

  it("finds, updates, resizes, resets, toggles direction, and unwraps removed leaves", () => {
    const leaf1 = createLeafNode("f1", "n1", "p1");
    const leaf2 = createLeafNode("f1", "n2", "p2");
    const root = splitLeafInTree(
      leaf1,
      "p1",
      "horizontal",
      leaf2,
    ) as PaneBranchNode;

    expect(findLeaf(root, "p2")?.noteId).toBe("n2");
    expect(findLeaf(root, "missing")).toBeNull();

    const updated = updateLeafInTree(root, "p2", (l) => ({
      ...l,
      noteId: "n9",
    }));
    expect(findLeaf(updated, "p2")?.noteId).toBe("n9");

    const resized = resizeBranchInTree(
      updated,
      root.id,
      0,
      0.8,
      0.1,
    ) as PaneBranchNode;
    expect(resized.sizes[0]).toBeCloseTo(0.9);
    expect(resized.sizes[1]).toBeCloseTo(0.1);

    const reset = resetBranchSizes(resized, root.id) as PaneBranchNode;
    expect(reset.sizes).toEqual([0.5, 0.5]);

    const toggled = toggleBranchDirection(reset, root.id) as PaneBranchNode;
    expect(toggled.direction).toBe("vertical");

    const unwrapped = removeLeafFromTree(toggled, "p1");
    expect(unwrapped?.type).toBe("leaf");
    expect(unwrapped?.id).toBe("p2");
    expect(removeLeafFromTree(leaf1, "p1")).toBeNull();
  });
});

describe("fileUtils", () => {
  it("classifies file types and code language labels accurately", () => {
    expect(sanitizeFilename('bad<>:"/\\|?*name.md')).toBe(
      "bad_________name.md",
    );
    expect(isCodeFileName("app.tsx")).toBe(true);
    expect(isCodeFileName("notes.md")).toBe(false);

    expect(isPdfNote({ fileType: undefined, filePath: "/docs/spec.PDF" })).toBe(
      true,
    );
    expect(
      isImageNote({ fileType: undefined, filePath: "/img/shot.webp" }),
    ).toBe(true);
    expect(isCodeNote({ fileType: undefined, filePath: "/src/main.rs" })).toBe(
      true,
    );

    expect(getCodeLanguageLabel("src/script.ts")).toBe("TYPESCRIPT");
    expect(getCodeLanguageLabel("Dockerfile.yml")).toBe("YAML");
    expect(getCodeLanguageLabel(".env")).toBe("CONFIG");
  });

  it("builds note items and ignores dotfiles / node_modules during folder import", async () => {
    const mdFile = new File(["# Hello World"], "readme.md", {
      type: "text/markdown",
    });
    const tsFile = new File(["export const x = 1;"], "index.ts", {
      type: "text/typescript",
    });
    const notes = await buildNoteItemsFromFiles([mdFile, tsFile]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      title: "readme",
      fileType: "markdown",
      content: "# Hello World",
    });
    expect(notes[1]).toMatchObject({
      title: "index.ts",
      fileType: "code",
      content: "export const x = 1;",
    });

    const f1 = new File(["# Doc"], "doc.md");
    Object.defineProperty(f1, "webkitRelativePath", {
      value: "Vault/Guides/doc.md",
    });
    const ignoredGit = new File(["secret"], "config");
    Object.defineProperty(ignoredGit, "webkitRelativePath", {
      value: "Vault/.git/config",
    });
    const ignoredNm = new File(["pkg"], "a.js");
    Object.defineProperty(ignoredNm, "webkitRelativePath", {
      value: "Vault/node_modules/pkg/a.js",
    });

    const tree = await buildExplorerTreeFromFiles([f1, ignoredGit, ignoredNm]);
    expect(tree.rootName).toBe("Vault");
    expect(tree.items).toHaveLength(1);
    const guides = tree.items[0] as FolderItem;
    expect(guides.name).toBe("Guides");
    expect(guides.children).toHaveLength(1);
    expect((guides.children[0] as NoteItem).title).toBe("doc");
  });
});
