import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown01,
  ArrowUp10,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code,
  FileText,
  Folder,
  FolderOpen,
  FolderSync,
  Image as ImageIcon,
  Link2,
  List,
  PanelLeftClose,
  Pencil,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  clampMenuPosition,
  useClickOutside,
} from "../../hooks/useDomInteractions";
import { resolveWorkspaceConnections } from "../../lib/catalogUtils";
import {
  getCodeLanguageLabel,
  isCodeNote,
  isImageNote,
  isPdfNote,
  NOTE_FILE_ACCEPT,
} from "../../lib/fileUtils";
import { findLeaf, getAllLeaves } from "../../lib/paneLayoutTree";
import {
  collectAllFolderIds,
  DEFAULT_SIDEBAR_WIDTH,
  findAncestorFolderIds,
  findFolderNode,
  resolveActiveNoteData,
  sortExplorerNodes,
  useNotesStore,
} from "../../store/useNotesStore";
import { ExplorerNode, FolderItem, NoteItem } from "../../types";
import { InlineRenameInput } from "../shared/InlineRenameInput";
import {
  ExplorerContextMenu,
  ExplorerContextMenuState,
} from "./ExplorerContextMenu";

const BASE_INDENT_PX = 14;
const DEPTH_INDENT_STEP_PX = 16;

interface FlatExplorerNode {
  id: string;
  node: ExplorerNode;
  depth: number;
  parentFolderId: string | null;
}

