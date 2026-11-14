import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Folder, FolderUp, HardDrive, Link2, Plus } from "lucide-react";
import {
  clampMenuPosition,
  useClickOutside,
  useEscapeKey,
} from "../../hooks/useDomInteractions";
import { resolveWorkspaceConnections } from "../../lib/catalogUtils";
import { NOTE_FILE_ACCEPT } from "../../lib/fileUtils";
import { sessionApi } from "../../lib/sessionManager";
import {
  resolveActiveNoteData,
  useNotesStore,
} from "../../store/useNotesStore";
import { TabGroup, TopLevelFolder } from "../../types";
import { FolderTabItem } from "./FolderTabItem";
import {
  NavbarActionControls,
  SessionPillButton,
} from "./NavbarActionControls";
import { NavbarContextMenu, NavbarContextMenuState } from "./NavbarContextMenu";
import { PentLogo } from "./PentLogo";
import { TabGroupChip } from "./TabGroupChip";

interface FolderNavbarProps {
  onOpenSearch: () => void;
}

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

  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  const closePlusMenu = useCallback(() => setIsPlusMenuOpen(false), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeGroupDropdown = useCallback(() => setOpenGroupDropdown(null), []);
  useClickOutside(plusMenuRef, isPlusMenuOpen, closePlusMenu);
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
  useEscapeKey(Boolean(openGroupDropdown), closeGroupDropdown);

  useEffect(() => {
    if (!openGroupDropdown) return;
    window.addEventListener("resize", closeGroupDropdown);
    window.addEventListener("scroll", closeGroupDropdown, true);
    return () => {
      window.removeEventListener("resize", closeGroupDropdown);
      window.removeEventListener("scroll", closeGroupDropdown, true);
    };
  }, [openGroupDropdown, closeGroupDropdown]);

  useEffect(() => {
    if (pendingRenameFolderId) {
      const target = folders.find((f) => f.id === pendingRenameFolderId);
      if (target) {
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
        setEditingGroupId(targetGroup.id);
        setDraftGroupName(targetGroup.name);
      }
      clearPendingRenameGroup();
    }
  }, [pendingRenameGroupId, tabGroups, clearPendingRenameGroup]);

  const startRename = (folder: TopLevelFolder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(folder.id);
    setDraftName(folder.name);
  };

  const commitRename = (folderId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      renameTopFolder(folderId, trimmed);
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const startGroupRename = (group: TabGroup, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingGroupId(group.id);
    setDraftGroupName(group.name);
  };

  const commitGroupRename = (groupId: string) => {
    const trimmed = draftGroupName.trim();
    if (trimmed) {
      renameTabGroup(groupId, trimmed);
    }
    setEditingGroupId(null);
  };

  const cancelGroupRename = () => {
    setEditingGroupId(null);
  };

  const toggleGroupDropdownFromMenu = (
    targetGroup: TabGroup,
    x: number,
    y: number,
  ) => {
    if (openGroupDropdown?.group.id === targetGroup.id) {
      setOpenGroupDropdown(null);
      return;
    }
    const menuWidth = 220;
    const clamped = clampMenuPosition(x, y, menuWidth, 260);
    setOpenGroupDropdown({
      group: targetGroup,
      x: clamped.x,
      y: clamped.y,
      minWidth: menuWidth,
    });
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

  const actionControlsProps = {
    isPlusMenuOpen,
    plusMenuRef,
    onOpenSearch,
    onTogglePlusMenu: () => setIsPlusMenuOpen((v) => !v),
    onClosePlusMenu: closePlusMenu,
    onOpenSettings: () => openSettingsModal(),
    onToggleNavbar: toggleNavbar,
    onNewSession: () => sessionApi.openSessionInNewTab(),
    onCreateFolder: createTopFolder,
    onImportFolder: () => openLinkModal("new-tab"),
    onImportNotes: () => noteFileInputRef.current?.click(),
  };

  return (
    <header className={`navbar ${isNavbarCollapsed ? "is-collapsed" : ""}`}>
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

      {!isNavbarCollapsed && (
        <div className="navbar-top-row">
          <div className="navbar-brand">
            <PentLogo size={18} className="navbar-brand-icon" />
            <span className="navbar-brand-title">PentNotes</span>

            <SessionPillButton
              sessionName={currentSessionName}
              onClick={openSessionModal}
            />
          </div>

          <div className="navbar-actions">
            <NavbarActionControls {...actionControlsProps} />
          </div>
        </div>
      )}

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
                const folder = segment.folder;
                const isSelected = folder.id === selectedFolderId;
                const linkedNoteCount = !isSelected
                  ? (connections.linkedTopFolderCounts.get(folder.id) ?? 0)
                  : 0;
                const dropIndicatorClass =
                  dragOverInfo?.folderId === folder.id &&
                  draggedFolderId !== folder.id
                    ? `is-drop-${dragOverInfo.position}`
                    : "";

                return (
                  <FolderTabItem
                    key={folder.id}
                    folder={folder}
                    isSelected={isSelected}
                    isEditing={folder.id === editingId}
                    draftName={draftName}
                    linkedNoteCount={linkedNoteCount}
                    firstLinkedNoteId={connections.firstLinkedNoteByTopFolder.get(
                      folder.id,
                    )}
                    isNavbarCollapsed={isNavbarCollapsed}
                    isDraggingThis={draggedFolderId === folder.id}
                    isContextOpen={
                      contextMenu?.kind === "tab" &&
                      contextMenu.folder.id === folder.id
                    }
                    dropIndicatorClass={dropIndicatorClass}
                    onChangeDraftName={setDraftName}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onSelect={onSelectFolderTab}
                    onStartRename={startRename}
                    onDelete={deleteTopFolder}
                    onOpenLinkedInSplit={openInSplitView}
                    onOpenContextMenu={openTabContextMenu}
                    onDragStart={handleTabDragStart}
                    onDragOver={handleTabDragOver}
                    onDrop={handleTabDrop}
                    onDragEnd={resetDragState}
                  />
                );
              }

              const { group, folders: groupFolders } = segment;
              const groupLinkedNotesCount = groupFolders.reduce((sum, f) => {
                if (f.id === selectedFolderId) return sum;
                return sum + (connections.linkedTopFolderCounts.get(f.id) ?? 0);
              }, 0);
              const dropOrderClass =
                dragOverGroupOrder?.groupId === group.id &&
                draggedGroupId !== group.id
                  ? `is-drop-${dragOverGroupOrder.position}`
                  : "";

              return (
                <TabGroupChip
                  key={`group-${group.id}`}
                  group={group}
                  groupFolders={groupFolders}
                  selectedFolderId={selectedFolderId}
                  isNavbarCollapsed={isNavbarCollapsed}
                  isEditing={editingGroupId === group.id}
                  draftGroupName={draftGroupName}
                  isDropdownOpen={openGroupDropdown?.group.id === group.id}
                  isDropTarget={dragOverGroupId === group.id}
                  isDragging={draggedGroupId === group.id}
                  isContextOpen={
                    contextMenu?.kind === "group" &&
                    contextMenu.group.id === group.id
                  }
                  dropOrderClass={dropOrderClass}
                  groupLinkedNotesCount={groupLinkedNotesCount}
                  onChangeDraftName={setDraftGroupName}
                  onCommitRename={commitGroupRename}
                  onCancelRename={cancelGroupRename}
                  onClick={handleGroupChipClick}
                  onStartRename={startGroupRename}
                  onOpenContextMenu={openGroupContextMenu}
                  onDragStart={handleGroupDragStart}
                  onDragOver={handleGroupChipDragOver}
                  onDrop={handleGroupChipDrop}
                  onDragEnd={resetDragState}
                />
              );
            })
          )}
        </div>

        {isNavbarCollapsed && (
          <div className="navbar-slim-controls">
            <SessionPillButton
              compact
              sessionName={currentSessionName}
              onClick={openSessionModal}
            />
            <NavbarActionControls compact {...actionControlsProps} />
          </div>
        )}
      </nav>

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

      <NavbarContextMenu
        contextMenu={contextMenu}
        tabGroups={tabGroups}
        openGroupId={openGroupDropdown?.group.id ?? null}
        onClose={closeContextMenu}
        onCreateGroupFromFolder={createTabGroupFromFolder}
        onAssignFolderToGroup={assignFolderToTabGroup}
        onStartRenameFolder={startRename}
        onDeleteFolder={deleteTopFolder}
        onSetGroupColor={setTabGroupColor}
        onStartRenameGroup={startGroupRename}
        onToggleGroupDropdown={toggleGroupDropdownFromMenu}
        onUngroupTabs={ungroupTabGroup}
        onDeleteGroupAndFolders={deleteTabGroupAndFolders}
      />
    </header>
  );
};
