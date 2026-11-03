import React, { useCallback, useRef, useState } from 'react';
import {
  ChevronDown,
  Columns2,
  Grid2X2,
  Minimize2,
  RotateCw,
  Rows2,
  Split,
  X,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import { useNotesStore } from '../store/useNotesStore';
import { SplitDirection } from '../types';

interface SplitHandleMenuProps {
  paneId?: string;
  className?: string;
  buttonLabel?: string;
  align?: 'left' | 'right';
  showCloseActions?: boolean;
}

export const SplitHandleMenu: React.FC<SplitHandleMenuProps> = ({
  paneId,
  className = '',
  buttonLabel,
  align = 'right',
  showCloseActions = true,
}) => {
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const splitDirection = useNotesStore((s) => s.splitDirection);
  const splitPane = useNotesStore((s) => s.splitPane);
  const toggleSplitDirection = useNotesStore((s) => s.toggleSplitDirection);
  const resetPaneSizes = useNotesStore((s) => s.resetPaneSizes);
  const closePane = useNotesStore((s) => s.closePane);
  const closeOtherPanes = useNotesStore((s) => s.closeOtherPanes);

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setIsOpen(false), []);
  useClickOutside(menuRef, isOpen, closeMenu);

  const handleSplit = (direction: SplitDirection) => {
    closeMenu();
    splitPane(direction, undefined, undefined, paneId);
  };

  const handleFlip = () => {
    closeMenu();
    toggleSplitDirection();
  };

  const handleResetSizes = () => {
    closeMenu();
    resetPaneSizes();
  };

  const handleCloseThis = () => {
    closeMenu();
    closePane(paneId);
  };

  const handleCloseOthers = () => {
    closeMenu();
    closeOtherPanes(paneId);
  };

  return (
    <div className={`split-handle-wrap ${className}`} ref={menuRef}>
      <button
        type="button"
        className={`split-handle-btn ${isOpen ? 'is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        title="Split editor (Split right, Split down, layout options)"
        aria-label="Split editor options"
        aria-expanded={isOpen}
      >
        <Split size={14} strokeWidth={1.9} className="split-handle-icon" />
        {buttonLabel && <span className="split-handle-label">{buttonLabel}</span>}
        <ChevronDown size={11} strokeWidth={2} className="split-handle-chevron" />
      </button>

      {isOpen && (
        <div
          className={`split-handle-dropdown is-align-${align}`}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <div className="split-handle-dropdown-header">
            <span>SPLIT EDITOR</span>
          </div>

          <button
            type="button"
            className="dropdown-menu-item"
            role="menuitem"
            onClick={() => handleSplit('horizontal')}
          >
            <Columns2 size={14} strokeWidth={1.9} />
            <div className="split-menu-item-text">
              <span className="split-menu-title">Split Right</span>
              <span className="split-menu-desc">Add side-by-side view</span>
            </div>
          </button>

          <button
            type="button"
            className="dropdown-menu-item"
            role="menuitem"
            onClick={() => handleSplit('vertical')}
          >
            <Rows2 size={14} strokeWidth={1.9} />
            <div className="split-menu-item-text">
              <span className="split-menu-title">Split Down</span>
              <span className="split-menu-desc">Add stacked top/bottom view</span>
            </div>
          </button>

          {isSplitViewActive && (
            <>
              <div className="dropdown-menu-divider" />
              <div className="split-handle-dropdown-header">
                <span>LAYOUT CONTROLS</span>
              </div>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={handleFlip}
              >
                <RotateCw size={14} strokeWidth={1.9} />
                <div className="split-menu-item-text">
                  <span className="split-menu-title">Flip Orientation</span>
                  <span className="split-menu-desc">
                    Switch to {splitDirection === 'horizontal' ? 'Vertical (Rows)' : 'Horizontal (Columns)'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="dropdown-menu-item"
                role="menuitem"
                onClick={handleResetSizes}
              >
                <Grid2X2 size={14} strokeWidth={1.9} />
                <div className="split-menu-item-text">
                  <span className="split-menu-title">Equalize Sizes</span>
                  <span className="split-menu-desc">Reset all split views evenly</span>
                </div>
              </button>

              {showCloseActions && (
                <>
                  <div className="dropdown-menu-divider" />

                  <button
                    type="button"
                    className="dropdown-menu-item is-danger"
                    role="menuitem"
                    onClick={handleCloseThis}
                  >
                    <X size={14} strokeWidth={2} />
                    <div className="split-menu-item-text">
                      <span className="split-menu-title">Close Pane</span>
                      <span className="split-menu-desc">Close this view</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="dropdown-menu-item"
                    role="menuitem"
                    onClick={handleCloseOthers}
                  >
                    <Minimize2 size={14} strokeWidth={1.9} />
                    <div className="split-menu-item-text">
                      <span className="split-menu-title">Close Others</span>
                      <span className="split-menu-desc">Keep only this view</span>
                    </div>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

