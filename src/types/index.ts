export interface NoteItem {
  id: string;
  type: "note";
  title: string;
  content: string;
  updatedAt: string;
  filePath?: string;
  fileType?: "markdown" | "pdf";
  pdfData?: string;
}

export interface FolderItem {
  id: string;
  type: "folder";
  name: string;
  children: ExplorerNode[];
  folderPath?: string;
  hasChildren?: boolean;
  isLoaded?: boolean;
}

export type ExplorerNode = FolderItem | NoteItem;

export type TabGroupColorId =
  "cyan" | "emerald" | "amber" | "purple" | "rose" | "blue";

export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColorId;
  collapsed?: boolean;
}

export interface TopLevelFolder {
  id: string;
  name: string;
  items: ExplorerNode[];
  localPath?: string;
  groupId?: string;
}

export type EditorViewMode = "obsidian" | "notebook" | "write" | "preview";

export type SplitDirection = "horizontal" | "vertical";

export interface PaneLeafNode {
  id: string;
  type: "leaf";
  folderId: string | null;
  noteId: string | null;
  viewMode: EditorViewMode;
}

export interface PaneBranchNode {
  id: string;
  type: "branch";
  direction: SplitDirection;
  children: PaneLayoutNode[];
  sizes: number[];
}

export type PaneLayoutNode = PaneLeafNode | PaneBranchNode;

export type SortOrder = "name-asc" | "name-desc" | "date-desc" | "date-asc";

export type LinkModalTargetMode = "new-tab" | "subfolder" | "current-tab";

export type CatalogTab = "outline" | "tags" | "info";
