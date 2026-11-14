import React from "react";
import {
  ChevronDown,
  Folder,
  Layers,
  Pencil,
  Trash2,
  Unlink,
} from "lucide-react";
import { TabGroup, TabGroupColorId, TopLevelFolder } from "../../types";
import { FloatingContextMenu } from "../shared/FloatingContextMenu";

const GROUP_COLOR_SWATCHES: Array<{
  id: TabGroupColorId;
  label: string;
  hex: string;
}> = [
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "purple", label: "Purple", hex: "#8b5cf6" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "amber", label: "Amber", hex: "#f59e0b" },
  { id: "rose", label: "Rose", hex: "#f43f5e" },
  { id: "cyan", label: "Sky", hex: "#0ea5e9" },
];

export type NavbarContextMenuState =
  | {
      kind: "tab";
      folder: TopLevelFolder;
      x: number;
      y: number;
    }
  | {
      kind: "group";
      group: TabGroup;
      x: number;
      y: number;
    };

export interface NavbarContextMenuProps {
  contextMenu: NavbarContextMenuState | null;
  tabGroups: TabGroup[];
  openGroupId: string | null;
  onClose: () => void;
  onCreateGroupFromFolder: (folderId: string) => void;
  onAssignFolderToGroup: (folderId: string, groupId: string | null) => void;
  onStartRenameFolder: (folder: TopLevelFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  onSetGroupColor: (groupId: string, color: TabGroupColorId) => void;
  onStartRenameGroup: (group: TabGroup) => void;
  onToggleGroupDropdown: (group: TabGroup, x: number, y: number) => void;
  onUngroupTabs: (groupId: string) => void;
  onDeleteGroupAndFolders: (groupId: string) => void;
}

/**
 * Right-click context menu for folder tabs and tab groups in the navbar.
 */
export const NavbarContextMenu: React.FC<NavbarContextMenuProps> = ({
  contextMenu,
  tabGroups,
  openGroupId,
  onClose,
  onCreateGroupFromFolder,
  onAssignFolderToGroup,
  onStartRenameFolder,
  onDeleteFolder,
  onSetGroupColor,
  onStartRenameGroup,
  onToggleGroupDropdown,
  onUngroupTabs,
  onDeleteGroupAndFolders,
}) => (
  <FloatingContextMenu
    isOpen={Boolean(contextMenu)}
    x={contextMenu?.x ?? 0}
    y={contextMenu?.y ?? 0}
    onClose={onClose}
    className="explorer-context-menu navbar-context-menu"
    ariaLabel="Tab group actions"
  >
    {contextMenu?.kind === "tab" && (
      <>
        <div className="context-menu-header">
          <Folder size={12} className="context-menu-header-icon" />
          <span>{contextMenu.folder.name}</span>
        </div>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetId = contextMenu.folder.id;
            onClose();
            onCreateGroupFromFolder(targetId);
          }}
        >
          <Layers size={14} strokeWidth={1.8} />
          <span>New group from tab</span>
        </button>

        {tabGroups.length > 0 && (
          <>
            <div className="dropdown-menu-divider" />
            <div className="dropdown-section-title">MOVE TO GROUP</div>
            {tabGroups.map((grp) => {
              const isCurrentGroup = contextMenu.folder.groupId === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  className={`dropdown-menu-item ${isCurrentGroup ? "is-selected-sort" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    const targetFolderId = contextMenu.folder.id;
                    onClose();
                    onAssignFolderToGroup(targetFolderId, grp.id);
                  }}
                >
                  <span className={`context-group-dot is-color-${grp.color}`} />
                  <span style={{ flex: 1 }}>{grp.name}</span>
                </button>
              );
            })}
          </>
        )}

        {contextMenu.folder.groupId && (
          <>
            <div className="dropdown-menu-divider" />
            <button
              type="button"
              className="dropdown-menu-item"
              role="menuitem"
              onClick={() => {
                const targetFolderId = contextMenu.folder.id;
                onClose();
                onAssignFolderToGroup(targetFolderId, null);
              }}
            >
              <Unlink size={14} strokeWidth={1.8} />
              <span>Remove from group</span>
            </button>
          </>
        )}

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetFolder = contextMenu.folder;
            onClose();
            onStartRenameFolder(targetFolder);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
          <span>Rename tab</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item is-danger"
          role="menuitem"
          onClick={() => {
            const targetFolderId = contextMenu.folder.id;
            onClose();
            onDeleteFolder(targetFolderId);
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          <span>Delete tab</span>
        </button>
      </>
    )}

    {contextMenu?.kind === "group" && (
      <>
        <div className="context-menu-header">
          <span
            className={`context-group-dot is-color-${contextMenu.group.color}`}
          />
          <span>{contextMenu.group.name}</span>
        </div>

        <div className="dropdown-section-title">GROUP COLOR</div>
        <div className="group-color-picker-row">
          {GROUP_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className={`group-color-swatch ${
                contextMenu.group.color === swatch.id ? "is-active" : ""
              }`}
              style={{ backgroundColor: swatch.hex }}
              title={swatch.label}
              aria-label={`Set group color to ${swatch.label}`}
              onClick={() => onSetGroupColor(contextMenu.group.id, swatch.id)}
            />
          ))}
        </div>

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetGroup = contextMenu.group;
            onClose();
            onStartRenameGroup(targetGroup);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
          <span>Rename group</span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const { group, x, y } = contextMenu;
            onClose();
            onToggleGroupDropdown(group, x, y);
          }}
        >
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            style={{
              transform:
                openGroupId === contextMenu.group.id
                  ? "rotate(180deg)"
                  : "none",
            }}
          />
          <span>
            {openGroupId === contextMenu.group.id
              ? "Collapse group tabs"
              : "Show group tabs"}
          </span>
        </button>

        <button
          type="button"
          className="dropdown-menu-item"
          role="menuitem"
          onClick={() => {
            const targetGroupId = contextMenu.group.id;
            onClose();
            onUngroupTabs(targetGroupId);
          }}
        >
          <Unlink size={14} strokeWidth={1.8} />
          <span>Ungroup tabs</span>
        </button>

        <div className="dropdown-menu-divider" />

        <button
          type="button"
          className="dropdown-menu-item is-danger"
          role="menuitem"
          onClick={() => {
            const targetGroupId = contextMenu.group.id;
            onClose();
            onDeleteGroupAndFolders(targetGroupId);
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          <span>Delete group & tabs</span>
        </button>
      </>
    )}
  </FloatingContextMenu>
);
