import { RefObject, useCallback, useEffect, useState } from "react";

const COPY_FEEDBACK_DURATION_MS = 2000;

/**
 * Attaches window mouse/touch move & up listeners while `isDragging` is true,
 * toggling the `is-col-resizing` class on `document.body`.
 */
export function usePointerDrag(
  isDragging: boolean,
  onMove: (clientX: number, clientY: number) => void,
  onEnd: () => void,
): void {
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: MouseEvent | TouchEvent) => {
      const touch = "touches" in event ? event.touches[0] : null;
      const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
      const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
      onMove(clientX, clientY);
    };

    const handlePointerUp = () => {
      onEnd();
      document.body.classList.remove("is-col-resizing");
    };

    document.body.classList.add("is-col-resizing");
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove);
    window.addEventListener("touchend", handlePointerUp);

    return () => {
      document.body.classList.remove("is-col-resizing");
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDragging, onMove, onEnd]);
}

/**
 * Calls `onClose` when a mousedown event occurs outside `containerRef` while `isOpen` is true.
 */
export function useClickOutside(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  shouldIgnore?: (target: HTMLElement) => boolean,
): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        containerRef.current &&
        target &&
        !containerRef.current.contains(target)
      ) {
        if (shouldIgnore?.(target)) return;
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [containerRef, isOpen, onClose, shouldIgnore]);
}

/**
 * Calls `onEscape` when the Escape key is pressed while `isActive` is true.
 */
export function useEscapeKey(isActive: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onEscape]);
}

/**
 * Provides clipboard copy with temporary boolean confirmation state.
 */
export function useCopyFeedback(
  durationMs: number = COPY_FEEDBACK_DURATION_MS,
): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), durationMs);
      });
    },
    [durationMs],
  );

  return [copied, copyText];
}

/**
 * Clamps context menu coordinates so the menu stays within the viewport.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
): { x: number; y: number } {
  const maxX =
    typeof window !== "undefined" ? window.innerWidth - menuWidth - 10 : x;
  const maxY =
    typeof window !== "undefined" ? window.innerHeight - menuHeight - 10 : y;
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}
