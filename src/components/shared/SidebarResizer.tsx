import React from "react";

interface SidebarResizerProps {
  isActive: boolean;
  title: string;
  onStartDrag: () => void;
  onResetWidth: () => void;
}

/**
 * Draggable vertical separator bar for resizing workspace sidebars.
 */
export const SidebarResizer: React.FC<SidebarResizerProps> = ({
  isActive,
  title,
  onStartDrag,
  onResetWidth,
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    tabIndex={0}
    className={`sidebar-resizer ${isActive ? "is-active" : ""}`}
    onMouseDown={(e) => {
      e.preventDefault();
      onStartDrag();
    }}
    onTouchStart={onStartDrag}
    onDoubleClick={onResetWidth}
    title={title}
  >
    <div className="sidebar-resizer-line" />
  </div>
);
