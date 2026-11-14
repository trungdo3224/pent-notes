import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FolderNavbar } from "./components/navbar/FolderNavbar";
import { FolderExplorer } from "./components/sidebar/FolderExplorer";
import { NoteCatalogSidebar } from "./components/sidebar/NoteCatalogSidebar";
import { ImageViewer } from "./components/editor/ImageViewer";
import { NoteEditor } from "./components/editor/NoteEditor";
import { LinkFolderModal } from "./components/modals/LinkFolderModal";
import { SearchModal } from "./components/modals/SearchModal";
import { SessionModal } from "./components/modals/SessionModal";
import { SettingsModal } from "./components/modals/SettingsModal";
import { SidebarResizer } from "./components/shared/SidebarResizer";
import { useEscapeKey, usePointerDrag } from "./hooks/useDomInteractions";
import {
  ImageViewerEventDetail,
  OPEN_IMAGE_VIEWER_EVENT,
} from "./lib/codemirror/imageWidget";
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
  const createNote = useNotesStore((s) => s.createNote);
  const syncFolderFromDisk = useNotesStore((s) => s.syncFolderFromDisk);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingRightSidebar, setIsDraggingRightSidebar] = useState(false);
  const [viewerImage, setViewerImage] = useState<ImageViewerEventDetail | null>(
    null,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);

  const closeImageViewer = useCallback(() => setViewerImage(null), []);
  useEscapeKey(Boolean(viewerImage), closeImageViewer);

  useEffect(() => {
    const handleOpenViewer = (e: Event) => {
      const customEvent = e as CustomEvent<ImageViewerEventDetail>;
      if (customEvent.detail?.src) {
        setViewerImage(customEvent.detail);
      }
    };
    window.addEventListener(OPEN_IMAGE_VIEWER_EVENT, handleOpenViewer);
    return () =>
      window.removeEventListener(OPEN_IMAGE_VIEWER_EVENT, handleOpenViewer);
  }, []);

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
      } else if (
        !e.shiftKey &&
        e.key.toLowerCase() === "n" &&
        selectedFolderId
      ) {
        e.preventDefault();
        void createNote(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    toggleSidebar,
    toggleNavbar,
    toggleRightSidebar,
    openSettingsModal,
    createNote,
    selectedFolderId,
  ]);

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
          <SidebarResizer
            isActive={isDraggingSidebar}
            onStartDrag={() => setIsDraggingSidebar(true)}
            onResetWidth={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
            title="Drag to resize sidebar (Double-click to reset)"
          />
        )}
        <NoteEditor />
        {!isRightSidebarCollapsed && (
          <SidebarResizer
            isActive={isDraggingRightSidebar}
            onStartDrag={() => setIsDraggingRightSidebar(true)}
            onResetWidth={() =>
              setRightSidebarWidth(DEFAULT_RIGHT_SIDEBAR_WIDTH)
            }
            title="Drag to resize catalog sidebar (Double-click to reset)"
          />
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

      {viewerImage && (
        <div
          className="modal-backdrop image-viewer-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeImageViewer();
          }}
        >
          <div
            className="image-viewer-modal-frame"
            role="dialog"
            aria-modal="true"
            aria-label="Image viewer"
          >
            <ImageViewer
              title={viewerImage.title}
              imageUrl={viewerImage.src}
              onClose={closeImageViewer}
            />
          </div>
        </div>
      )}
    </div>
  );
};
