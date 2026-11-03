import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown01,
  ArrowUp10,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Copy,
  FilePlus,
  Files,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  FolderUp,
  Link2,
  List,
  PanelLeftClose,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Rows2,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import { resolveWorkspaceConnections } from '../lib/catalogUtils';
import { isPdfNote, NOTE_FILE_ACCEPT } from '../lib/fileUtils';
import { findLeaf, getAllLeaves } from '../lib/paneLayoutTree';
import {
  collectAllSubfolderIds,
  DEFAULT_SIDEBAR_WIDTH,
  findAncestorFolderIds,
  findFolderNode,
  resolveActiveNoteData,
  sortExplorerNodes,
  useNotesStore,
} from '../store/useNotesStore';
import { ExplorerNode, FolderItem, NoteItem } from '../types';

const BASE_INDENT_PX = 14;
const DEPTH_INDENT_STEP_PX = 16;

type ExplorerContextMenuState =
  | {
      kind: 'note';
      note: NoteItem;
      parentFolderId: string | null;
      x: number;
      y: number;
    }
  | {
      kind: 'subfolder';
      subfolder: FolderItem;
      x: number;
      y: number;
    }
  | {
      kind: 'root';
      x: number;
      y: number;
    };

export const FolderExplorer: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const collapsedSubfolderIds = useNotesStore((s) => s.collapsedSubfolderIds);
  const pendingRenameNodeId = useNotesStore((s) => s.pendingRenameNodeId);
  const isCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const sidebarWidth = useNotesStore((s) => s.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? 'name-asc');
  // const isSyncingFolderId = useNotesStore((s) => s.isSyncingFolderId);
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const openInSplitView = useNotesStore((s) => s.openInSplitView);
  const splitPane = useNotesStore((s) => s.splitPane);

  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const selectNote = useNotesStore((s) => s.selectNote);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const setSortOrder = useNotesStore((s) => s.setSortOrder);
  const createNote = useNotesStore((s) => s.createNote);
  const duplicateNote = useNotesStore((s) => s.duplicateNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const createSubfolder = useNotesStore((s) => s.createSubfolder);
  const renameSubfolder = useNotesStore((s) => s.renameSubfolder);
  const deleteTopFolder = useNotesStore((s) => s.deleteTopFolder);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const clearPendingRenameNode = useNotesStore((s) => s.clearPendingRenameNode);
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const unlinkFolderFromDisk = useNotesStore((s) => s.unlinkFolderFromDisk);
  const toggleSubfolderCollapse = useNotesStore((s) => s.toggleSubfolderCollapse);
  const toggleCollapseAllSubfolders = useNotesStore((s) => s.toggleCollapseAllSubfolders);
  const collapseAllSubfolders = useNotesStore((s) => s.collapseAllSubfolders);
  const expandAllSubfolders = useNotesStore((s) => s.expandAllSubfolders);
  const paneLayout = useNotesStore((s) => s.paneLayout);
  const activePaneId = useNotesStore((s) => s.activePaneId);

  const folder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  // const isSyncingThis = Boolean(folder && isSyncingFolderId === folder.id);

  const selectedNoteId = useMemo(
    () => resolveActiveNoteData(folder, selectedNoteByFolder, sortOrder)?.note.id ?? null,
    [folder, selectedNoteByFolder, sortOrder]
  );

  const collapsedSet = useMemo(
    () => new Set(collapsedSubfolderIds),
    [collapsedSubfolderIds]
  );

  const allSubfolderIds = useMemo(() => {
    if (!folder) return [];
    return collectAllSubfolderIds(folder.items);
  }, [folder]);

  const isAllSubfoldersCollapsed = useMemo(() => {
    if (allSubfolderIds.length === 0) return false;
    return allSubfolderIds.every((id) => collapsedSet.has(id));
  }, [allSubfolderIds, collapsedSet]);

  const openPaneNoteIds = useMemo(() => {
    if (!isSplitViewActive || !paneLayout) return new Set<string>();
    return new Set(getAllLeaves(paneLayout).map((l) => l.noteId).filter(Boolean) as string[]);
  }, [isSplitViewActive, paneLayout]);

  const currentActivePaneNoteId = useMemo(() => {
    if (isSplitViewActive && paneLayout && activePaneId) {
      const leaf = findLeaf(paneLayout, activePaneId);
      if (leaf?.noteId) return leaf.noteId;
    }
    return selectedNoteId;
  }, [isSplitViewActive, paneLayout, activePaneId, selectedNoteId]);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuState | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const closeFolderMenu = useCallback(() => setIsFolderMenuOpen(false), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useClickOutside(folderMenuRef, isFolderMenuOpen, closeFolderMenu);
  useClickOutside(contextMenuRef, Boolean(contextMenu), closeContextMenu);

  useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu]);

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
    () => resolveWorkspaceConnections(folders, selectedNoteId),
    [folders, selectedNoteId]
  );

  useEffect(() => {
    if (pendingRenameNodeId && folder) {
      const target = findFolderNode(folder.items, pendingRenameNodeId);
      if (target) {
        skipCommitRef.current = false;
        setEditingNodeId(target.id);
        setDraftName(target.name);
      }
      clearPendingRenameNode();
    }
  }, [pendingRenameNodeId, folder, clearPendingRenameNode]);

  useEffect(() => {
    if (editingNodeId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingNodeId]);

  if (isCollapsed) {
    return null;
  }

  if (!folder) {
    return (
      <aside className="explorer" style={{ width: `${sidebarWidth}px` }}>
        <div className="explorer-header">
          <span className="explorer-overline">SELECTED FOLDER</span>
          <div className="explorer-header-row">
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No folder selected</span>
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
    skipCommitRef.current = false;
    setEditingNodeId(node.id);
    setDraftName(node.name);
  };

  const commitSubfolderRename = (nodeId: string) => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const trimmed = draftName.trim();
    if (trimmed) {
      renameSubfolder(nodeId, trimmed);
    }
    setEditingNodeId(null);
  };

  const startNoteRename = (node: NoteItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    skipCommitRef.current = false;
    setEditingNodeId(node.id);
    setDraftName(node.title);
  };

  const commitNoteRename = (nodeId: string) => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const trimmed = draftName.trim();
    if (trimmed) {
      updateNote(nodeId, { title: trimmed });
    }
    setEditingNodeId(null);
  };

  const clampMenuPosition = (clientX: number, clientY: number, menuHeight = 250) => {
    const menuWidth = 215;
    return {
      x: Math.min(clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(clientY, window.innerHeight - menuHeight - 8),
    };
  };

  const openNoteContextMenu = (
    e: React.MouseEvent,
    node: NoteItem,
    parentFolderId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 290);
    setContextMenu({ kind: 'note', note: node, parentFolderId, x, y });
  };

  const openSubfolderContextMenu = (e: React.MouseEvent, node: FolderItem) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 210);
    setContextMenu({ kind: 'subfolder', subfolder: node, x, y });
  };

  const openRootContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 190);
    setContextMenu({ kind: 'root', x, y });
  };

  const renderNodes = (
    nodes: ExplorerNode[],
    depth: number,
    parentFolderId: string | null = null
  ): React.ReactNode => {
    const ordered = sortExplorerNodes(nodes, sortOrder);

    return ordered.map((node) => {
      const indentPx = BASE_INDENT_PX + depth * DEPTH_INDENT_STEP_PX;

      if (node.type === 'folder') {
        const isCollapsedFolder = collapsedSet.has(node.id);
        const isEditing = editingNodeId === node.id;
        const isParentLevel = depth === 0;
        const isSelectedParent = activeFolderIdSet.has(node.id);
        const linkedNoteCount = connections.linkedSubfolderCounts.get(node.id) ?? 0;
        const isLinkedFolder = linkedNoteCount > 0;
        const isContextTarget =
          contextMenu?.kind === 'subfolder' && contextMenu.subfolder.id === node.id;
        const folderLevelClass = isParentLevel ? 'is-parent-folder' : 'is-child-folder';
        const folderSelectedClass = isSelectedParent ? 'is-selected-parent' : '';
        const folderLinkedClass = isLinkedFolder ? 'is-linked-folder' : '';

        return (
          <div
            key={node.id}
            className={`explorer-group ${isParentLevel ? 'is-root-group' : 'is-nested-group'} ${
              isSelectedParent ? 'is-active-group' : ''
            } ${isLinkedFolder ? 'is-linked-group' : ''}`}
          >
            <div
              role="button"
              tabIndex={0}
              className={`explorer-row is-folder ${folderLevelClass} ${folderSelectedClass} ${folderLinkedClass} ${
                isContextTarget ? 'is-context-open' : ''
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
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFocusedFolderId(node.id);
                  toggleSubfolderCollapse(node.id);
                }
              }}
            >
              <span className="explorer-chevron">
                {isCollapsedFolder ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
              {isCollapsedFolder ? (
                <Folder size={16} strokeWidth={1.8} className="explorer-item-icon is-folder-icon" />
              ) : (
                <FolderOpen
                  size={16}
                  strokeWidth={1.8}
                  className="explorer-item-icon is-folder-icon"
                />
              )}

              {isEditing ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className="explorer-rename-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commitSubfolderRename(node.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      commitSubfolderRename(node.id);
                    } else if (e.key === 'Escape') {
                      skipCommitRef.current = true;
                      setEditingNodeId(null);
                    }
                  }}
                />
              ) : (
                <span className="explorer-row-label">{node.name}</span>
              )}

              {isLinkedFolder && !isEditing && (
                <span
                  className="explorer-link-badge is-folder-badge"
                  title={`${linkedNoteCount} ${
                    linkedNoteCount === 1 ? 'note' : 'notes'
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

            {!isCollapsedFolder && node.children.length > 0 && (
              <div className="explorer-children">
                {renderNodes(node.children, depth + 1, node.id)}
              </div>
            )}
          </div>
        );
      }

      const isSelected = node.id === currentActivePaneNoteId;
      const isSecondarySelected = isSplitViewActive && !isSelected && openPaneNoteIds.has(node.id);
      const isEditingNote = editingNodeId === node.id;
      const isLinkedNote = !isSelected && !isSecondarySelected && connections.linkedNoteIds.has(node.id);
      const isContextTarget = contextMenu?.kind === 'note' && contextMenu.note.id === node.id;
      const isPdf = isPdfNote(node);
      const noteLevelClass = depth > 0 ? 'is-child-note' : 'is-root-note';

      return (
        <div
          key={node.id}
          role="button"
          tabIndex={0}
          className={`explorer-row is-note ${noteLevelClass} ${isSelected ? 'is-selected' : ''} ${
            isSecondarySelected ? 'is-secondary-selected' : ''
          } ${isLinkedNote ? 'is-linked-note' : ''} ${isContextTarget ? 'is-context-open' : ''}`}
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
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFocusedFolderId(null);
              selectNote(node.id);
            }
          }}
        >
          <FileText
            size={16}
            strokeWidth={1.75}
            className={`explorer-item-icon explorer-note-icon ${isPdf ? 'is-pdf-icon' : ''}`}
          />
          {isEditingNote ? (
            <input
              ref={renameInputRef}
              type="text"
              className="explorer-rename-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitNoteRename(node.id)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  commitNoteRename(node.id);
                } else if (e.key === 'Escape') {
                  skipCommitRef.current = true;
                  setEditingNodeId(null);
                }
              }}
            />
          ) : (
            <span className="explorer-row-label">{node.title.trim() || 'Untitled'}</span>
          )}
          {isLinkedNote && !isEditingNote && (
            <span
              className="explorer-link-badge"
              title="Connected to current selected note (click link icon on hover to unlink)"
            >
              <Link2 size={11} strokeWidth={2.2} />
              <span>Linked</span>
            </span>
          )}
          {isPdf && <span className="explorer-pdf-badge" title="PDF Document">PDF</span>}
          <div className="explorer-row-actions">
            {!isSelected && selectedNoteId && (
              <button
                type="button"
                className={`icon-action-btn ${isLinkedNote ? 'is-linked-action' : ''}`}
                title={
                  isLinkedNote
                    ? 'Unlink from current selected note'
                    : 'Connect / link with current selected note'
                }
                aria-label={isLinkedNote ? 'Unlink note' : 'Link note'}
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
    });
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
          e.target.value = '';
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
            <Folder size={18} strokeWidth={1.8} className="explorer-header-icon" />
            <span>{folder.name}</span>
          </div>

          <div className="explorer-header-actions" ref={folderMenuRef}>
            {/* Collapse / Expand all subfolders in explorer */}
            <button
              type="button"
              className="explorer-menu-btn"
              title={
                allSubfolderIds.length === 0
                  ? 'No subfolders to collapse'
                  : isAllSubfoldersCollapsed
                  ? 'Expand all subfolders'
                  : 'Collapse all subfolders'
              }
              aria-label={
                allSubfolderIds.length === 0
                  ? 'No subfolders to collapse'
                  : isAllSubfoldersCollapsed
                  ? 'Expand all subfolders'
                  : 'Collapse all subfolders'
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

            {/* List/Menu button for extended folder options */}
            <button
              type="button"
              className={`explorer-menu-btn ${isFolderMenuOpen ? 'is-active' : ''}`}
              title="Folder options"
              aria-label="Folder options"
              onClick={() => setIsFolderMenuOpen((v) => !v)}
            >
              <List size={17} strokeWidth={1.8} />
            </button>

            {isFolderMenuOpen && (
              <div className="explorer-dropdown-menu">
                {/* Local Folder Sync Options */}
                {folder.localPath ? (
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      closeFolderMenu();
                      unlinkFolderFromDisk(folder.id);
                    }}
                  >
                    <Unlink size={15} strokeWidth={1.8} />
                    <span>Unlink local folder</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      closeFolderMenu();
                      openLinkModal('current-tab');
                    }}
                  >
                    <FolderSync size={15} strokeWidth={1.8} />
                    <span>Link to local folder...</span>
                  </button>
                )}

                <div className="dropdown-menu-divider" />

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    noteFileInputRef.current?.click();
                  }}
                >
                  <FileUp size={15} strokeWidth={1.8} />
                  <span>Import notes here</span>
                </button>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    openLinkModal('subfolder');
                  }}
                >
                  <FolderUp size={15} strokeWidth={1.8} />
                  <span>Add subfolder...</span>
                </button>

                <div className="dropdown-menu-divider" />
                <div className="dropdown-section-title">SORT NOTES & FOLDERS</div>

                <button
                  type="button"
                  className={`dropdown-menu-item ${sortOrder === 'name-asc' ? 'is-selected-sort' : ''}`}
                  onClick={() => {
                    setSortOrder('name-asc');
                    closeFolderMenu();
                  }}
                >
                  <ArrowDown01 size={15} strokeWidth={1.8} />
                  <span style={{ flex: 1 }}>Numeric / A → Z</span>
                  {sortOrder === 'name-asc' && <Check size={14} className="sort-check-icon" />}
                </button>

                <button
                  type="button"
                  className={`dropdown-menu-item ${sortOrder === 'name-desc' ? 'is-selected-sort' : ''}`}
                  onClick={() => {
                    setSortOrder('name-desc');
                    closeFolderMenu();
                  }}
                >
                  <ArrowUp10 size={15} strokeWidth={1.8} />
                  <span style={{ flex: 1 }}>Numeric / Z → A</span>
                  {sortOrder === 'name-desc' && <Check size={14} className="sort-check-icon" />}
                </button>

                <button
                  type="button"
                  className={`dropdown-menu-item ${sortOrder === 'date-desc' ? 'is-selected-sort' : ''}`}
                  onClick={() => {
                    setSortOrder('date-desc');
                    closeFolderMenu();
                  }}
                >
                  <Calendar size={15} strokeWidth={1.8} />
                  <span style={{ flex: 1 }}>Newest modified</span>
                  {sortOrder === 'date-desc' && <Check size={14} className="sort-check-icon" />}
                </button>

                <div className="dropdown-menu-divider" />

                <button
                  type="button"
                  className="dropdown-menu-item"
                  disabled={allSubfolderIds.length === 0}
                  onClick={() => {
                    closeFolderMenu();
                    collapseAllSubfolders();
                  }}
                >
                  <ChevronsDownUp size={15} strokeWidth={1.8} />
                  <span>Collapse all subfolders</span>
                </button>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  disabled={allSubfolderIds.length === 0}
                  onClick={() => {
                    closeFolderMenu();
                    expandAllSubfolders();
                  }}
                >
                  <ChevronsUpDown size={15} strokeWidth={1.8} />
                  <span>Expand all subfolders</span>
                </button>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    toggleSidebar();
                  }}
                >
                  <PanelLeftClose size={15} strokeWidth={1.8} />
                  <span>Hide sidebar panel</span>
                </button>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    toggleNavbar();
                  }}
                >
                  {isNavbarCollapsed ? (
                    <PanelTopOpen size={15} strokeWidth={1.8} />
                  ) : (
                    <PanelTopClose size={15} strokeWidth={1.8} />
                  )}
                  <span>{isNavbarCollapsed ? 'Expand top navbar' : 'Collapse top navbar'}</span>
                </button>

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
        </div>

        {/* Local Folder Sync Status Bar if linked */}
        {/* {folder.localPath && (
          <div
            className="explorer-local-badge"
            title={`Auto-synced with local disk: ${folder.localPath}`}
          >
            <div className="explorer-local-badge-info">
              <span className={`local-dot-indicator ${isSyncingThis ? 'is-syncing' : ''}`} />
              <HardDrive size={12} className="local-badge-icon" />
              <span className="local-folder-name">{getBasename(folder.localPath)}</span>
            </div>
          </div>
        )} */}
      </div>

      {/* Notes & subfolders list */}
      <div
        className="explorer-tree"
        onScroll={closeContextMenu}
        onContextMenu={openRootContextMenu}
      >
        {folder.items.length === 0 ? (
          <div className="explorer-empty">
            <p>No notes in this folder yet.</p>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Right-click here to create a note or subfolder.
            </span>
          </div>
        ) : (
          renderNodes(folder.items, 0, null)
        )}
      </div>

      {/* Unified Right-Click Context Menu (Note, Subfolder, or Root Folder) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="explorer-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          role="menu"
          aria-label="Sidebar context actions"
        >
          {contextMenu.kind === 'note' && (
            <>
              <div className="context-menu-header">
                <FileText size={12} className="context-menu-header-icon" />
                <span>{contextMenu.note.title.trim() || 'Untitled'}</span>
              </div>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  const targetId = contextMenu.note.id;
                  closeContextMenu();
                  setFocusedFolderId(null);
                  selectNote(targetId);
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
                  const targetNote = contextMenu.note;
                  closeContextMenu();
                  if (folder) {
                    splitPane('horizontal', folder.id, targetNote.id);
                  }
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
                  const targetNote = contextMenu.note;
                  closeContextMenu();
                  if (folder) {
                    splitPane('vertical', folder.id, targetNote.id);
                  }
                }}
              >
                <Rows2 size={14} strokeWidth={1.8} />
                <span>Split down</span>
              </button>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  const targetParentId = contextMenu.parentFolderId;
                  closeContextMenu();
                  void createNote(targetParentId);
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
                  const targetParentId = contextMenu.parentFolderId;
                  closeContextMenu();
                  void createSubfolder(targetParentId);
                }}
              >
                <FolderPlus size={14} strokeWidth={1.8} />
                <span>New subfolder</span>
              </button>

              <div className="dropdown-menu-divider" />

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  const targetNote = contextMenu.note;
                  closeContextMenu();
                  startNoteRename(targetNote);
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
                    closeContextMenu();
                    toggleNoteLink(selectedNoteId, targetId);
                  }}
                >
                  {connections.linkedNoteIds.has(contextMenu.note.id) ? (
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
                  const title = contextMenu.note.title.trim() || 'Untitled';
                  closeContextMenu();
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
                  closeContextMenu();
                  void duplicateNote(targetNote.id, parentFolderId);
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
                  closeContextMenu();
                  deleteNode(targetId);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                <span>Delete note</span>
              </button>
            </>
          )}

          {contextMenu.kind === 'subfolder' && (
            <>
              <div className="context-menu-header">
                <Folder size={12} className="context-menu-header-icon" />
                <span>{contextMenu.subfolder.name}</span>
              </div>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  const targetId = contextMenu.subfolder.id;
                  closeContextMenu();
                  void createNote(targetId);
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
                  const targetId = contextMenu.subfolder.id;
                  closeContextMenu();
                  void createSubfolder(targetId);
                }}
              >
                <FolderPlus size={14} strokeWidth={1.8} />
                <span>New subfolder</span>
              </button>

              <div className="dropdown-menu-divider" />

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  const targetFolder = contextMenu.subfolder;
                  closeContextMenu();
                  startSubfolderRename(targetFolder);
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
                  closeContextMenu();
                  deleteNode(targetId);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                <span>Delete subfolder</span>
              </button>
            </>
          )}

          {contextMenu.kind === 'root' && (
            <>
              <div className="context-menu-header">
                <Folder size={12} className="context-menu-header-icon" />
                <span>{folder.name}</span>
              </div>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  closeContextMenu();
                  void createNote(null);
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
                  closeContextMenu();
                  void createSubfolder(null);
                }}
              >
                <FolderPlus size={14} strokeWidth={1.8} />
                <span>New subfolder</span>
              </button>

              <div className="dropdown-menu-divider" />

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  closeContextMenu();
                  noteFileInputRef.current?.click();
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
                  closeContextMenu();
                  openLinkModal('subfolder');
                }}
              >
                <FolderUp size={14} strokeWidth={1.8} />
                <span>Add subfolder...</span>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
