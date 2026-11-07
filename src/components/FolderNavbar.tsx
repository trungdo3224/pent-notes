import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  FileUp,
  Folder,
  FolderPlus,
  FolderUp,
  HardDrive,
  Layers,
  Link2,
  Notebook,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Plus,
  Radio,
  Search,
  Settings,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  clampMenuPosition,
  useClickOutside,
} from "../hooks/useDomInteractions";
import { resolveWorkspaceConnections } from "../lib/catalogUtils";
import { NOTE_FILE_ACCEPT } from "../lib/fileUtils";
import { sessionApi } from "../lib/sessionManager";
import { resolveActiveNoteData, useNotesStore } from "../store/useNotesStore";
import { TabGroup, TabGroupColorId, TopLevelFolder } from "../types";

interface FolderNavbarProps {
  onOpenSearch: () => void;
}

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

type NavbarContextMenuState =
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

type TabSegment =
  | { kind: "single"; folder: TopLevelFolder }
  | { kind: "group"; group: TabGroup; folders: TopLevelFolder[] };

export const FolderNavbar: React.FC<FolderNavbarProps> = ({ onOpenSearch }) => {
  const folders = useNotesStore((s) => s.folders);
  const tabGroups = useNotesStore((s) => s.tabGroups ?? []);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? "name-asc");
  const pendingRenameFolderId = useNotesStore((s) => s.pendingRenameFolderId);
  const pendingRenameGroupId = useNotesStore((s) => s.pendingRenameGroupId);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const selectFolder = useNotesStore((s) => s.selectFolder);
  const openInSplitView = useNotesStore((s) => s.openInSplitView);
  const navigateToNote = useNotesStore((s) => s.navigateToNote);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const renameTopFolder = useNotesStore((s) => s.renameTopFolder);
  const deleteTopFolder = useNotesStore((s) => s.deleteTopFolder);
  const reorderTopFolders = useNotesStore((s) => s.reorderTopFolders);
  const reorderTabGroup = useNotesStore((s) => s.reorderTabGroup);
  const createTabGroupFromFolder = useNotesStore(
    (s) => s.createTabGroupFromFolder,
  );
  const assignFolderToTabGroup = useNotesStore((s) => s.assignFolderToTabGroup);
  const renameTabGroup = useNotesStore((s) => s.renameTabGroup);
  const setTabGroupColor = useNotesStore((s) => s.setTabGroupColor);
  const ungroupTabGroup = useNotesStore((s) => s.ungroupTabGroup);
  const deleteTabGroupAndFolders = useNotesStore(
    (s) => s.deleteTabGroupAndFolders,
  );
  const clearPendingRenameFolder = useNotesStore(
    (s) => s.clearPendingRenameFolder,
  );
  const clearPendingRenameGroup = useNotesStore(
    (s) => s.clearPendingRenameGroup,
  );
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const openSessionModal = useNotesStore((s) => s.openSessionModal);
  const currentSessionName = useNotesStore((s) => s.currentSessionName);
  const openSettingsModal = useNotesStore((s) => s.openSettingsModal);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [draftGroupName, setDraftGroupName] = useState("");
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    folderId: string;
    position: "before" | "after";
  } | null>(null);
  const [dragOverGroupOrder, setDragOverGroupOrder] = useState<{
    groupId: string;
    position: "before" | "after";
  } | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<NavbarContextMenuState | null>(
    null,
  );
  const [openGroupDropdown, setOpenGroupDropdown] = useState<{
    group: TabGroup;
    x: number;
    y: number;
    minWidth: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);
  const skipGroupCommitRef = useRef(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  const closePlusMenu = useCallback(() => setIsPlusMenuOpen(false), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeGroupDropdown = useCallback(() => setOpenGroupDropdown(null), []);
  useClickOutside(plusMenuRef, isPlusMenuOpen, closePlusMenu);
  useClickOutside(contextMenuRef, Boolean(contextMenu), closeContextMenu);
  const isTargetInGroupChip = useCallback(
    (target: HTMLElement) => Boolean(target.closest?.(".tab-group-chip")),
    [],
  );
  useClickOutside(
    groupDropdownRef,
    Boolean(openGroupDropdown),
    closeGroupDropdown,
    isTargetInGroupChip,
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu]);

  useEffect(() => {
    if (!openGroupDropdown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroupDropdown(null);
    };
    const handleScrollOrResize = () => setOpenGroupDropdown(null);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [openGroupDropdown]);

  useEffect(() => {
    if (pendingRenameFolderId) {
      const target = folders.find((f) => f.id === pendingRenameFolderId);
      if (target) {
        skipCommitRef.current = false;
        setEditingId(target.id);
        setDraftName(target.name);
      }
      clearPendingRenameFolder();
    }
  }, [pendingRenameFolderId, folders, clearPendingRenameFolder]);

  useEffect(() => {
    if (pendingRenameGroupId) {
      const targetGroup = tabGroups.find((g) => g.id === pendingRenameGroupId);
      if (targetGroup) {
        skipGroupCommitRef.current = false;
        setEditingGroupId(targetGroup.id);
        setDraftGroupName(targetGroup.name);
      }
      clearPendingRenameGroup();
    }
  }, [pendingRenameGroupId, tabGroups, clearPendingRenameGroup]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (editingGroupId && groupInputRef.current) {
      groupInputRef.current.focus();
      groupInputRef.current.select();
    }
  }, [editingGroupId]);

  const startRename = (folder: TopLevelFolder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    skipCommitRef.current = false;
    setEditingId(folder.id);
    setDraftName(folder.name);
  };

  const commitRename = (folderId: string) => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const trimmed = draftName.trim();
    if (trimmed) {
      renameTopFolder(folderId, trimmed);
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    skipCommitRef.current = true;
    setEditingId(null);
  };

  const startGroupRename = (group: TabGroup, e?: React.MouseEvent) => {
    e?.stopPropagation();
    skipGroupCommitRef.current = false;
    setEditingGroupId(group.id);
    setDraftGroupName(group.name);
  };

  const commitGroupRename = (groupId: string) => {
    if (skipGroupCommitRef.current) {
      skipGroupCommitRef.current = false;
      return;
    }
    const trimmed = draftGroupName.trim();
    if (trimmed) {
      renameTabGroup(groupId, trimmed);
    }
    setEditingGroupId(null);
  };

  const cancelGroupRename = () => {
    skipGroupCommitRef.current = true;
    setEditingGroupId(null);
  };

  const resetDragState = () => {
    setDraggedFolderId(null);
    setDraggedGroupId(null);
    setDragOverInfo(null);
    setDragOverGroupOrder(null);
    setDragOverGroupId(null);
  };

  const handleTabDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    folderId: string,
  ) => {
    if (editingId === folderId) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    setDraggedFolderId(folderId);
    setDraggedGroupId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `folder:${folderId}`);
  };

  const handleGroupDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    groupId: string,
  ) => {
    if (editingGroupId === groupId) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    setDraggedGroupId(groupId);
    setDraggedFolderId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `group:${groupId}`);
  };

  const handleTabDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetFolder: TopLevelFolder,
  ) => {
    if (draggedGroupId) {
      if (targetFolder.groupId === draggedGroupId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverGroupId(null);

      if (targetFolder.groupId) {
        const groupContainer = e.currentTarget.closest(".tab-group-container");
        const rect = (
          groupContainer ?? e.currentTarget
        ).getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const position: "before" | "after" =
          e.clientX < midpoint ? "before" : "after";
        setDragOverInfo(null);
        if (
          dragOverGroupOrder?.groupId !== targetFolder.groupId ||
          dragOverGroupOrder.position !== position
        ) {
          setDragOverGroupOrder({ groupId: targetFolder.groupId, position });
        }
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const position: "before" | "after" =
          e.clientX < midpoint ? "before" : "after";
        setDragOverGroupOrder(null);
        if (
          dragOverInfo?.folderId !== targetFolder.id ||
          dragOverInfo.position !== position
        ) {
          setDragOverInfo({ folderId: targetFolder.id, position });
        }
      }
      return;
    }

    if (!draggedFolderId || draggedFolderId === targetFolder.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(null);
    setDragOverGroupOrder(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position: "before" | "after" =
      e.clientX < midpoint ? "before" : "after";

    if (
      dragOverInfo?.folderId !== targetFolder.id ||
      dragOverInfo.position !== position
    ) {
      setDragOverInfo({ folderId: targetFolder.id, position });
    }
  };

  const handleTabDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetFolder: TopLevelFolder,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedGroupId) {
      if (targetFolder.groupId !== draggedGroupId) {
        if (targetFolder.groupId) {
          const groupContainer = e.currentTarget.closest(
            ".tab-group-container",
          );
          const rect = (
            groupContainer ?? e.currentTarget
          ).getBoundingClientRect();
          const position: "before" | "after" =
            dragOverGroupOrder?.groupId === targetFolder.groupId
              ? dragOverGroupOrder.position
              : e.clientX < rect.left + rect.width / 2
                ? "before"
                : "after";
          reorderTabGroup(
            draggedGroupId,
            targetFolder.groupId,
            "group",
            position,
          );
        } else {
          const rect = e.currentTarget.getBoundingClientRect();
          const position: "before" | "after" =
            dragOverInfo?.folderId === targetFolder.id
              ? dragOverInfo.position
              : e.clientX < rect.left + rect.width / 2
                ? "before"
                : "after";
          reorderTabGroup(draggedGroupId, targetFolder.id, "folder", position);
        }
      }
      resetDragState();
      return;
    }

    const rawData = e.dataTransfer.getData("text/plain");
    const sourceId =
      draggedFolderId ||
      (rawData.startsWith("folder:") ? rawData.slice(7) : rawData);
    if (sourceId && sourceId !== targetFolder.id) {
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const position: "before" | "after" =
        dragOverInfo?.folderId === targetFolder.id
          ? dragOverInfo.position
          : e.clientX < midpoint
            ? "before"
            : "after";
      reorderTopFolders(
        sourceId,
        targetFolder.id,
        position,
        targetFolder.groupId ?? null,
      );
    }
    resetDragState();
  };

  const handleGroupChipDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    group: TabGroup,
  ) => {
    if (draggedGroupId) {
      if (draggedGroupId === group.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverInfo(null);
      setDragOverGroupId(null);

      const groupContainer = e.currentTarget.closest(".tab-group-container");
      const rect = (groupContainer ?? e.currentTarget).getBoundingClientRect();
      const position: "before" | "after" =
        e.clientX < rect.left + rect.width / 2 ? "before" : "after";
      if (
        dragOverGroupOrder?.groupId !== group.id ||
        dragOverGroupOrder.position !== position
      ) {
        setDragOverGroupOrder({ groupId: group.id, position });
      }
      return;
    }

    if (!draggedFolderId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverInfo(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(rect.width, 1);

    if (relX < 0.22) {
      setDragOverGroupId(null);
      if (
        dragOverGroupOrder?.groupId !== group.id ||
        dragOverGroupOrder.position !== "before"
      ) {
        setDragOverGroupOrder({ groupId: group.id, position: "before" });
      }
    } else if (relX > 0.78) {
      setDragOverGroupId(null);
      if (
        dragOverGroupOrder?.groupId !== group.id ||
        dragOverGroupOrder.position !== "after"
      ) {
        setDragOverGroupOrder({ groupId: group.id, position: "after" });
      }
    } else {
      setDragOverGroupOrder(null);
      if (dragOverGroupId !== group.id) {
        setDragOverGroupId(group.id);
      }
    }
  };

  const handleGroupChipDrop = (
    e: React.DragEvent<HTMLDivElement>,
    group: TabGroup,
    groupFolders: TopLevelFolder[],
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedGroupId) {
      if (draggedGroupId !== group.id) {
        const groupContainer = e.currentTarget.closest(".tab-group-container");
        const rect = (
          groupContainer ?? e.currentTarget
        ).getBoundingClientRect();
        const position: "before" | "after" =
          dragOverGroupOrder?.groupId === group.id
            ? dragOverGroupOrder.position
            : e.clientX < rect.left + rect.width / 2
              ? "before"
              : "after";
        reorderTabGroup(draggedGroupId, group.id, "group", position);
      }
      resetDragState();
      return;
    }

    const rawData = e.dataTransfer.getData("text/plain");
    const sourceId =
      draggedFolderId ||
      (rawData.startsWith("folder:") ? rawData.slice(7) : rawData);
    if (sourceId) {
      if (dragOverGroupOrder?.groupId === group.id) {
        const boundaryFolder =
          dragOverGroupOrder.position === "before"
            ? groupFolders[0]
            : groupFolders[groupFolders.length - 1];
        if (boundaryFolder && sourceId !== boundaryFolder.id) {
          reorderTopFolders(
            sourceId,
            boundaryFolder.id,
            dragOverGroupOrder.position,
            null,
          );
        }
      } else {
        assignFolderToTabGroup(sourceId, group.id);
      }
    }
    resetDragState();
  };

  const openTabContextMenu = (e: React.MouseEvent, folder: TopLevelFolder) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 225, 290);
    setContextMenu({ kind: "tab", folder, x, y });
  };

  const openGroupContextMenu = (e: React.MouseEvent, group: TabGroup) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 225, 260);
    setContextMenu({ kind: "group", group, x, y });
  };

  const activeFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  const activeNoteId = useMemo(
    () =>
      resolveActiveNoteData(activeFolder, selectedNoteByFolder, sortOrder)?.note
        .id ?? null,
    [activeFolder, selectedNoteByFolder, sortOrder],
  );

  const connections = useMemo(
    () =>
      resolveWorkspaceConnections(
        folders,
        activeNoteId,
        activeNoteId ? activeNoteContents[activeNoteId] : undefined,
        activeNoteContents,
      ),
    [folders, activeNoteId, activeNoteContents],
  );

  const tabSegments = useMemo<TabSegment[]>(() => {
    const groupById = new Map(tabGroups.map((g) => [g.id, g]));
    const segments: TabSegment[] = [];

    for (const folder of folders) {
      const group = folder.groupId ? groupById.get(folder.groupId) : undefined;
      if (!group) {
        segments.push({ kind: "single", folder });
      } else {
        const prev = segments[segments.length - 1];
        if (prev && prev.kind === "group" && prev.group.id === group.id) {
          prev.folders.push(folder);
        } else {
          segments.push({ kind: "group", group, folders: [folder] });
        }
      }
    }

    return segments;
  }, [folders, tabGroups]);

  const onSelectFolderTab = useCallback(
    (folder: TopLevelFolder) => {
      const isSelected = folder.id === selectedFolderId;
      const linkedNoteCount = !isSelected
        ? (connections.linkedTopFolderCounts.get(folder.id) ?? 0)
        : 0;
      if (linkedNoteCount > 0) {
        const currentNoteInTarget = resolveActiveNoteData(
          folder,
          selectedNoteByFolder,
          sortOrder,
        )?.note.id;
        const firstLinkedId = connections.firstLinkedNoteByTopFolder.get(
          folder.id,
        );
        if (
          firstLinkedId &&
          (!currentNoteInTarget ||
            !connections.linkedNoteIds.has(currentNoteInTarget))
        ) {
          navigateToNote(folder.id, firstLinkedId);
          return;
        }
      }
      selectFolder(folder.id);
    },
    [
      connections,
      selectedFolderId,
      selectedNoteByFolder,
      sortOrder,
      navigateToNote,
      selectFolder,
    ],
  );

  const handleGroupChipClick = (
    e: React.MouseEvent<HTMLDivElement>,
    group: TabGroup,
  ) => {
    if (editingGroupId === group.id) return;
    if (openGroupDropdown?.group.id === group.id) {
      setOpenGroupDropdown(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 220);
    const clamped = clampMenuPosition(
      rect.left,
      rect.bottom + 4,
      menuWidth,
      260,
    );
    setOpenGroupDropdown({
      group,
      x: clamped.x,
      y: clamped.y,
      minWidth: menuWidth,
    });
  };

  const renderFolderTab = (folder: TopLevelFolder) => {
    const isSelected = folder.id === selectedFolderId;
    const isEditing = folder.id === editingId;
    const linkedNoteCount = !isSelected
      ? (connections.linkedTopFolderCounts.get(folder.id) ?? 0)
      : 0;
    const isLinkedFolder = linkedNoteCount > 0;
    const isDraggingThis = draggedFolderId === folder.id;
    const isContextOpen =
      contextMenu?.kind === "tab" && contextMenu.folder.id === folder.id;
    const dropIndicatorClass =
      dragOverInfo?.folderId === folder.id && draggedFolderId !== folder.id
        ? `is-drop-${dragOverInfo.position}`
        : "";

    return (
      <div
        key={folder.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        draggable={!isEditing}
        className={`folder-tab ${isSelected ? "is-selected" : ""} ${
          isLinkedFolder ? "is-linked-folder" : ""
        } ${isNavbarCollapsed ? "is-slim" : ""} ${isDraggingThis ? "is-dragging" : ""} ${
          isContextOpen ? "is-context-open" : ""
        } ${dropIndicatorClass}`}
        onClick={() => onSelectFolderTab(folder)}
        onDoubleClick={(e) => startRename(folder, e)}
        onContextMenu={(e) => openTabContextMenu(e, folder)}
        onDragStart={(e) => handleTabDragStart(e, folder.id)}
        onDragOver={(e) => handleTabDragOver(e, folder)}
        onDrop={(e) => handleTabDrop(e, folder)}
        onDragEnd={resetDragState}
        onKeyDown={(e) => {
          if (isEditing) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectFolderTab(folder);
          }
        }}
      >
        {/* Top of card: Folder icon at left, disk indicator and subtle actions at right */}
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
                  const firstLinkedId =
                    connections.firstLinkedNoteByTopFolder.get(folder.id);
                  if (firstLinkedId) {
                    openInSplitView(folder.id, firstLinkedId);
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
              onClick={(e) => startRename(folder, e)}
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
                deleteTopFolder(folder.id);
              }}
            >
              <Trash2 size={11} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Folder name */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="folder-tab-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => commitRename(folder.id)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                commitRename(folder.id);
              } else if (e.key === "Escape") {
                cancelRename();
              }
            }}
          />
        ) : (
          <span className="folder-tab-name">{folder.name}</span>
        )}
      </div>
    );
  };

  const renderPlusMenu = () => (
    <div className="plus-dropdown-menu">
      <button
        type="button"
        className="plus-menu-item"
        onClick={() => {
          closePlusMenu();
          sessionApi.openSessionInNewTab();
        }}
      >
        <Layers size={15} strokeWidth={1.8} className="plus-menu-icon" />
        <span>New session (new tab)...</span>
      </button>

      <button
        type="button"
        className="plus-menu-item"
        onClick={() => {
          closePlusMenu();
          createTopFolder();
        }}
      >
        <FolderPlus size={15} strokeWidth={1.8} className="plus-menu-icon" />
        <span>New empty folder</span>
      </button>

      <div className="plus-menu-divider" />

      <button
        type="button"
        className="plus-menu-item"
        onClick={() => {
          closePlusMenu();
          openLinkModal("new-tab");
        }}
      >
        <FolderUp size={15} strokeWidth={1.8} className="plus-menu-icon" />
        <span>Import folder</span>
      </button>

      <button
        type="button"
        className="plus-menu-item"
        onClick={() => {
          closePlusMenu();
          noteFileInputRef.current?.click();
        }}
      >
        <FileUp size={15} strokeWidth={1.8} className="plus-menu-icon" />
        <span>Import notes & PDFs (.md, .txt, .pdf)</span>
      </button>
    </div>
  );

  return (
    <header className={`navbar ${isNavbarCollapsed ? "is-collapsed" : ""}`}>
      {/* Hidden file picker for importing separate note files */}
      <input
        ref={noteFileInputRef}
        type="file"
        accept={NOTE_FILE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const selected = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (selected.length > 0) {
            void importNotesFiles(selected);
          }
        }}
      />

      {/* Top row: Brand on left, minimal icon actions on right (hidden when navbar is slim/collapsed) */}
      {!isNavbarCollapsed && (
        <div className="navbar-top-row">
          <div className="navbar-brand">
            <Notebook size={16} strokeWidth={2} className="navbar-brand-icon" />
            <span className="navbar-brand-title">Notes</span>

            {/* Session Selector Pill */}
            <button
              type="button"
              className="session-navbar-pill"
              onClick={openSessionModal}
              title={`Active Session: ${currentSessionName} (Click to manage sessions)`}
              aria-label="Manage sessions"
            >
              <Radio size={10} className="session-pulse-dot" />
              <span className="session-navbar-name">{currentSessionName}</span>
              <ChevronDown size={11} className="session-navbar-chevron" />
            </button>
          </div>

          <div className="navbar-actions">
            {/* Search button */}
            <button
              type="button"
              className="navbar-icon-btn"
              onClick={onOpenSearch}
              title="Search notes (Ctrl+K)"
              aria-label="Search notes"
            >
              <Search size={16} strokeWidth={1.8} />
            </button>

            {/* Plus button with quick dropdown */}
            <div className="plus-menu-container" ref={plusMenuRef}>
              <button
                type="button"
                className={`navbar-icon-btn ${isPlusMenuOpen ? "is-active" : ""}`}
                onClick={() => setIsPlusMenuOpen((v) => !v)}
                title="Create or sync local folder"
                aria-label="Create or import"
              >
                <Plus size={17} strokeWidth={1.9} />
              </button>

              {isPlusMenuOpen && renderPlusMenu()}
            </div>

            {/* Settings button (Themes, Fonts, Layout) */}
            <button
              type="button"
              className="navbar-icon-btn navbar-settings-btn"
              onClick={() => openSettingsModal()}
              title={`Settings (Themes, Fonts, Layout)`}
              aria-label="Settings"
            >
              <Settings size={16} strokeWidth={1.8} />
            </button>

            {/* Collapse navbar button */}
            <button
              type="button"
              className="navbar-icon-btn"
              onClick={toggleNavbar}
              title="Slim top navbar (Ctrl+Shift+\)"
              aria-label="Slim top navbar"
            >
              <PanelTopClose size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      {/* Tabs Row: Compact card tabs (or single-line slim tabs when collapsed) */}
      <nav
        className={`navbar-tabs ${isNavbarCollapsed ? "is-slim" : ""}`}
        aria-label="Top-level folders"
      >
        <div className="navbar-tabs-scroll" onScroll={closeContextMenu}>
          {folders.length === 0 ? (
            <>
              <button
                type="button"
                className="folder-tab is-placeholder"
                onClick={() => openLinkModal("new-tab")}
                title="Add or sync a folder from your computer"
              >
                <div className="folder-tab-top">
                  <FolderUp
                    size={16}
                    strokeWidth={1.8}
                    className="folder-tab-icon"
                  />
                </div>
                <span className="folder-tab-name">Add folder</span>
              </button>

              <button
                type="button"
                className="folder-tab is-placeholder"
                onClick={createTopFolder}
              >
                <div className="folder-tab-top">
                  <Plus
                    size={16}
                    strokeWidth={1.8}
                    className="folder-tab-icon"
                  />
                </div>
                <span className="folder-tab-name">New folder</span>
              </button>
            </>
          ) : (
            tabSegments.map((segment) => {
              if (segment.kind === "single") {
                return renderFolderTab(segment.folder);
              }

              const { group, folders: groupFolders } = segment;
              const isGroupEditing = editingGroupId === group.id;
              const isGroupDropdownOpen =
                openGroupDropdown?.group.id === group.id;
              const hasActiveTabInside = groupFolders.some(
                (f) => f.id === selectedFolderId,
              );
              const activeFolder = groupFolders.find(
                (f) => f.id === selectedFolderId,
              );
              const groupLinkedNotesCount = groupFolders.reduce((sum, f) => {
                if (f.id === selectedFolderId) return sum;
                return sum + (connections.linkedTopFolderCounts.get(f.id) ?? 0);
              }, 0);
              const isDropTargetGroup = dragOverGroupId === group.id;
              const isDraggingGroup = draggedGroupId === group.id;
              const isGroupContextOpen =
                contextMenu?.kind === "group" &&
                contextMenu.group.id === group.id;
              const groupDropOrderClass =
                dragOverGroupOrder?.groupId === group.id &&
                draggedGroupId !== group.id
                  ? `is-drop-${dragOverGroupOrder.position}`
                  : "";

              return (
                <div
                  key={`group-${group.id}`}
                  className={`tab-group-container is-color-${group.color} ${
                    isNavbarCollapsed ? "is-slim" : ""
                  } ${
                    isDropTargetGroup ? "is-drop-target" : ""
                  } ${isDraggingGroup ? "is-dragging" : ""} ${groupDropOrderClass}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-haspopup="true"
                    aria-expanded={isGroupDropdownOpen}
                    draggable={!isGroupEditing}
                    className={`tab-group-chip ${
                      isNavbarCollapsed ? "is-slim" : ""
                    } ${
                      isGroupContextOpen ? "is-context-open" : ""
                    } ${isGroupDropdownOpen ? "is-open" : ""} ${
                      hasActiveTabInside ? "has-active-tab" : ""
                    }`}
                    title={`${group.name} (${groupFolders.length} ${
                      groupFolders.length === 1 ? "tab" : "tabs"
                    }) — Click to view tabs, double-click to rename, right-click for options`}
                    onClick={(e) => handleGroupChipClick(e, group)}
                    onDoubleClick={(e) => startGroupRename(group, e)}
                    onContextMenu={(e) => openGroupContextMenu(e, group)}
                    onDragStart={(e) => handleGroupDragStart(e, group.id)}
                    onDragOver={(e) => handleGroupChipDragOver(e, group)}
                    onDrop={(e) => handleGroupChipDrop(e, group, groupFolders)}
                    onDragEnd={resetDragState}
                    onKeyDown={(e) => {
                      if (isGroupEditing) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleGroupChipClick(
                          e as unknown as React.MouseEvent<HTMLDivElement>,
                          group,
                        );
                      }
                    }}
                  >
                    <span className="tab-group-dot" />
                    {isGroupEditing ? (
                      <input
                        ref={groupInputRef}
                        type="text"
                        className="tab-group-input"
                        value={draftGroupName}
                        onChange={(e) => setDraftGroupName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => commitGroupRename(group.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            commitGroupRename(group.id);
                          } else if (e.key === "Escape") {
                            cancelGroupRename();
                          }
                        }}
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
                      <span className="tab-group-count">
                        {groupFolders.length}
                      </span>
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
                      <ChevronDown
                        size={isNavbarCollapsed ? 11 : 12}
                        strokeWidth={2.2}
                      />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compact right-side controls when navbar is slim/collapsed */}
        {isNavbarCollapsed && (
          <div className="navbar-slim-controls">
            <button
              type="button"
              className="session-navbar-pill is-compact"
              onClick={openSessionModal}
              title={`Active Session: ${currentSessionName} (Click to manage sessions)`}
              aria-label="Manage sessions"
            >
              <Radio size={10} className="session-pulse-dot" />
              <span className="session-navbar-name">{currentSessionName}</span>
            </button>

            <button
              type="button"
              className="navbar-icon-btn is-compact"
              onClick={onOpenSearch}
              title="Search notes (Ctrl+K)"
              aria-label="Search notes"
            >
              <Search size={14} strokeWidth={1.9} />
            </button>

            <div className="plus-menu-container" ref={plusMenuRef}>
              <button
                type="button"
                className={`navbar-icon-btn is-compact ${isPlusMenuOpen ? "is-active" : ""}`}
                onClick={() => setIsPlusMenuOpen((v) => !v)}
                title="Create or sync local folder"
                aria-label="Create or import"
              >
                <Plus size={15} strokeWidth={2} />
              </button>

              {isPlusMenuOpen && renderPlusMenu()}
            </div>

            <button
              type="button"
              className="navbar-icon-btn navbar-settings-btn is-compact"
              onClick={() => openSettingsModal()}
              title={`Settings (Themes, Fonts, Layout)`}
              aria-label="Settings"
            >
              <Settings size={14} strokeWidth={1.9} />
            </button>

            <button
              type="button"
              className="navbar-icon-btn is-compact is-highlight"
              onClick={toggleNavbar}
              title="Expand top navbar (Ctrl+Shift+\)"
              aria-label="Expand top navbar"
            >
              <PanelTopOpen size={14} strokeWidth={1.9} />
            </button>
          </div>
        )}
      </nav>

      {/* Dropdown Menu for Tab Groups */}
      {openGroupDropdown &&
        (() => {
          const liveGroup =
            tabGroups.find((g) => g.id === openGroupDropdown.group.id) ??
            openGroupDropdown.group;
          const liveGroupFolders = folders.filter(
            (f) => f.groupId === liveGroup.id,
          );

          return (
            <div
              ref={groupDropdownRef}
              className={`tab-group-dropdown is-color-${liveGroup.color}`}
              style={{
                top: `${openGroupDropdown.y}px`,
                left: `${openGroupDropdown.x}px`,
                minWidth: `${openGroupDropdown.minWidth}px`,
              }}
              role="menu"
              aria-label={`${liveGroup.name} tabs`}
            >
              <div className="tab-group-dropdown-header">
                <div className="dropdown-header-left">
                  <span className="tab-group-dot" />
                  <span className="tab-group-dropdown-title">
                    {liveGroup.name}
                  </span>
                </div>
                <div className="dropdown-header-right">
                  <span className="tab-group-dropdown-count">
                    {liveGroupFolders.length}{" "}
                    {liveGroupFolders.length === 1 ? "tab" : "tabs"}
                  </span>
                </div>
              </div>

              <div className="tab-group-dropdown-list">
                {liveGroupFolders.map((folder) => {
                  const isSelected = folder.id === selectedFolderId;
                  const linkedCount =
                    connections.linkedTopFolderCounts.get(folder.id) ?? 0;
                  return (
                    <div
                      key={folder.id}
                      role="menuitem"
                      tabIndex={0}
                      className={`tab-group-dropdown-item ${
                        isSelected ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        closeGroupDropdown();
                        onSelectFolderTab(folder);
                      }}
                      onContextMenu={(e) => {
                        closeGroupDropdown();
                        openTabContextMenu(e, folder);
                      }}
                    >
                      <div className="dropdown-item-left">
                        <Folder
                          size={14}
                          strokeWidth={1.8}
                          className={`folder-tab-icon ${
                            isSelected ? "is-selected-icon" : ""
                          }`}
                        />
                        <span className="dropdown-item-name">
                          {folder.name}
                        </span>
                      </div>

                      <div className="dropdown-item-right">
                        {folder.localPath && (
                          <span
                            className="tab-disk-indicator"
                            title={`Synced with: ${folder.localPath}`}
                          >
                            <HardDrive size={10} />
                          </span>
                        )}
                        {linkedCount > 0 && (
                          <span
                            className="tab-link-indicator"
                            title={`${linkedCount} connected ${
                              linkedCount === 1 ? "note" : "notes"
                            }`}
                          >
                            <Link2 size={10} strokeWidth={2.2} />
                            <span>{linkedCount}</span>
                          </span>
                        )}
                        {isSelected && (
                          <span className="dropdown-item-check-dot" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {/* Right-Click Context Menu for Folder Tabs & Tab Groups */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="explorer-context-menu navbar-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          role="menu"
          aria-label="Tab group actions"
        >
          {contextMenu.kind === "tab" && (
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
                  closeContextMenu();
                  createTabGroupFromFolder(targetId);
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
                    const isCurrentGroup =
                      contextMenu.folder.groupId === grp.id;
                    return (
                      <button
                        key={grp.id}
                        type="button"
                        className={`dropdown-menu-item ${isCurrentGroup ? "is-selected-sort" : ""}`}
                        role="menuitem"
                        onClick={() => {
                          const targetFolderId = contextMenu.folder.id;
                          closeContextMenu();
                          assignFolderToTabGroup(targetFolderId, grp.id);
                        }}
                      >
                        <span
                          className={`context-group-dot is-color-${grp.color}`}
                        />
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
                      closeContextMenu();
                      assignFolderToTabGroup(targetFolderId, null);
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
                  closeContextMenu();
                  startRename(targetFolder);
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
                  closeContextMenu();
                  deleteTopFolder(targetFolderId);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                <span>Delete tab</span>
              </button>
            </>
          )}

          {contextMenu.kind === "group" && (
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
                    onClick={() => {
                      setTabGroupColor(contextMenu.group.id, swatch.id);
                    }}
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
                  closeContextMenu();
                  startGroupRename(targetGroup);
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
                  const targetGroup = contextMenu.group;
                  const isCurrentOpen =
                    openGroupDropdown?.group.id === targetGroup.id;
                  closeContextMenu();
                  if (isCurrentOpen) {
                    setOpenGroupDropdown(null);
                  } else {
                    const menuWidth = 220;
                    const clamped = clampMenuPosition(
                      contextMenu.x,
                      contextMenu.y,
                      menuWidth,
                      260,
                    );
                    setOpenGroupDropdown({
                      group: targetGroup,
                      x: clamped.x,
                      y: clamped.y,
                      minWidth: menuWidth,
                    });
                  }
                }}
              >
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  style={{
                    transform:
                      openGroupDropdown?.group.id === contextMenu.group.id
                        ? "rotate(180deg)"
                        : "none",
                  }}
                />
                <span>
                  {openGroupDropdown?.group.id === contextMenu.group.id
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
                  closeContextMenu();
                  ungroupTabGroup(targetGroupId);
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
                  closeContextMenu();
                  deleteTabGroupAndFolders(targetGroupId);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                <span>Delete group & tabs</span>
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
