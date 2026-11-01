import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FilePlus,
  FileUp,
  Folder,
  FolderPlus,
  FolderSync,
  FolderUp,
  HardDrive,
  Layers,
  Notebook,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Plus,
  Radio,
  Search,
  Trash2,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import { NOTE_FILE_ACCEPT } from '../lib/fileUtils';
import { sessionApi } from '../lib/sessionManager';
import { useNotesStore } from '../store/useNotesStore';
import { themes } from '../themes';
import { TopLevelFolder } from '../types';

interface FolderNavbarProps {
  onOpenSearch: () => void;
}

export const FolderNavbar: React.FC<FolderNavbarProps> = ({ onOpenSearch }) => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const pendingRenameFolderId = useNotesStore((s) => s.pendingRenameFolderId);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const selectFolder = useNotesStore((s) => s.selectFolder);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const createNote = useNotesStore((s) => s.createNote);
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

  if (isNavbarCollapsed) {
    return (
      <header className="navbar is-collapsed" aria-label="Top navigation">
        <div className="navbar-collapsed-strip">
          <button
            type="button"
            className="navbar-collapsed-expand-btn"
            onClick={toggleNavbar}
            title="Expand top navbar (Ctrl+Shift+\)"
            aria-label="Expand top navbar"
          >
            <PanelTopOpen size={16} strokeWidth={1.8} className="navbar-toggle-icon" />
            <Notebook size={16} strokeWidth={2} className="navbar-brand-icon" />
            <span className="navbar-brand-title">Notes</span>
            {activeFolder && (
              <span className="navbar-collapsed-crumb">
                <span className="navbar-collapsed-sep">/</span>
                <span className="navbar-collapsed-folder-name">{activeFolder.name}</span>
              </span>
            )}
          </button>

          <div className="navbar-collapsed-actions">
            <button
              type="button"
              className="session-navbar-pill is-compact"
              onClick={openSessionModal}
              title={`Active Session: ${currentSessionName} (Click to manage)`}
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
              <Search size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="navbar-icon-btn navbar-theme-btn is-compact"
              onClick={openThemeModal}
              title={`Themes & Accents: ${activeThemeObj?.name ?? 'Theme'}`}
              aria-label="Themes & Accents"
            >
              <Palette size={16} strokeWidth={1.8} />
              <span className="navbar-theme-dot" />
            </button>
            <button
              type="button"
              className="navbar-icon-btn is-compact is-highlight"
              onClick={toggleNavbar}
              title="Expand top navbar (Ctrl+Shift+\)"
              aria-label="Expand top navbar"
            >
              <PanelTopOpen size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="navbar">
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

      {/* Top row: Brand on left, minimal icon actions on right */}
      <div className="navbar-top-row">
        <div className="navbar-brand">
          <button
            type="button"
            className={`navbar-sidebar-toggle ${isSidebarCollapsed ? 'is-collapsed' : ''}`}
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.8} />
            )}
          </button>
          <Notebook size={18} strokeWidth={2} className="navbar-brand-icon" />
          <span className="navbar-brand-title">Notes</span>

          {/* Session Selector Pill */}
          <button
            type="button"
            className="session-navbar-pill"
            onClick={openSessionModal}
            title={`Active Session: ${currentSessionName} (Click to manage sessions)`}
            aria-label="Manage sessions"
          >
            <Radio size={11} className="session-pulse-dot" />
            <span className="session-navbar-name">{currentSessionName}</span>
            <ChevronDown size={12} className="session-navbar-chevron" />
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
            <Search size={18} strokeWidth={1.8} />
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
              <Plus size={19} strokeWidth={1.9} />
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
                  <Layers size={16} strokeWidth={1.8} className="plus-menu-icon" />
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
                  <FolderSync size={16} strokeWidth={1.8} className="plus-menu-icon" />
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
                  <FolderPlus size={16} strokeWidth={1.8} className="plus-menu-icon" />
                  <span>New folder</span>
                </button>

                <button
                  type="button"
                  className="plus-menu-item"
                  onClick={() => {
                    closePlusMenu();
                    void createNote(null);
                  }}
                >
                  <FilePlus size={16} strokeWidth={1.8} className="plus-menu-icon" />
                  <span>New note</span>
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
                  <FolderUp size={16} strokeWidth={1.8} className="plus-menu-icon" />
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
                  <FileUp size={16} strokeWidth={1.8} className="plus-menu-icon" />
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
                  <Palette size={16} strokeWidth={1.8} className="plus-menu-icon" />
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
            <Palette size={17} strokeWidth={1.8} />
            <span className="navbar-theme-dot" />
          </button>

          {/* Collapse navbar button */}
          <button
            type="button"
            className="navbar-icon-btn"
            onClick={toggleNavbar}
            title="Collapse top navbar (Ctrl+Shift+\)"
            aria-label="Collapse top navbar"
          >
            <PanelTopClose size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Tabs Row: Box-shaped card tabs */}
      <nav className="navbar-tabs" aria-label="Top-level folders">
        {folders.length === 0 ? (
          <>
            <button
              type="button"
              className="folder-tab is-placeholder"
              onClick={openLinkModal}
              title="Open and sync a folder from your computer"
            >
              <div className="folder-tab-top">
                <FolderSync size={19} strokeWidth={1.8} className="folder-tab-icon" />
              </div>
              <span className="folder-tab-name">Open local folder</span>
            </button>

            <button
              type="button"
              className="folder-tab is-placeholder"
              onClick={createTopFolder}
            >
              <div className="folder-tab-top">
                <Plus size={19} strokeWidth={1.8} className="folder-tab-icon" />
              </div>
              <span className="folder-tab-name">New folder</span>
            </button>

            <button
              type="button"
              className="folder-tab is-placeholder"
              onClick={() => openImportModal('top-folder')}
            >
              <div className="folder-tab-top">
                <FolderUp size={19} strokeWidth={1.8} className="folder-tab-icon" />
              </div>
              <span className="folder-tab-name">Import folder</span>
            </button>
          </>
        ) : (
          folders.map((folder) => {
            const isSelected = folder.id === selectedFolderId;
            const isEditing = folder.id === editingId;

            return (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                className={`folder-tab ${isSelected ? 'is-selected' : ''}`}
                onClick={() => selectFolder(folder.id)}
                onDoubleClick={(e) => startRename(folder, e)}
                onKeyDown={(e) => {
                  if (isEditing) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectFolder(folder.id);
                  }
                }}
              >
                {/* Top of card: Folder icon at left, disk indicator and subtle actions at right */}
                <div className="folder-tab-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Folder
                      size={20}
                      strokeWidth={1.8}
                      className={`folder-tab-icon ${isSelected ? 'is-selected-icon' : ''}`}
                    />
                    {folder.localPath && (
                      <span
                        className="tab-disk-indicator"
                        title={`Synced with: ${folder.localPath}`}
                      >
                        <HardDrive size={11} />
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
                      <Pencil size={12} strokeWidth={2} />
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
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Bottom of card: Bold folder name */}
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
      </nav>
    </header>
  );
};
