import React from "react";
import {
  ChevronDown,
  Columns2,
  Grid2X2,
  Minimize2,
  RotateCw,
  Rows2,
  Split,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotesStore } from "../../store/useNotesStore";
import { SplitDirection } from "../../types";

interface SplitHandleMenuProps {
  paneId?: string;
  className?: string;
  buttonLabel?: string;
  align?: "left" | "right";
  showCloseActions?: boolean;
}

export const SplitHandleMenu: React.FC<SplitHandleMenuProps> = ({
  paneId,
  className = "",
  buttonLabel,
  align = "right",
  showCloseActions = true,
}) => {
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const splitDirection = useNotesStore((s) => s.splitDirection);
  const splitPane = useNotesStore((s) => s.splitPane);
  const toggleSplitDirection = useNotesStore((s) => s.toggleSplitDirection);
  const resetPaneSizes = useNotesStore((s) => s.resetPaneSizes);
  const closePane = useNotesStore((s) => s.closePane);
  const closeOtherPanes = useNotesStore((s) => s.closeOtherPanes);

  const handleSplit = (direction: SplitDirection) => {
    splitPane(direction, undefined, undefined, paneId);
  };

  const handleFlip = () => {
    toggleSplitDirection();
  };

  const handleResetSizes = () => {
    resetPaneSizes();
  };

  const handleCloseThis = () => {
    closePane(paneId);
  };

  const handleCloseOthers = () => {
    closeOtherPanes(paneId);
  };

  return (
    <div className={`split-handle-wrap ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="split-handle-btn"
            title="Split editor (Split right, Split down, layout options)"
            aria-label="Split editor options"
          >
            <Split size={14} strokeWidth={1.9} className="split-handle-icon" />
            {buttonLabel && (
              <span className="split-handle-label">{buttonLabel}</span>
            )}
            <ChevronDown
              size={11}
              strokeWidth={2}
              className="split-handle-chevron"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align={align === "left" ? "start" : "end"}
          sideOffset={5}
          className="split-handle-dropdown-panel"
        >
          <div className="split-handle-dropdown-header">
            <span>SPLIT EDITOR</span>
          </div>

          <DropdownMenuItem
            className="dropdown-menu-item"
            onClick={() => handleSplit("horizontal")}
          >
            <Columns2 size={14} strokeWidth={1.9} />
            <div className="split-menu-item-text">
              <span className="split-menu-title">Split Right</span>
              <span className="split-menu-desc">Add side-by-side view</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="dropdown-menu-item"
            onClick={() => handleSplit("vertical")}
          >
            <Rows2 size={14} strokeWidth={1.9} />
            <div className="split-menu-item-text">
              <span className="split-menu-title">Split Down</span>
              <span className="split-menu-desc">
                Add stacked top/bottom view
              </span>
            </div>
          </DropdownMenuItem>

          {isSplitViewActive && (
            <>
              <div className="dropdown-menu-divider" />
              <div className="split-handle-dropdown-header">
                <span>LAYOUT CONTROLS</span>
              </div>

              <DropdownMenuItem
                className="dropdown-menu-item"
                onClick={handleFlip}
              >
                <RotateCw size={14} strokeWidth={1.9} />
                <div className="split-menu-item-text">
                  <span className="split-menu-title">Flip Orientation</span>
                  <span className="split-menu-desc">
                    Switch to{" "}
                    {splitDirection === "horizontal"
                      ? "Vertical (Rows)"
                      : "Horizontal (Columns)"}
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="dropdown-menu-item"
                onClick={handleResetSizes}
              >
                <Grid2X2 size={14} strokeWidth={1.9} />
                <div className="split-menu-item-text">
                  <span className="split-menu-title">Equalize Sizes</span>
                  <span className="split-menu-desc">
                    Reset all split views evenly
                  </span>
                </div>
              </DropdownMenuItem>

              {showCloseActions && (
                <>
                  <div className="dropdown-menu-divider" />

                  <DropdownMenuItem
                    className="dropdown-menu-item is-danger"
                    onClick={handleCloseThis}
                  >
                    <X size={14} strokeWidth={2} />
                    <div className="split-menu-item-text">
                      <span className="split-menu-title">Close Pane</span>
                      <span className="split-menu-desc">Close this view</span>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="dropdown-menu-item"
                    onClick={handleCloseOthers}
                  >
                    <Minimize2 size={14} strokeWidth={1.9} />
                    <div className="split-menu-item-text">
                      <span className="split-menu-title">Close Others</span>
                      <span className="split-menu-desc">
                        Keep only this view
                      </span>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
