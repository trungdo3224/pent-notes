import React from "react";
import {
  Code,
  Columns2,
  Copy,
  FilePlus,
  Files,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  FolderUp,
  Link2,
  Pencil,
  Rows2,
  Trash2,
  Unlink,
} from "lucide-react";
import { FolderItem, NoteItem } from "../../types";
import { FloatingContextMenu } from "../shared/FloatingContextMenu";

export type ExplorerContextMenuState =
  | {
      kind: "note";
      note: NoteItem;
      parentFolderId: string | null;
      x: number;
      y: number;
    }
  | {
      kind: "subfolder";
      subfolder: FolderItem;
      x: number;
      y: number;
    }
  | {
      kind: "root";
      x: number;
      y: number;
    };

interface CreateInFolderMenuItemsProps {
  parentFolderId: string | null;
  onClose: () => void;
  onCreateNote: (parentFolderId: string | null) => Promise<unknown> | void;
  onCreateCodeFile: (parentFolderId: string | null) => Promise<unknown> | void;
  onCreateSubfolder: (parentFolderId: string | null) => Promise<unknown> | void;
}

const CreateInFolderMenuItems: React.FC<CreateInFolderMenuItemsProps> = ({
  parentFolderId,
  onClose,
  onCreateNote,
  onCreateCodeFile,
  onCreateSubfolder,
}) => (
  <>
    <button
      type="button"
      className="dropdown-menu-item"
      role="menuitem"
      onClick={() => {
        onClose();
        void onCreateNote(parentFolderId);
      }}
    >
      <FilePlus size={14} strokeWidth={1.8} />
      <span>New note</span>
    </button>

    <button
      type="button"
      className="dropdown-menu-item"
      role="menuitem"
      onClick={() => {
        onClose();
        void onCreateCodeFile(parentFolderId);
      }}
    >
      <Code size={14} strokeWidth={1.8} />
      <span>New code file</span>
    </button>

    <button
      type="button"
      className="dropdown-menu-item"
      role="menuitem"
      onClick={() => {
        onClose();
        void onCreateSubfolder(parentFolderId);
      }}
    >
      <FolderPlus size={14} strokeWidth={1.8} />
      <span>New subfolder</span>
    </button>
  </>
);

export interface ExplorerContextMenuProps {
  contextMenu: ExplorerContextMenuState | null;
  folderName: string;
  selectedNoteId: string | null;
  isLinkedWithCurrent: boolean;
  onClose: () => void;
  onSelectNote: (noteId: string) => void;
  onSplitPane: (direction: "horizontal" | "vertical", noteId: string) => void;
  onCreateNote: (parentFolderId: string | null) => Promise<unknown> | void;
  onCreateCodeFile: (parentFolderId: string | null) => Promise<unknown> | void;
  onCreateSubfolder: (parentFolderId: string | null) => Promise<unknown> | void;
  onStartNoteRename: (note: NoteItem) => void;
  onToggleNoteLink: (sourceNoteId: string, targetNoteId: string) => void;
  onDuplicateNote: (
    noteId: string,
    parentFolderId: string | null,
  ) => Promise<unknown> | void;
  onDeleteNode: (nodeId: string) => void;
  onStartSubfolderRename: (subfolder: FolderItem) => void;
  onImportNotesHere: () => void;
  onAddSubfolder: () => void;
}

/**
 * Right-click context menu for notes, subfolders, and root folder area in FolderExplorer.
 */
