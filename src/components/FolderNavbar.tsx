import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileUp,
  Folder,
  FolderPlus,
  FolderSync,
  FolderUp,
  HardDrive,
  Layers,
  Link2,
  Notebook,
  Palette,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Plus,
  Radio,
  Search,
  Trash2,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import { resolveWorkspaceConnections } from '../lib/catalogUtils';
import { NOTE_FILE_ACCEPT } from '../lib/fileUtils';
import { sessionApi } from '../lib/sessionManager';
import { resolveActiveNoteData, useNotesStore } from '../store/useNotesStore';
import { themes } from '../themes';
import { TopLevelFolder } from '../types';

interface FolderNavbarProps {
  onOpenSearch: () => void;
}

export const FolderNavbar: React.FC<FolderNavbarProps> = ({ onOpenSearch }) => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? 'name-asc');
  const pendingRenameFolderId = useNotesStore((s) => s.pendingRenameFolderId);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const selectFolder = useNotesStore((s) => s.selectFolder);
  const navigateToNote = useNotesStore((s) => s.navigateToNote);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const renameTopFolder = useNotesStore((s) => s.renameTopFolder);
  const deleteTopFolder = useNotesStore((s) => s.deleteTopFolder);
  const clearPendingRenameFolder = useNotesStore((s) => s.clearPendingRenameFolder);
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openImportModal = useNotesStore((s) => s.openImportModal);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const openSessionModal = useNotesStore((s) => s.openSessionModal);
  const currentSessionName = useNotesStore((s) => s.currentSessionName);
  const theme = useNotesStore((s) => s.theme);
  const openThemeModal = useNotesStore((s) => s.openThemeModal);

  const activeThemeObj = themes.find((t) => t.id === theme);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const closePlusMenu = useCallback(() => setIsPlusMenuOpen(false), []);
  useClickOutside(plusMenuRef, isPlusMenuOpen, closePlusMenu);

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
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

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

  const activeFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  const activeNoteId = useMemo(
    () => resolveActiveNoteData(activeFolder, selectedNoteByFolder, sortOrder)?.note.id ?? null,
    [activeFolder, selectedNoteByFolder, sortOrder]
  );

  const connections = useMemo(
    () => resolveWorkspaceConnections(folders, activeNoteId),
    [folders, activeNoteId]
  );

  return (
    <header className={`navbar ${isNavbarCollapsed ? 'is-collapsed' : ''}`}>
      {/* Hidden file picker for importing separate note files */}
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
                className={`navbar-icon-btn ${isPlusMenuOpen ? 'is-active' : ''}`}
                onClick={() => setIsPlusMenuOpen((v) => !v)}
                title="Create or sync local folder"
                aria-label="Create or import"
              >
                <Plus size={17} strokeWidth={1.9} />
              </button>

              {isPlusMenuOpen && (
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
                      openLinkModal();
                    }}
                  >
                    <FolderSync size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Open local folder (Sync)...</span>
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
                    <span>New folder</span>
                  </button>

                  <div className="plus-menu-divider" />

                  <button
                    type="button"
                    className="plus-menu-item"
                    onClick={() => {
                      closePlusMenu();
                      openImportModal('top-folder');
                    }}
                  >
                    <FolderUp size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Import folder copy...</span>
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

                  <div className="plus-menu-divider" />

                  <button
                    type="button"
                    className="plus-menu-item"
                    onClick={() => {
                      closePlusMenu();
                      openThemeModal();
                    }}
                  >
                    <Palette size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Themes & Colors</span>
                  </button>
                </div>
              )}
            </div>

            {/* Theme palette button */}
            <button
              type="button"
              className="navbar-icon-btn navbar-theme-btn"
              onClick={openThemeModal}
              title={`Themes & Accents: ${activeThemeObj?.name ?? 'Theme'}`}
              aria-label="Themes & Accents"
            >
              <Palette size={16} strokeWidth={1.8} />
              <span className="navbar-theme-dot" />
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
        className={`navbar-tabs ${isNavbarCollapsed ? 'is-slim' : ''}`}
        aria-label="Top-level folders"
      >
        <div className="navbar-tabs-scroll">
          {folders.length === 0 ? (
            <>
              <button
                type="button"
                className="folder-tab is-placeholder"
                onClick={openLinkModal}
                title="Open and sync a folder from your computer"
              >
                <div className="folder-tab-top">
                  <FolderSync size={16} strokeWidth={1.8} className="folder-tab-icon" />
                </div>
                <span className="folder-tab-name">Open local folder</span>
              </button>

              <button
                type="button"
                className="folder-tab is-placeholder"
                onClick={createTopFolder}
              >
                <div className="folder-tab-top">
                  <Plus size={16} strokeWidth={1.8} className="folder-tab-icon" />
                </div>
                <span className="folder-tab-name">New folder</span>
              </button>

              <button
                type="button"
                className="folder-tab is-placeholder"
                onClick={() => openImportModal('top-folder')}
              >
                <div className="folder-tab-top">
                  <FolderUp size={16} strokeWidth={1.8} className="folder-tab-icon" />
                </div>
                <span className="folder-tab-name">Import folder</span>
              </button>
            </>
          ) : (
            folders.map((folder) => {
              const isSelected = folder.id === selectedFolderId;
              const isEditing = folder.id === editingId;
              const linkedNoteCount = !isSelected
                ? (connections.linkedTopFolderCounts.get(folder.id) ?? 0)
                : 0;
              const isLinkedFolder = linkedNoteCount > 0;

              const handleSelectFolderTab = () => {
                if (isLinkedFolder) {
                  const currentNoteInTarget = resolveActiveNoteData(
                    folder,
                    selectedNoteByFolder,
                    sortOrder
                  )?.note.id;
                  const firstLinkedId = connections.firstLinkedNoteByTopFolder.get(folder.id);
                  if (
                    firstLinkedId &&
                    (!currentNoteInTarget || !connections.linkedNoteIds.has(currentNoteInTarget))
                  ) {
                    navigateToNote(folder.id, firstLinkedId);
                    return;
                  }
                }
                selectFolder(folder.id);
              };

              return (
                <div
                  key={folder.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  className={`folder-tab ${isSelected ? 'is-selected' : ''} ${
                    isLinkedFolder ? 'is-linked-folder' : ''
                  } ${isNavbarCollapsed ? 'is-slim' : ''}`}
                  onClick={handleSelectFolderTab}
                  onDoubleClick={(e) => startRename(folder, e)}
                  onKeyDown={(e) => {
                    if (isEditing) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectFolderTab();
                    }
                  }}
                >
                  {/* Top of card: Folder icon at left, disk indicator and subtle actions at right */}
                  <div className="folder-tab-top">
                    <div className="folder-tab-indicators">
                      <Folder
                        size={isNavbarCollapsed ? 14 : 16}
                        strokeWidth={1.8}
                        className={`folder-tab-icon ${isSelected ? 'is-selected-icon' : ''} ${
                          isLinkedFolder ? 'is-linked-icon' : ''
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
                            linkedNoteCount === 1 ? 'note' : 'notes'
                          } in "${folder.name}" connected to current note`}
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
                        if (e.key === 'Enter') {
                          commitRename(folder.id);
                        } else if (e.key === 'Escape') {
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <span className="folder-tab-name">{folder.name}</span>
                  )}
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
                className={`navbar-icon-btn is-compact ${isPlusMenuOpen ? 'is-active' : ''}`}
                onClick={() => setIsPlusMenuOpen((v) => !v)}
                title="Create or sync local folder"
                aria-label="Create or import"
              >
                <Plus size={15} strokeWidth={2} />
              </button>

              {isPlusMenuOpen && (
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
                      openLinkModal();
                    }}
                  >
                    <FolderSync size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Open local folder (Sync)...</span>
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
                    <span>New folder</span>
                  </button>

                  <div className="plus-menu-divider" />

                  <button
                    type="button"
                    className="plus-menu-item"
                    onClick={() => {
                      closePlusMenu();
                      openImportModal('top-folder');
                    }}
                  >
                    <FolderUp size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Import folder copy...</span>
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

                  <div className="plus-menu-divider" />

                  <button
                    type="button"
                    className="plus-menu-item"
                    onClick={() => {
                      closePlusMenu();
                      openThemeModal();
                    }}
                  >
                    <Palette size={15} strokeWidth={1.8} className="plus-menu-icon" />
                    <span>Themes & Colors</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="navbar-icon-btn navbar-theme-btn is-compact"
              onClick={openThemeModal}
              title={`Themes & Accents: ${activeThemeObj?.name ?? 'Theme'}`}
              aria-label="Themes & Accents"
            >
              <Palette size={14} strokeWidth={1.9} />
              <span className="navbar-theme-dot" />
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
    </header>
  );
};
