import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderExplorer } from './components/FolderExplorer';
import { FolderNavbar } from './components/FolderNavbar';
import { ImportModal } from './components/ImportModal';
import { LinkFolderModal } from './components/LinkFolderModal';
import { NoteCatalogSidebar } from './components/NoteCatalogSidebar';
import { NoteEditor } from './components/NoteEditor';
import { SearchModal } from './components/SearchModal';
import { SessionModal } from './components/SessionModal';
import { ThemeModal } from './components/ThemeModal';
import { useNotesStore } from './store/useNotesStore';
import { applyTheme } from './themes';

export const App: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const theme = useNotesStore((s) => s.theme);
  const isThemeModalOpen = useNotesStore((s) => s.isThemeModalOpen);
  const importModalMode = useNotesStore((s) => s.importModalMode);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isRightSidebarCollapsed = useNotesStore((s) => s.isRightSidebarCollapsed);
  const setSidebarWidth = useNotesStore((s) => s.setSidebarWidth);
  const setRightSidebarWidth = useNotesStore((s) => s.setRightSidebarWidth);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);

  const chooseTheme = useNotesStore((s) => s.chooseTheme);
  const closeThemeModal = useNotesStore((s) => s.closeThemeModal);
  const closeImportModal = useNotesStore((s) => s.closeImportModal);
  const importNotes = useNotesStore((s) => s.importNotes);
  const importFolder = useNotesStore((s) => s.importFolder);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingRightSidebar, setIsDraggingRightSidebar] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Handle dragging sidebar resize
  useEffect(() => {
    if (!isDraggingSidebar) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!workspaceRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = workspaceRef.current.getBoundingClientRect();
      const newWidth = clientX - rect.left;
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsDraggingSidebar(false);
      document.body.classList.remove('is-col-resizing');
    };

    document.body.classList.add('is-col-resizing');
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      document.body.classList.remove('is-col-resizing');
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingSidebar, setSidebarWidth]);

  // Handle dragging right sidebar resize
  useEffect(() => {
    if (!isDraggingRightSidebar) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!workspaceRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = workspaceRef.current.getBoundingClientRect();
      const newWidth = rect.right - clientX;
      setRightSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsDraggingRightSidebar(false);
      document.body.classList.remove('is-col-resizing');
    };

    document.body.classList.add('is-col-resizing');
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      document.body.classList.remove('is-col-resizing');
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingRightSidebar, setRightSidebarWidth]);

  // Global keyboard shortcuts: Ctrl+K for search, Ctrl+\ for sidebar, Ctrl+] for catalog, Ctrl+Shift+\ for navbar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchInitialQuery('');
        setIsSearchOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '\\') {
        e.preventDefault();
        toggleNavbar();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '}')) {
        e.preventDefault();
        toggleRightSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, toggleNavbar, toggleRightSidebar]);

  const activeFolderName = useMemo(
    () => folders.find((f) => f.id === selectedFolderId)?.name ?? null,
    [folders, selectedFolderId]
  );

  return (
    <div className="app-shell">
      <FolderNavbar
        onOpenSearch={() => {
          setSearchInitialQuery('');
          setIsSearchOpen(true);
        }}
      />

      <div className="workspace-body" ref={workspaceRef}>
        <FolderExplorer />
        {!isSidebarCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            className={`sidebar-resizer ${isDraggingSidebar ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingSidebar(true);
            }}
            onTouchStart={() => setIsDraggingSidebar(true)}
            onDoubleClick={() => setSidebarWidth(280)}
            title="Drag to resize sidebar (Double-click to reset)"
          >
            <div className="sidebar-resizer-line" />
          </div>
        )}
        <NoteEditor />
        {!isRightSidebarCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            className={`sidebar-resizer ${isDraggingRightSidebar ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingRightSidebar(true);
            }}
            onTouchStart={() => setIsDraggingRightSidebar(true)}
            onDoubleClick={() => setRightSidebarWidth(270)}
            title="Drag to resize catalog sidebar (Double-click to reset)"
          >
            <div className="sidebar-resizer-line" />
          </div>
        )}
        <NoteCatalogSidebar
          onOpenSearchWithQuery={(query) => {
            setSearchInitialQuery(query);
            setIsSearchOpen(true);
          }}
        />
      </div>

      <SearchModal
        isOpen={isSearchOpen}
        initialQuery={searchInitialQuery}
        onClose={() => {
          setIsSearchOpen(false);
          setSearchInitialQuery('');
        }}
      />
      <LinkFolderModal />
      <SessionModal />

      {importModalMode && (
        <ImportModal
          initialMode={importModalMode}
          activeFolderName={activeFolderName}
          onClose={closeImportModal}
          onImportedNotes={importNotes}
          onImportedFolder={importFolder}
        />
      )}

      {isThemeModalOpen && (
        <ThemeModal theme={theme} onChoose={chooseTheme} onClose={closeThemeModal} />
      )}
    </div>
  );
};

export default App;
