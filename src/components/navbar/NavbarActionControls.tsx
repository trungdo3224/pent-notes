import React from "react";
import {
  ChevronDown,
  FileUp,
  FolderPlus,
  FolderUp,
  Layers,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Radio,
  Search,
  Settings,
} from "lucide-react";

interface SessionPillButtonProps {
  sessionName: string;
  compact?: boolean;
  onClick: () => void;
}

/**
 * Pill trigger showing the active session name and opening the session manager.
 */
export const SessionPillButton: React.FC<SessionPillButtonProps> = ({
  sessionName,
  compact = false,
  onClick,
}) => (
  <button
    type="button"
    className={`session-navbar-pill${compact ? " is-compact" : ""}`}
    onClick={onClick}
    title={`Active Session: ${sessionName} (Click to manage sessions)`}
    aria-label="Manage sessions"
  >
    <Radio size={10} className="session-pulse-dot" />
    <span className="session-navbar-name">{sessionName}</span>
    {!compact && <ChevronDown size={11} className="session-navbar-chevron" />}
  </button>
);

export interface NavbarActionControlsProps {
  compact?: boolean;
  isPlusMenuOpen: boolean;
  plusMenuRef: React.RefObject<HTMLDivElement>;
  onOpenSearch: () => void;
  onTogglePlusMenu: () => void;
  onClosePlusMenu: () => void;
  onOpenSettings: () => void;
  onToggleNavbar: () => void;
  onNewSession: () => void;
  onCreateFolder: () => void;
  onImportFolder: () => void;
  onImportNotes: () => void;
}

/**
 * Shared toolbar action buttons (Search, Plus dropdown, Settings, and Collapse/Expand)
 * reused across both the expanded navbar top row and the collapsed slim strip.
 */
export const NavbarActionControls: React.FC<NavbarActionControlsProps> = ({
  compact = false,
  isPlusMenuOpen,
  plusMenuRef,
  onOpenSearch,
  onTogglePlusMenu,
  onClosePlusMenu,
  onOpenSettings,
  onToggleNavbar,
  onNewSession,
  onCreateFolder,
  onImportFolder,
  onImportNotes,
}) => {
  const compactClass = compact ? " is-compact" : "";
  const iconSize = compact ? 14 : 16;
  const strokeWidth = compact ? 1.9 : 1.8;

  return (
    <>
      <button
        type="button"
        className={`navbar-icon-btn${compactClass}`}
        onClick={onOpenSearch}
        title="Search notes (Ctrl+K)"
        aria-label="Search notes"
      >
        <Search size={iconSize} strokeWidth={strokeWidth} />
      </button>

      <div className="plus-menu-container" ref={plusMenuRef}>
        <button
          type="button"
          className={`navbar-icon-btn${compactClass} ${isPlusMenuOpen ? "is-active" : ""}`}
          onClick={onTogglePlusMenu}
          title="Create or sync local folder"
          aria-label="Create or import"
        >
          <Plus size={compact ? 15 : 17} strokeWidth={compact ? 2 : 1.9} />
        </button>

        {isPlusMenuOpen && (
          <div className="plus-dropdown-menu">
            <button
              type="button"
              className="plus-menu-item"
              onClick={() => {
                onClosePlusMenu();
                onNewSession();
              }}
            >
              <Layers size={15} strokeWidth={1.8} className="plus-menu-icon" />
              <span>New session (new tab)...</span>
            </button>

            <button
              type="button"
              className="plus-menu-item"
              onClick={() => {
                onClosePlusMenu();
                onCreateFolder();
              }}
            >
              <FolderPlus
                size={15}
                strokeWidth={1.8}
                className="plus-menu-icon"
              />
              <span>New empty folder</span>
            </button>

            <div className="plus-menu-divider" />

            <button
              type="button"
              className="plus-menu-item"
              onClick={() => {
                onClosePlusMenu();
                onImportFolder();
              }}
            >
              <FolderUp
                size={15}
                strokeWidth={1.8}
                className="plus-menu-icon"
              />
              <span>Import folder</span>
            </button>

            <button
              type="button"
              className="plus-menu-item"
              onClick={() => {
                onClosePlusMenu();
                onImportNotes();
              }}
            >
              <FileUp size={15} strokeWidth={1.8} className="plus-menu-icon" />
              <span>Import notes & PDFs (.md, .txt, .pdf)</span>
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`navbar-icon-btn navbar-settings-btn${compactClass}`}
        onClick={onOpenSettings}
        title="Settings (Themes, Fonts, Layout)"
        aria-label="Settings"
      >
        <Settings size={iconSize} strokeWidth={strokeWidth} />
      </button>

      <button
        type="button"
        className={`navbar-icon-btn${compactClass}${compact ? " is-highlight" : ""}`}
        onClick={onToggleNavbar}
        title={
          compact
            ? "Expand top navbar (Ctrl+Shift+\\)"
            : "Slim top navbar (Ctrl+Shift+\\)"
        }
        aria-label={compact ? "Expand top navbar" : "Slim top navbar"}
      >
        {compact ? (
          <PanelTopOpen size={14} strokeWidth={1.9} />
        ) : (
          <PanelTopClose size={16} strokeWidth={1.8} />
        )}
      </button>
    </>
  );
};
