import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown01,
  ArrowUp10,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  FolderUp,
  HardDrive,
  Link2,
  List,
  PanelLeftClose,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import { resolveWorkspaceConnections } from '../lib/catalogUtils';
import { isPdfNote, NOTE_FILE_ACCEPT } from '../lib/fileUtils';
import { getBasename } from '../lib/pathUtils';
import {
  DEFAULT_SIDEBAR_WIDTH,
  findAncestorFolderIds,
  findFolderNode,
  resolveActiveNoteData,
  sortExplorerNodes,
  useNotesStore,
} from '../store/useNotesStore';
import { ExplorerNode, FolderItem } from '../types';

const BASE_INDENT_PX = 14;
const DEPTH_INDENT_STEP_PX = 16;

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
  const isSyncingFolderId = useNotesStore((s) => s.isSyncingFolderId);

  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const selectNote = useNotesStore((s) => s.selectNote);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const setSortOrder = useNotesStore((s) => s.setSortOrder);
  const createNote = useNotesStore((s) => s.createNote);
  const createSubfolder = useNotesStore((s) => s.createSubfolder);
  const renameSubfolder = useNotesStore((s) => s.renameSubfolder);
  const deleteTopFolder = useNotesStore((s) => s.deleteTopFolder);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const clearPendingRenameNode = useNotesStore((s) => s.clearPendingRenameNode);
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openImportModal = useNotesStore((s) => s.openImportModal);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const syncFolderFromDisk = useNotesStore((s) => s.syncFolderFromDisk);
  const unlinkFolderFromDisk = useNotesStore((s) => s.unlinkFolderFromDisk);
  const toggleSubfolderCollapse = useNotesStore((s) => s.toggleSubfolderCollapse);

  const folder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const isSyncingThis = Boolean(folder && isSyncingFolderId === folder.id);

  const selectedNoteId = useMemo(
    () => resolveActiveNoteData(folder, selectedNoteByFolder, sortOrder)?.note.id ?? null,
    [folder, selectedNoteByFolder, sortOrder]
  );

  const collapsedSet = useMemo(
    () => new Set(collapsedSubfolderIds),
    [collapsedSubfolderIds]
  );

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  const closeFolderMenu = useCallback(() => setIsFolderMenuOpen(false), []);
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
            <button
              type="button"
              className="explorer-menu-btn"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeftClose size={17} strokeWidth={1.8} />
            </button>
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

  const renderNodes = (nodes: ExplorerNode[], depth: number): React.ReactNode => {
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
              className={`explorer-row is-folder ${folderLevelClass} ${folderSelectedClass} ${folderLinkedClass}`}
              style={{ paddingLeft: `${indentPx}px` }}
              onClick={() => {
                setFocusedFolderId(node.id);
                toggleSubfolderCollapse(node.id);
              }}
              onDoubleClick={(e) => startSubfolderRename(node, e)}
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

              {/* Subfolder row hover actions for fast nested creation */}
              <div className="explorer-row-actions">
                <button
                  type="button"
                  className="icon-action-btn"
                  title="New note in this subfolder"
                  aria-label="New note in subfolder"
                  onClick={(e) => {
                    e.stopPropagation();
                    void createNote(node.id);
                  }}
                >
                  <FilePlus size={12} strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  className="icon-action-btn"
                  title="New subfolder inside here"
                  aria-label="New subfolder inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    void createSubfolder(node.id);
                  }}
                >
                  <FolderPlus size={12} strokeWidth={1.9} />
                </button>
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
              <div className="explorer-children">{renderNodes(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      const isSelected = node.id === selectedNoteId;
      const isLinkedNote = !isSelected && connections.linkedNoteIds.has(node.id);
      const isPdf = isPdfNote(node);
      const noteLevelClass = depth > 0 ? 'is-child-note' : 'is-root-note';

      return (
        <div
          key={node.id}
          role="button"
          tabIndex={0}
          className={`explorer-row is-note ${noteLevelClass} ${isSelected ? 'is-selected' : ''} ${
            isLinkedNote ? 'is-linked-note' : ''
          }`}
          style={{ paddingLeft: `${indentPx}px` }}
          onClick={() => {
            setFocusedFolderId(null);
            selectNote(node.id);
          }}
          onKeyDown={(e) => {
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
          <span className="explorer-row-label">{node.title.trim() || 'Untitled'}</span>
          {isLinkedNote && (
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

      {/* Explorer header with direct creation buttons */}
      <div className="explorer-header">
        <span className="explorer-overline">SELECTED FOLDER</span>
        <div className="explorer-header-row">
          <div className="explorer-folder-title" title={folder.name}>
            <Folder size={18} strokeWidth={1.8} className="explorer-header-icon" />
            <span>{folder.name}</span>
          </div>

          <div className="explorer-header-actions" ref={folderMenuRef}>
            {/* Direct Quick-Add Note button */}
            <button
              type="button"
              className="explorer-menu-btn"
              title="New note in folder"
              aria-label="New note"
              onClick={() => void createNote(null)}
            >
              <FilePlus size={16} strokeWidth={1.8} />
            </button>

            {/* Direct Quick-Add Subfolder button */}
            <button
              type="button"
              className="explorer-menu-btn"
              title="New subfolder in folder"
              aria-label="New subfolder"
              onClick={() => void createSubfolder(null)}
            >
              <FolderPlus size={16} strokeWidth={1.8} />
            </button>

            {/* Quick Sync button if linked to disk */}
            {folder.localPath && (
              <button
                type="button"
                className={`explorer-menu-btn ${isSyncingThis ? 'is-active' : ''}`}
                title="Sync from local disk"
                aria-label="Sync from disk"
                disabled={isSyncingThis}
                onClick={() => void syncFolderFromDisk(folder.id)}
              >
                <RefreshCw size={15} strokeWidth={1.8} className={isSyncingThis ? 'spin' : ''} />
              </button>
            )}

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

            {/* Collapse sidebar button */}
            <button
              type="button"
              className="explorer-menu-btn"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeftClose size={17} strokeWidth={1.8} />
            </button>

            {isFolderMenuOpen && (
              <div className="explorer-dropdown-menu">
                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    void createNote(null);
                  }}
                >
                  <FilePlus size={15} strokeWidth={1.8} />
                  <span>New note</span>
                </button>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    closeFolderMenu();
                    void createSubfolder(null);
                  }}
                >
                  <FolderPlus size={15} strokeWidth={1.8} />
                  <span>New subfolder</span>
                </button>

                <div className="dropdown-menu-divider" />

                {/* Local Folder Sync Options */}
                {folder.localPath ? (
                  <>
                    <button
                      type="button"
                      className="dropdown-menu-item"
                      disabled={isSyncingThis}
                      onClick={() => {
                        closeFolderMenu();
                        void syncFolderFromDisk(folder.id);
                      }}
                    >
                      <RefreshCw
                        size={15}
                        strokeWidth={1.8}
                        className={isSyncingThis ? 'spin' : ''}
                      />
                      <span>Sync from disk now</span>
                    </button>
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
                  </>
                ) : (
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      closeFolderMenu();
                      openLinkModal();
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
                    openImportModal('subfolder');
                  }}
                >
                  <FolderUp size={15} strokeWidth={1.8} />
                  <span>Import subfolder...</span>
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
                  onClick={() => {
                    closeFolderMenu();
                    toggleSidebar();
                  }}
                >
                  <PanelLeftClose size={15} strokeWidth={1.8} />
                  <span>Collapse sidebar</span>
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
        {folder.localPath && (
          <div className="explorer-local-badge" title={`Connected to disk: ${folder.localPath}`}>
            <div className="explorer-local-badge-info">
              <span className={`local-dot-indicator ${isSyncingThis ? 'is-syncing' : ''}`} />
              <HardDrive size={12} className="local-badge-icon" />
              <span className="local-folder-name">{getBasename(folder.localPath)}</span>
            </div>
            <button
              type="button"
              className="local-sync-action-btn"
              onClick={() => void syncFolderFromDisk(folder.id)}
              disabled={isSyncingThis}
              title="Sync now from local folder"
            >
              <RefreshCw size={11} className={isSyncingThis ? 'spin' : ''} />
              <span>{isSyncingThis ? 'Syncing...' : 'Sync'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Notes & subfolders list */}
      <div className="explorer-tree">
        {folder.items.length === 0 ? (
          <div className="explorer-empty">
            <p>No notes in this folder yet.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="subtle-btn"
                onClick={() => void createNote(null)}
              >
                + New note
              </button>
              <button
                type="button"
                className="subtle-btn"
                onClick={() => void createSubfolder(null)}
              >
                + New subfolder
              </button>
            </div>
          </div>
        ) : (
          renderNodes(folder.items, 0)
        )}
      </div>
    </aside>
  );
};