export const FolderExplorer: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const expandedFolderIds = useNotesStore((s) => s.expandedFolderIds ?? []);
  const pendingRenameNodeId = useNotesStore((s) => s.pendingRenameNodeId);
  const isCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const sidebarWidth = useNotesStore(
    (s) => s.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
  );
  const sortOrder = useNotesStore((s) => s.sortOrder ?? "name-asc");
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const openInSplitView = useNotesStore((s) => s.openInSplitView);
  const splitPane = useNotesStore((s) => s.splitPane);

  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const selectNote = useNotesStore((s) => s.selectNote);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const setSortOrder = useNotesStore((s) => s.setSortOrder);
  const createNote = useNotesStore((s) => s.createNote);
  const createCodeFile = useNotesStore((s) => s.createCodeFile);
  const syncFolderFromDisk = useNotesStore((s) => s.syncFolderFromDisk);
  const isSyncingFolderId = useNotesStore((s) => s.isSyncingFolderId);
  const duplicateNote = useNotesStore((s) => s.duplicateNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const createSubfolder = useNotesStore((s) => s.createSubfolder);
  const renameSubfolder = useNotesStore((s) => s.renameSubfolder);
  const deleteTopFolder = useNotesStore((s) => s.deleteTopFolder);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const clearPendingRenameNode = useNotesStore((s) => s.clearPendingRenameNode);
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const toggleSubfolderCollapse = useNotesStore(
    (s) => s.toggleSubfolderCollapse,
  );
  const toggleCollapseAllSubfolders = useNotesStore(
    (s) => s.toggleCollapseAllSubfolders,
  );
  const paneLayout = useNotesStore((s) => s.paneLayout);
  const activePaneId = useNotesStore((s) => s.activePaneId);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);

  const folder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const selectedNoteId = useMemo(
    () =>
      resolveActiveNoteData(folder, selectedNoteByFolder, sortOrder)?.note.id ??
      null,
    [folder, selectedNoteByFolder, sortOrder],
  );

  const expandedSet = useMemo(
    () => new Set(expandedFolderIds),
    [expandedFolderIds],
  );

  const allSubfolderIds = useMemo(() => {
    if (!folder) return [];
    return collectAllFolderIds(folder.items);
  }, [folder]);

  const isAllSubfoldersCollapsed = useMemo(() => {
    if (allSubfolderIds.length === 0) return false;
    return allSubfolderIds.every((id) => !expandedSet.has(id));
  }, [allSubfolderIds, expandedSet]);

  const openPaneNoteIds = useMemo(() => {
    if (!isSplitViewActive || !paneLayout) return new Set<string>();
    return new Set(
      getAllLeaves(paneLayout)
        .map((l) => l.noteId)
        .filter(Boolean) as string[],
    );
  }, [isSplitViewActive, paneLayout]);

  const currentActivePaneNoteId = useMemo(() => {
    if (isSplitViewActive && paneLayout && activePaneId) {
      const leaf = findLeaf(paneLayout, activePaneId);
      if (leaf?.noteId) return leaf.noteId;
    }
    return selectedNoteId;
  }, [isSplitViewActive, paneLayout, activePaneId, selectedNoteId]);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] =
    useState<ExplorerContextMenuState | null>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  const closeFolderMenu = useCallback(() => setIsFolderMenuOpen(false), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useClickOutside(folderMenuRef, isFolderMenuOpen, closeFolderMenu);

  useEffect(() => {
    setFocusedFolderId(null);
  }, [selectedFolderId, selectedNoteId]);

  const activeFolderIdSet = useMemo(() => {
    if (!folder) return new Set<string>();
    const targetId = focusedFolderId ?? selectedNoteId;
    if (!targetId) return new Set<string>();
    const ancestors = findAncestorFolderIds(folder.items, targetId);
    return new Set(ancestors ?? []);
  }, [folder, focusedFolderId, selectedNoteId]);

  const connections = useMemo(
    () =>
      resolveWorkspaceConnections(
        folders,
        selectedNoteId,
        selectedNoteId ? activeNoteContents[selectedNoteId] : undefined,
        activeNoteContents,
      ),
    [folders, selectedNoteId, activeNoteContents],
  );

  useEffect(() => {
    if (pendingRenameNodeId && folder) {
      const target = findFolderNode(folder.items, pendingRenameNodeId);
      if (target) {
        setEditingNodeId(target.id);
        setDraftName(target.name);
      }
      clearPendingRenameNode();
    }
  }, [pendingRenameNodeId, folder, clearPendingRenameNode]);

  const visibleFlatNodes = useMemo(() => {
    if (!folder?.items) return [];
    const flat: FlatExplorerNode[] = [];
    const walk = (
      items: ExplorerNode[],
      depth: number,
      parentId: string | null,
    ) => {
      const ordered = sortExplorerNodes(items, sortOrder);
      for (const item of ordered) {
        flat.push({
          id: item.id,
          node: item,
          depth,
          parentFolderId: parentId,
        });
        if (
          item.type === "folder" &&
          expandedSet.has(item.id) &&
          Array.isArray(item.children) &&
          item.children.length > 0
        ) {
          walk(item.children, depth + 1, item.id);
        }
      }
    };
    walk(folder.items, 0, null);
    return flat;
  }, [folder?.items, sortOrder, expandedSet]);

  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(700);

  useEffect(() => {
    if (!treeContainerRef.current) return;
    const el = treeContainerRef.current;
    setTreeViewportHeight(el.clientHeight || 700);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreeViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleTreeScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setTreeScrollTop(e.currentTarget.scrollTop);
      closeContextMenu();
    },
    [closeContextMenu],
  );

  if (isCollapsed) {
    return null;
  }

  if (!folder) {
    return (
      <aside className="explorer" style={{ width: `${sidebarWidth}px` }}>
        <div className="explorer-header">
          <span className="explorer-overline">SELECTED FOLDER</span>
          <div className="explorer-header-row">
            <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
              No folder selected
            </span>
          </div>
        </div>
        <div className="explorer-empty">
          <p>Select a folder in the navbar above.</p>
        </div>
      </aside>
    );
  }

  const startSubfolderRename = (node: FolderItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNodeId(node.id);
    setDraftName(node.name);
  };

  const commitSubfolderRename = (nodeId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      renameSubfolder(nodeId, trimmed);
    }
    setEditingNodeId(null);
  };

  const startNoteRename = (node: NoteItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNodeId(node.id);
    setDraftName(node.title);
  };

  const commitNoteRename = (nodeId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      updateNote(nodeId, { title: trimmed });
    }
    setEditingNodeId(null);
  };

  const openNoteContextMenu = (
    e: React.MouseEvent,
    node: NoteItem,
    parentFolderId: string | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 215, 290);
    setContextMenu({ kind: "note", note: node, parentFolderId, x, y });
  };

  const openSubfolderContextMenu = (e: React.MouseEvent, node: FolderItem) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 215, 210);
    setContextMenu({ kind: "subfolder", subfolder: node, x, y });
  };

  const openRootContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 215, 190);
    setContextMenu({ kind: "root", x, y });
  };

  const ITEM_HEIGHT = 38;
  const OVERSCAN = 6;
  const totalTreeCount = visibleFlatNodes.length;
  const totalTreeHeight = totalTreeCount * ITEM_HEIGHT;

  const startIndex = Math.max(
    0,
    Math.floor(treeScrollTop / ITEM_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(
    totalTreeCount,
    Math.ceil((treeScrollTop + treeViewportHeight) / ITEM_HEIGHT) + OVERSCAN,
  );

  const visibleSlice = visibleFlatNodes.slice(startIndex, endIndex);
  const topSpacerPx = startIndex * ITEM_HEIGHT;

  const renderFlatNode = (flatItem: FlatExplorerNode): React.ReactNode => {
    const { node, depth, parentFolderId } = flatItem;
    const indentPx = BASE_INDENT_PX + depth * DEPTH_INDENT_STEP_PX;

    if (node.type === "folder") {
      const isExpandedFolder = expandedSet.has(node.id);
      const isEditing = editingNodeId === node.id;
      const isParentLevel = depth === 0;
      const isSelectedParent = activeFolderIdSet.has(node.id);
      const linkedNoteCount =
        connections.linkedSubfolderCounts.get(node.id) ?? 0;
      const isLinkedFolder = linkedNoteCount > 0;
      const isContextTarget =
        contextMenu?.kind === "subfolder" &&
        contextMenu.subfolder.id === node.id;
      const folderLevelClass = isParentLevel
        ? "is-parent-folder"
        : "is-child-folder";
      const folderSelectedClass = isSelectedParent ? "is-selected-parent" : "";
      const folderLinkedClass = isLinkedFolder ? "is-linked-folder" : "";

      return (
        <div
          key={node.id}
          className={`explorer-group ${isParentLevel ? "is-root-group" : "is-nested-group"} ${
            isSelectedParent ? "is-active-group" : ""
          } ${isLinkedFolder ? "is-linked-group" : ""}`}
        >
          <div
            role="button"
            tabIndex={0}
            className={`explorer-row is-folder ${folderLevelClass} ${folderSelectedClass} ${folderLinkedClass} ${
              isContextTarget ? "is-context-open" : ""
            }`}
            style={{ paddingLeft: `${indentPx}px` }}
            onClick={() => {
              setFocusedFolderId(node.id);
              toggleSubfolderCollapse(node.id);
            }}
            onDoubleClick={(e) => startSubfolderRename(node, e)}
            onContextMenu={(e) => openSubfolderContextMenu(e, node)}
            onKeyDown={(e) => {
              if (isEditing) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFocusedFolderId(node.id);
                toggleSubfolderCollapse(node.id);
              }
            }}
          >
            <span className="explorer-chevron">
              {isExpandedFolder ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
            {isExpandedFolder ? (
              <FolderOpen
                size={16}
                strokeWidth={1.8}
                className="explorer-item-icon is-folder-icon"
              />
            ) : (
              <Folder
                size={16}
                strokeWidth={1.8}
                className="explorer-item-icon is-folder-icon"
              />
            )}

            {isEditing ? (
              <InlineRenameInput
                className="explorer-rename-input"
                ariaLabel={`Rename ${node.name}`}
                value={draftName}
                onChange={setDraftName}
                onCommit={() => commitSubfolderRename(node.id)}
                onCancel={() => setEditingNodeId(null)}
              />
            ) : (
              <span className="explorer-row-label">{node.name}</span>
            )}

            {isLinkedFolder && !isEditing && (
              <span
                className="explorer-link-badge is-folder-badge"
                title={`${linkedNoteCount} ${
                  linkedNoteCount === 1 ? "note" : "notes"
                } inside connected to current note`}
              >
                <Link2 size={11} strokeWidth={2.2} />
                <span>{linkedNoteCount}</span>
              </span>
            )}

            {/* Subfolder row hover actions */}
            <div className="explorer-row-actions">
              <button
                type="button"
                className="icon-action-btn"
                title="Rename subfolder"
                aria-label="Rename subfolder"
                onClick={(e) => startSubfolderRename(node, e)}
              >
                <Pencil size={12} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                className="icon-action-btn is-danger"
                title="Delete subfolder"
                aria-label="Delete subfolder"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode(node.id);
                }}
              >
                <Trash2 size={12} strokeWidth={1.9} />
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isSelected = node.id === currentActivePaneNoteId;
    const isSecondarySelected =
      isSplitViewActive && !isSelected && openPaneNoteIds.has(node.id);
    const isEditingNote = editingNodeId === node.id;
    const isLinkedNote =
      !isSelected &&
      !isSecondarySelected &&
      connections.linkedNoteIds.has(node.id);
    const isContextTarget =
      contextMenu?.kind === "note" && contextMenu.note.id === node.id;
    const isPdf = isPdfNote(node);
    const isImage = !isPdf && isImageNote(node);
    const isCode = !isPdf && !isImage && isCodeNote(node);
    const codeLang = isCode
      ? getCodeLanguageLabel(node.filePath || node.title)
      : "";
    const noteLevelClass = depth > 0 ? "is-child-note" : "is-root-note";

    return (
      <div
        key={node.id}
        role="button"
        tabIndex={0}
        className={`explorer-row is-note ${noteLevelClass} ${isSelected ? "is-selected" : ""} ${
          isSecondarySelected ? "is-secondary-selected" : ""
        } ${isLinkedNote ? "is-linked-note" : ""} ${isContextTarget ? "is-context-open" : ""}`}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => {
          setFocusedFolderId(null);
          selectNote(node.id);
        }}
        onMouseDown={(e) => {
          if (e.button === 1 && folder) {
            e.preventDefault();
            openInSplitView(folder.id, node.id);
          }
        }}
        onDoubleClick={(e) => startNoteRename(node, e)}
        onContextMenu={(e) => openNoteContextMenu(e, node, parentFolderId)}
        onKeyDown={(e) => {
          if (isEditingNote) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFocusedFolderId(null);
            selectNote(node.id);
          }
        }}
      >
        {isImage ? (
          <ImageIcon
            size={16}
            strokeWidth={1.75}
            className="explorer-item-icon explorer-note-icon is-image-icon"
          />
        ) : isCode ? (
          <Code
            size={16}
            strokeWidth={1.75}
            className="explorer-item-icon explorer-note-icon is-code-icon"
          />
        ) : (
          <FileText
            size={16}
            strokeWidth={1.75}
            className={`explorer-item-icon explorer-note-icon ${isPdf ? "is-pdf-icon" : ""}`}
          />
        )}
        {isEditingNote ? (
          <InlineRenameInput
            className="explorer-rename-input"
            ariaLabel={`Rename ${node.title.trim() || "note"}`}
            value={draftName}
            onChange={setDraftName}
            onCommit={() => commitNoteRename(node.id)}
            onCancel={() => setEditingNodeId(null)}
          />
        ) : (
          <span className="explorer-row-label">
            {node.title.trim() || "Untitled"}
          </span>
        )}
        {isLinkedNote && !isEditingNote && (
          <span
            className="explorer-link-badge"
            title="Connected note — click to open in separated tab"
            onClick={(e) => {
              e.stopPropagation();
              if (folder) openInSplitView(folder.id, node.id);
            }}
          >
            <Link2 size={11} strokeWidth={2.2} />
            <span>Linked</span>
          </span>
        )}
        {isPdf && (
          <span className="explorer-pdf-badge" title="PDF Document">
            PDF
          </span>
        )}
        {isImage && (
          <span className="explorer-img-badge" title="Image File">
            IMG
          </span>
        )}
        {isCode && (
          <span
            className="explorer-code-badge"
            title={`Code File (${codeLang})`}
          >
            {codeLang.slice(0, 4)}
          </span>
        )}
        <div className="explorer-row-actions">
          {!isSelected && selectedNoteId && (
            <button
              type="button"
              className={`icon-action-btn ${isLinkedNote ? "is-linked-action" : ""}`}
              title={
                isLinkedNote
                  ? "Unlink from current selected note"
                  : "Connect / link with current selected note"
              }
              aria-label={isLinkedNote ? "Unlink note" : "Link note"}
              onClick={(e) => {
                e.stopPropagation();
                toggleNoteLink(selectedNoteId, node.id);
              }}
            >
              {isLinkedNote ? (
                <Unlink size={12} strokeWidth={2} />
              ) : (
                <Link2 size={12} strokeWidth={2} />
              )}
            </button>
          )}
          <button
            type="button"
            className="icon-action-btn is-danger"
            title="Delete note"
            aria-label="Delete note"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(node.id);
            }}
          >
            <Trash2 size={12} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="explorer"
      style={{ width: `${sidebarWidth}px` }}
      aria-label="Folder explorer"
    >
      {/* Hidden file input for note imports */}
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

      {/* Explorer header */}
      <div className="explorer-header" onContextMenu={openRootContextMenu}>
        <span className="explorer-overline">SELECTED FOLDER</span>
        <div className="explorer-header-row">
          <div className="explorer-folder-title" title={folder.name}>
            <Folder
              size={18}
              strokeWidth={1.8}
              className="explorer-header-icon"
            />
            <span>{folder.name}</span>
          </div>

          <div className="explorer-header-actions">
            {/* Collapse / Expand all folders in explorer */}
            <button
              type="button"
              className="explorer-menu-btn"
              title={
                allSubfolderIds.length === 0
                  ? "No folders to collapse"
                  : isAllSubfoldersCollapsed
                    ? "Expand all folders"
                    : "Collapse all folders"
              }
              aria-label={
                allSubfolderIds.length === 0
                  ? "No folders to collapse"
                  : isAllSubfoldersCollapsed
                    ? "Expand all folders"
                    : "Collapse all folders"
              }
              disabled={allSubfolderIds.length === 0}
              onClick={toggleCollapseAllSubfolders}
            >
              {isAllSubfoldersCollapsed ? (
                <ChevronsUpDown size={17} strokeWidth={1.8} />
              ) : (
                <ChevronsDownUp size={17} strokeWidth={1.8} />
              )}
            </button>

            {/* Sync / refresh folder from disk */}
            {folder.localPath && (
              <button
                type="button"
                className={`explorer-menu-btn ${isSyncingFolderId === folder.id ? "is-syncing" : ""}`}
                title={
                  isSyncingFolderId === folder.id
                    ? "Syncing with disk..."
                    : "Refresh folder from disk"
                }
                aria-label="Refresh folder from disk"
                disabled={Boolean(isSyncingFolderId)}
                onClick={() => void syncFolderFromDisk(folder.id)}
              >
                <FolderSync size={16} strokeWidth={1.8} />
              </button>
            )}

            {/* List/Menu button for extended folder options */}
            <div className="explorer-menu-wrap" ref={folderMenuRef}>
              <button
                type="button"
                className={`explorer-menu-btn ${isFolderMenuOpen ? "is-active" : ""}`}
                title="Folder options"
                aria-label="Folder options"
                onClick={() => setIsFolderMenuOpen((v) => !v)}
              >
                <List size={17} strokeWidth={1.8} />
              </button>

              {isFolderMenuOpen && (
                <div className="explorer-dropdown-menu">
                  <div className="dropdown-section-title">
                    SORT NOTES & FOLDERS
                  </div>

                  <button
                    type="button"
                    className={`dropdown-menu-item ${sortOrder === "name-asc" ? "is-selected-sort" : ""}`}
                    onClick={() => {
                      setSortOrder("name-asc");
                      closeFolderMenu();
                    }}
                  >
                    <ArrowDown01 size={15} strokeWidth={1.8} />
                    <span style={{ flex: 1 }}>Numeric / A → Z</span>
                    {sortOrder === "name-asc" && (
                      <Check size={14} className="sort-check-icon" />
                    )}
                  </button>

                  <button
                    type="button"
                    className={`dropdown-menu-item ${sortOrder === "name-desc" ? "is-selected-sort" : ""}`}
                    onClick={() => {
                      setSortOrder("name-desc");
                      closeFolderMenu();
                    }}
                  >
                    <ArrowUp10 size={15} strokeWidth={1.8} />
                    <span style={{ flex: 1 }}>Numeric / Z → A</span>
                    {sortOrder === "name-desc" && (
                      <Check size={14} className="sort-check-icon" />
                    )}
                  </button>

                  <button
                    type="button"
                    className={`dropdown-menu-item ${sortOrder === "date-desc" ? "is-selected-sort" : ""}`}
                    onClick={() => {
                      setSortOrder("date-desc");
                      closeFolderMenu();
                    }}
                  >
                    <Calendar size={15} strokeWidth={1.8} />
                    <span style={{ flex: 1 }}>Newest modified</span>
                    {sortOrder === "date-desc" && (
                      <Check size={14} className="sort-check-icon" />
                    )}
                  </button>

                  <div className="dropdown-menu-divider" />

                  <button
                    type="button"
                    className="dropdown-menu-item is-danger"
                    onClick={() => {
                      closeFolderMenu();
                      deleteTopFolder(folder.id);
                    }}
                  >
                    <Trash2 size={15} strokeWidth={1.8} />
                    <span>Delete folder</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="explorer-menu-btn"
              onClick={() => {
                closeFolderMenu();
                toggleSidebar();
              }}
            >
              <PanelLeftClose size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {/* Notes & subfolders list (RFC-042 Pillar 3: Viewport virtualized tree window) */}
      <div
        ref={treeContainerRef}
        className="explorer-tree"
        onScroll={handleTreeScroll}
        onContextMenu={openRootContextMenu}
        style={{ position: "relative", overflowY: "auto" }}
      >
        {totalTreeCount === 0 ? (
          <div className="explorer-empty">
            <p>No notes in this folder yet.</p>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Right-click here to create a note or subfolder.
            </span>
          </div>
        ) : (
          <div
            style={{
              height: `${totalTreeHeight}px`,
              position: "relative",
              width: "100%",
            }}
          >
            <div
              style={{
                transform: `translateY(${topSpacerPx}px)`,
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              }}
            >
              {visibleSlice.map((flatItem) => renderFlatNode(flatItem))}
            </div>
          </div>
        )}
      </div>

      <ExplorerContextMenu
        contextMenu={contextMenu}
        folderName={folder.name}
        selectedNoteId={selectedNoteId}
        isLinkedWithCurrent={
          contextMenu?.kind === "note"
            ? connections.linkedNoteIds.has(contextMenu.note.id)
            : false
        }
        onClose={closeContextMenu}
        onSelectNote={(noteId) => {
          setFocusedFolderId(null);
          selectNote(noteId);
        }}
        onSplitPane={(direction, noteId) => {
          splitPane(direction, folder.id, noteId);
        }}
        onCreateNote={createNote}
        onCreateCodeFile={createCodeFile}
        onCreateSubfolder={createSubfolder}
        onStartNoteRename={startNoteRename}
        onToggleNoteLink={toggleNoteLink}
        onDuplicateNote={duplicateNote}
        onDeleteNode={deleteNode}
        onStartSubfolderRename={startSubfolderRename}
        onImportNotesHere={() => noteFileInputRef.current?.click()}
        onAddSubfolder={() => openLinkModal("subfolder")}
      />
    </aside>
  );
};
