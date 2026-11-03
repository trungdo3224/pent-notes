export interface NoteItem {
  id: string;
  type: 'note';
  title: string;
  content: string;
  updatedAt: string;
  filePath?: string;
  fileType?: 'markdown' | 'pdf';
  pdfData?: string;
}

export interface FolderItem {
  id: string;
  type: 'folder';
  name: string;
  children: ExplorerNode[];
  folderPath?: string;
}

export type ExplorerNode = FolderItem | NoteItem;

export type TabGroupColorId =
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'purple'
  | 'rose'
  | 'blue';

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

export type EditorViewMode = 'write' | 'split' | 'preview';

export type PdfViewMode = 'pdf' | 'split' | 'notes';

export type SortOrder = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc';

export type ImportTargetMode = 'top-folder' | 'subfolder' | 'note';

export type CatalogTab = 'outline' | 'tags' | 'info';



