import React, { useRef } from "react";
import { useClickOutside, useEscapeKey } from "../../hooks/useDomInteractions";

interface FloatingContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  className: string;
  ariaLabel: string;
  shouldIgnoreOutsideClick?: (target: HTMLElement) => boolean;
  children: React.ReactNode;
}

/**
 * Positioned floating menu wrapper wired with outside-click and Escape dismissal.
 */
export const FloatingContextMenu: React.FC<FloatingContextMenuProps> = ({
  isOpen,
  x,
  y,
  onClose,
  className,
  ariaLabel,
  shouldIgnoreOutsideClick,
  children,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, isOpen, onClose, shouldIgnoreOutsideClick);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={className}
      style={{ top: `${y}px`, left: `${x}px` }}
      role="menu"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
};
