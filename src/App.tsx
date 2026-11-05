import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FolderExplorer } from "./components/FolderExplorer";
import { FolderNavbar } from "./components/FolderNavbar";
import { LinkFolderModal } from "./components/LinkFolderModal";
import { NoteCatalogSidebar } from "./components/NoteCatalogSidebar";
import { NoteEditor } from "./components/NoteEditor";
import { SearchModal } from "./components/SearchModal";
import { SessionModal } from "./components/SessionModal";
import { SettingsModal } from "./components/SettingsModal";
import { usePointerDrag } from "./hooks/useDomInteractions";
import { applyFontSettings } from "./lib/fontSettings";
import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  useNotesStore,
} from "./store/useNotesStore";
import { applyTheme } from "./themes";

export const App: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const isHydrated = useNotesStore((s) => s.isHydrated);
  const theme = useNotesStore((s) => s.theme);
  const fontSettings = useNotesStore((s) => s.fontSettings);
  const isSettingsModalOpen = useNotesStore((s) => s.isSettingsModalOpen);
  const openSettingsModal = useNotesStore((s) => s.openSettingsModal);
  const closeSettingsModal = useNotesStore((s) => s.closeSettingsModal);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isRightSidebarCollapsed = useNotesStore(
    (s) => s.isRightSidebarCollapsed,
  );
  const setSidebarWidth = useNotesStore((s) => s.setSidebarWidth);
  const setRightSidebarWidth = useNotesStore((s) => s.setRightSidebarWidth);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);
  const syncFolderFromDisk = useNotesStore((s) => s.syncFolderFromDisk);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingRightSidebar, setIsDraggingRightSidebar] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
    applyFontSettings(fontSettings);
  }, [theme, fontSettings]);

  const activeLocalPath = useMemo(
    () => folders.find((f) => f.id === selectedFolderId)?.localPath ?? null,
    [folders, selectedFolderId],
  );

  // Automatic background disk synchronization for linked local folders
  useEffect(() => {
    if (!isHydrated || !selectedFolderId || !activeLocalPath) return;

    const triggerAutoSync = () => {
      if (document.visibilityState === "hidden") return;
      void syncFolderFromDisk(selectedFolderId);
    };

    triggerAutoSync();

    const intervalId = window.setInterval(triggerAutoSync, 4000);
    window.addEventListener("focus", triggerAutoSync);
    document.addEventListener("visibilitychange", triggerAutoSync);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", triggerAutoSync);
      document.removeEventListener("visibilitychange", triggerAutoSync);
    };
  }, [isHydrated, selectedFolderId, activeLocalPath, syncFolderFromDisk]);

  const handleLeftSidebarDrag = useCallback(
    (clientX: number) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      setSidebarWidth(clientX - rect.left);
    },
    [setSidebarWidth],
  );

  const handleRightSidebarDrag = useCallback(
    (clientX: number) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      setRightSidebarWidth(rect.right - clientX);
    },
    [setRightSidebarWidth],
  );

  const stopDraggingLeftSidebar = useCallback(
    () => setIsDraggingSidebar(false),
    [],
  );
  const stopDraggingRightSidebar = useCallback(
    () => setIsDraggingRightSidebar(false),
    [],
  );

  usePointerDrag(
    isDraggingSidebar,
    handleLeftSidebarDrag,
    stopDraggingLeftSidebar,
  );
  usePointerDrag(
    isDraggingRightSidebar,
    handleRightSidebarDrag,
    stopDraggingRightSidebar,
  );

  // Global keyboard shortcuts: Ctrl+K for search, Ctrl+\ for sidebar, Ctrl+] for catalog, Ctrl+Shift+\ for navbar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchInitialQuery("");
        setIsSearchOpen((prev) => !prev);
      } else if (e.shiftKey && e.key === "\\") {
        e.preventDefault();
        toggleNavbar();
      } else if (e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "]" || e.key === "}") {
        e.preventDefault();
        toggleRightSidebar();
      } else if (e.key === ",") {
        e.preventDefault();
        openSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, toggleNavbar, toggleRightSidebar, openSettingsModal]);

  return (
    <div className="app-shell">
      <FolderNavbar
        onOpenSearch={() => {
          setSearchInitialQuery("");
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
            className={`sidebar-resizer ${isDraggingSidebar ? "is-active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingSidebar(true);
            }}
            onTouchStart={() => setIsDraggingSidebar(true)}
            onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
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
            className={`sidebar-resizer ${isDraggingRightSidebar ? "is-active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingRightSidebar(true);
            }}
            onTouchStart={() => setIsDraggingRightSidebar(true)}
            onDoubleClick={() =>
              setRightSidebarWidth(DEFAULT_RIGHT_SIDEBAR_WIDTH)
            }
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
          setSearchInitialQuery("");
        }}
      />
      <LinkFolderModal />
      <SessionModal />

      {isSettingsModalOpen && <SettingsModal onClose={closeSettingsModal} />}
    </div>
  );
};

export default App;