export const ExplorerContextMenu: React.FC<ExplorerContextMenuProps> = ({
  contextMenu,
  folderName,
  selectedNoteId,
  isLinkedWithCurrent,
  onClose,
  onSelectNote,
  onSplitPane,
  onCreateNote,
  onCreateCodeFile,
  onCreateSubfolder,
  onStartNoteRename,
  onToggleNoteLink,
  onDuplicateNote,
  onDeleteNode,
  onStartSubfolderRename,
  onImportNotesHere,
  onAddSubfolder,
}) => (
  <FloatingContextMenu
    isOpen={Boolean(contextMenu)}
    x={contextMenu?.x ?? 0}
    y={contextMenu?.y ?? 0}
    onClose={onClose}
    className="explorer-context-menu"
    ariaLabel="Sidebar context actions"
  >
    {contextMenu?.kind === "note" && (
      <>
        <div className="context-menu-header">
          <FileText size={12} className="context-menu-header-icon" />
          <span>{contextMenu.note.title.trim() || "Untitled"}</span>
        </div>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetId = contextMenu.note.id;
            onClose();
            onSelectNote(targetId);
          }}
        >
          <FileText size={14} strokeWidth={1.8} />
          <span>Open note</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetNoteId = contextMenu.note.id;
            onClose();
            onSplitPane("horizontal", targetNoteId);
          }}
        >
          <Columns2 size={14} strokeWidth={1.8} />
          <span>Split right</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetNoteId = contextMenu.note.id;
            onClose();
            onSplitPane("vertical", targetNoteId);
          }}
        >
          <Rows2 size={14} strokeWidth={1.8} />
          <span>Split down</span>
        </button>

        <CreateInFolderMenuItems
          parentFolderId={contextMenu.parentFolderId}
          onClose={onClose}
          onCreateNote={onCreateNote}
          onCreateCodeFile={onCreateCodeFile}
          onCreateSubfolder={onCreateSubfolder}
        />

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetNote = contextMenu.note;
            onClose();
            onStartNoteRename(targetNote);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
          <span>Rename note</span>
        </button>

        {selectedNoteId && selectedNoteId !== contextMenu.note.id && (
          <button
            type="button"
            className="dropdown-menu-item is-link-item"
            role="menuitem"
            onClick={() => {
              const targetId = contextMenu.note.id;
              onClose();
              onToggleNoteLink(selectedNoteId, targetId);
            }}
          >
            {isLinkedWithCurrent ? (
              <>
                <Unlink size={14} strokeWidth={1.9} />
                <span>Unlink from current note</span>
              </>
            ) : (
              <>
                <Link2 size={14} strokeWidth={1.9} />
                <span>Link with current note</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const title = contextMenu.note.title.trim() || "Untitled";
            onClose();
            void navigator.clipboard?.writeText(`[[${title}]]`);
          }}
        >
          <Copy size={14} strokeWidth={1.8} />
          <span>Copy [[WikiLink]]</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const { note: targetNote, parentFolderId } = contextMenu;
            onClose();
            void onDuplicateNote(targetNote.id, parentFolderId);
          }}
        >
          <Files size={14} strokeWidth={1.8} />
          <span>Duplicate note</span>
        </button>

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item is-danger"
          role="menuitem"
          onClick={() => {
            const targetId = contextMenu.note.id;
            onClose();
            onDeleteNode(targetId);
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          <span>Delete note</span>
        </button>
      </>
    )}

    {contextMenu?.kind === "subfolder" && (
      <>
        <div className="context-menu-header">
          <Folder size={12} className="context-menu-header-icon" />
          <span>{contextMenu.subfolder.name}</span>
        </div>

        <CreateInFolderMenuItems
          parentFolderId={contextMenu.subfolder.id}
          onClose={onClose}
          onCreateNote={onCreateNote}
          onCreateCodeFile={onCreateCodeFile}
          onCreateSubfolder={onCreateSubfolder}
        />

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetFolder = contextMenu.subfolder;
            onClose();
            onStartSubfolderRename(targetFolder);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
          <span>Rename subfolder</span>
        </button>

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item is-danger"
          role="menuitem"
          onClick={() => {
            const targetId = contextMenu.subfolder.id;
            onClose();
            onDeleteNode(targetId);
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          <span>Delete subfolder</span>
        </button>
      </>
    )}

    {contextMenu?.kind === "root" && (
      <>
        <div className="context-menu-header">
          <Folder size={12} className="context-menu-header-icon" />
          <span>{folderName}</span>
        </div>

        <CreateInFolderMenuItems
          parentFolderId={null}
          onClose={onClose}
          onCreateNote={onCreateNote}
          onCreateCodeFile={onCreateCodeFile}
          onCreateSubfolder={onCreateSubfolder}
        />

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            onImportNotesHere();
          }}
        >
          <FileUp size={14} strokeWidth={1.8} />
          <span>Import notes here...</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            onAddSubfolder();
          }}
        >
          <FolderUp size={14} strokeWidth={1.8} />
          <span>Add subfolder...</span>
        </button>
      </>
    )}
  </FloatingContextMenu>
);
