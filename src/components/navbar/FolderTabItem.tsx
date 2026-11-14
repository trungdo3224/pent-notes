import React from "react";
import { Folder, HardDrive, Link2, Pencil, Trash2 } from "lucide-react";
import { TopLevelFolder } from "../../types";
import { InlineRenameInput } from "../shared/InlineRenameInput";

export interface FolderTabItemProps {
  folder: TopLevelFolder;
  isSelected: boolean;
  isEditing: boolean;
  draftName: string;
  linkedNoteCount: number;
  firstLinkedNoteId?: string;
  isNavbarCollapsed: boolean;
  isDraggingThis: boolean;
  isContextOpen: boolean;
  dropIndicatorClass: string;
  onChangeDraftName: (name: string) => void;
  onCommitRename: (folderId: string) => void;
  onCancelRename: () => void;
  onSelect: (folder: TopLevelFolder) => void;
  onStartRename: (folder: TopLevelFolder, e?: React.MouseEvent) => void;
  onDelete: (folderId: string) => void;
  onOpenLinkedInSplit: (folderId: string, noteId: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, folder: TopLevelFolder) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, folderId: string) => void;
  onDragOver: (
    e: React.DragEvent<HTMLDivElement>,
    folder: TopLevelFolder,
  ) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, folder: TopLevelFolder) => void;
  onDragEnd: () => void;
}

/**
 * Draggable top-level folder tab card rendered in the workspace navbar.
 */
export const FolderTabItem: React.FC<FolderTabItemProps> = ({
  folder,
  isSelected,
  isEditing,
  draftName,
  linkedNoteCount,
  firstLinkedNoteId,
  isNavbarCollapsed,
  isDraggingThis,
  isContextOpen,
  dropIndicatorClass,
  onChangeDraftName,
  onCommitRename,
  onCancelRename,
  onSelect,
  onStartRename,
  onDelete,
  onOpenLinkedInSplit,
  onOpenContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const isLinkedFolder = linkedNoteCount > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      draggable={!isEditing}
      className={`folder-tab ${isSelected ? "is-selected" : ""} ${
        isLinkedFolder ? "is-linked-folder" : ""
      } ${isNavbarCollapsed ? "is-slim" : ""} ${isDraggingThis ? "is-dragging" : ""} ${
        isContextOpen ? "is-context-open" : ""
      } ${dropIndicatorClass}`}
      onClick={() => onSelect(folder)}
      onDoubleClick={(e) => onStartRename(folder, e)}
      onContextMenu={(e) => onOpenContextMenu(e, folder)}
      onDragStart={(e) => onDragStart(e, folder.id)}
      onDragOver={(e) => onDragOver(e, folder)}
      onDrop={(e) => onDrop(e, folder)}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (isEditing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(folder);
        }
      }}
    >
      <div className="folder-tab-top">
        <div className="folder-tab-indicators">
          <Folder
            size={isNavbarCollapsed ? 14 : 16}
            strokeWidth={1.8}
            className={`folder-tab-icon ${isSelected ? "is-selected-icon" : ""} ${
              isLinkedFolder ? "is-linked-icon" : ""
            }`}
          />
          {folder.localPath && (
            <span
              className="tab-disk-indicator"
              title={`Synced with: ${folder.localPath}`}
            >
              <HardDrive size={10} />
            </span>
          )}
          {isLinkedFolder && (
            <span
              className="tab-link-indicator"
              title={`${linkedNoteCount} ${
                linkedNoteCount === 1 ? "note" : "notes"
              } in "${folder.name}" connected to current note (click to open in separated tab)`}
              onClick={(e) => {
                e.stopPropagation();
                if (firstLinkedNoteId) {
                  onOpenLinkedInSplit(folder.id, firstLinkedNoteId);
                }
              }}
            >
              <Link2 size={10} strokeWidth={2.2} />
              <span>{linkedNoteCount}</span>
            </span>
          )}
        </div>

        <div className="folder-tab-actions">
          <button
            type="button"
            className="tab-action-btn"
            title="Rename folder"
            aria-label={`Rename ${folder.name}`}
            onClick={(e) => onStartRename(folder, e)}
          >
            <Pencil size={11} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="tab-action-btn is-danger"
            title="Delete folder"
            aria-label={`Delete ${folder.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(folder.id);
            }}
          >
            <Trash2 size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      {isEditing ? (
        <InlineRenameInput
          className="folder-tab-input"
          ariaLabel={`Rename ${folder.name}`}
          value={draftName}
          onChange={onChangeDraftName}
          onCommit={() => onCommitRename(folder.id)}
          onCancel={onCancelRename}
        />
      ) : (
        <span className="folder-tab-name">{folder.name}</span>
      )}
    </div>
  );
};
