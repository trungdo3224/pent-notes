import React from "react";
import { ChevronDown, Link2 } from "lucide-react";
import { TabGroup, TopLevelFolder } from "../../types";
import { InlineRenameInput } from "../shared/InlineRenameInput";

export interface TabGroupChipProps {
  group: TabGroup;
  groupFolders: TopLevelFolder[];
  selectedFolderId: string | null;
  isNavbarCollapsed: boolean;
  isEditing: boolean;
  draftGroupName: string;
  isDropdownOpen: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  isContextOpen: boolean;
  dropOrderClass: string;
  groupLinkedNotesCount: number;
  onChangeDraftName: (name: string) => void;
  onCommitRename: (groupId: string) => void;
  onCancelRename: () => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>, group: TabGroup) => void;
  onStartRename: (group: TabGroup, e?: React.MouseEvent) => void;
  onOpenContextMenu: (e: React.MouseEvent, group: TabGroup) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, groupId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, group: TabGroup) => void;
  onDrop: (
    e: React.DragEvent<HTMLDivElement>,
    group: TabGroup,
    groupFolders: TopLevelFolder[],
  ) => void;
  onDragEnd: () => void;
}

/**
 * Draggable tab-group chip displaying color dot, active folder pill, and dropdown trigger.
 */
export const TabGroupChip: React.FC<TabGroupChipProps> = ({
  group,
  groupFolders,
  selectedFolderId,
  isNavbarCollapsed,
  isEditing,
  draftGroupName,
  isDropdownOpen,
  isDropTarget,
  isDragging,
  isContextOpen,
  dropOrderClass,
  groupLinkedNotesCount,
  onChangeDraftName,
  onCommitRename,
  onCancelRename,
  onClick,
  onStartRename,
  onOpenContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const activeFolder = groupFolders.find((f) => f.id === selectedFolderId);
  const hasActiveTabInside = Boolean(activeFolder);

  return (
    <div
      className={`tab-group-container is-color-${group.color} ${
        isNavbarCollapsed ? "is-slim" : ""
      } ${
        isDropTarget ? "is-drop-target" : ""
      } ${isDragging ? "is-dragging" : ""} ${dropOrderClass}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={isDropdownOpen}
        draggable={!isEditing}
        className={`tab-group-chip ${isNavbarCollapsed ? "is-slim" : ""} ${
          isContextOpen ? "is-context-open" : ""
        } ${isDropdownOpen ? "is-open" : ""} ${
          hasActiveTabInside ? "has-active-tab" : ""
        }`}
        title={`${group.name} (${groupFolders.length} ${
          groupFolders.length === 1 ? "tab" : "tabs"
        }) — Click to view tabs, double-click to rename, right-click for options`}
        onClick={(e) => onClick(e, group)}
        onDoubleClick={(e) => onStartRename(group, e)}
        onContextMenu={(e) => onOpenContextMenu(e, group)}
        onDragStart={(e) => onDragStart(e, group.id)}
        onDragOver={(e) => onDragOver(e, group)}
        onDrop={(e) => onDrop(e, group, groupFolders)}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (isEditing) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent<HTMLDivElement>, group);
          }
        }}
      >
        <span className="tab-group-dot" />
        {isEditing ? (
          <InlineRenameInput
            className="tab-group-input"
            ariaLabel={`Rename group ${group.name}`}
            value={draftGroupName}
            onChange={onChangeDraftName}
            onCommit={() => onCommitRename(group.id)}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="tab-group-name">{group.name}</span>
        )}

        {hasActiveTabInside && activeFolder && (
          <span
            className="tab-group-active-tab"
            title={`Active tab: ${activeFolder.name}`}
          >
            / {activeFolder.name}
          </span>
        )}

        {!hasActiveTabInside && (
          <span className="tab-group-count">{groupFolders.length}</span>
        )}

        {groupLinkedNotesCount > 0 && (
          <span
            className="tab-link-indicator"
            title={`${groupLinkedNotesCount} connected ${
              groupLinkedNotesCount === 1 ? "note" : "notes"
            } inside group "${group.name}"`}
          >
            <Link2 size={10} strokeWidth={2.2} />
            <span>{groupLinkedNotesCount}</span>
          </span>
        )}

        <span className="tab-group-chevron">
          <ChevronDown size={isNavbarCollapsed ? 11 : 12} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  );
};
