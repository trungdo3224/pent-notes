import React, { useCallback, useMemo, useRef, useState } from "react";
import { getAllLeaves } from "../../lib/paneLayoutTree";
import { useNotesStore } from "../../store/useNotesStore";
import {
  PaneBranchNode,
  PaneLayoutNode,
  PaneLeafNode,
  TopLevelFolder,
} from "../../types";
import { PaneLeafView } from "./PaneLeafView";

interface PaneSplitTreeProps {
  root: PaneLayoutNode;
}

export const PaneSplitTree: React.FC<PaneSplitTreeProps> = ({ root }) => {
  const folders = useNotesStore((s) => s.folders);
  const activePaneId = useNotesStore((s) => s.activePaneId);
  const setActivePaneId = useNotesStore((s) => s.setActivePaneId);
  const resizePaneBranch = useNotesStore((s) => s.resizePaneBranch);
  const resetPaneSizes = useNotesStore((s) => s.resetPaneSizes);

  const allLeaves = useMemo(() => getAllLeaves(root), [root]);

  return (
    <div
      className="editor-split-tree-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PaneNodeRenderer
        node={root}
        activePaneId={activePaneId}
        allLeaves={allLeaves}
        folders={folders}
        onSelectPane={setActivePaneId}
        onResizeBranch={resizePaneBranch}
        onResetBranchSizes={resetPaneSizes}
      />
    </div>
  );
};

interface PaneNodeRendererProps {
  node: PaneLayoutNode;
  activePaneId: string | null;
  allLeaves: PaneLeafNode[];
  folders: TopLevelFolder[];
  onSelectPane: (paneId: string) => void;
  onResizeBranch: (branchId: string, index: number, deltaRatio: number) => void;
  onResetBranchSizes: (branchId?: string) => void;
}

const PaneNodeRenderer: React.FC<PaneNodeRendererProps> = ({
  node,
  activePaneId,
  allLeaves,
  folders,
  onSelectPane,
  onResizeBranch,
  onResetBranchSizes,
}) => {
  if (node.type === "leaf") {
    const leafIndex = allLeaves.findIndex((l) => l.id === node.id);
    const isActive = activePaneId ? activePaneId === node.id : leafIndex === 0;

    return (
      <PaneLeafView
        leaf={node}
        index={leafIndex >= 0 ? leafIndex : 0}
        totalPanes={allLeaves.length}
        isActive={isActive}
        folders={folders}
        onSelect={() => onSelectPane(node.id)}
      />
    );
  }

  return (
    <BranchContainer
      branch={node}
      activePaneId={activePaneId}
      allLeaves={allLeaves}
      folders={folders}
      onSelectPane={onSelectPane}
      onResizeBranch={onResizeBranch}
      onResetBranchSizes={onResetBranchSizes}
    />
  );
};

interface BranchContainerProps {
  branch: PaneBranchNode;
  activePaneId: string | null;
  allLeaves: PaneLeafNode[];
  folders: TopLevelFolder[];
  onSelectPane: (paneId: string) => void;
  onResizeBranch: (branchId: string, index: number, deltaRatio: number) => void;
  onResetBranchSizes: (branchId?: string) => void;
}

const BranchContainer: React.FC<BranchContainerProps> = ({
  branch,
  activePaneId,
  allLeaves,
  folders,
  onSelectPane,
  onResizeBranch,
  onResetBranchSizes,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`editor-split-layout is-direction-${branch.direction}`}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {branch.children.map((child, idx) => {
        const sizeRatio = branch.sizes[idx] ?? 1 / branch.children.length;
        const flexPercent = (sizeRatio * 100).toFixed(3);

        return (
          <React.Fragment key={child.id}>
            <div
              style={{
                flex: `${sizeRatio} ${sizeRatio} 0%`,
                flexBasis: `${flexPercent}%`,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                overflow: "hidden",
              }}
            >
              <PaneNodeRenderer
                node={child}
                activePaneId={activePaneId}
                allLeaves={allLeaves}
                folders={folders}
                onSelectPane={onSelectPane}
                onResizeBranch={onResizeBranch}
                onResetBranchSizes={onResetBranchSizes}
              />
            </div>

            {idx < branch.children.length - 1 && (
              <BranchDivider
                branchId={branch.id}
                direction={branch.direction}
                index={idx}
                containerRef={containerRef}
                onResize={onResizeBranch}
                onReset={onResetBranchSizes}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

interface BranchDividerProps {
  branchId: string;
  direction: "horizontal" | "vertical";
  index: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResize: (branchId: string, index: number, deltaRatio: number) => void;
  onReset: (branchId?: string) => void;
}

const BranchDivider: React.FC<BranchDividerProps> = ({
  branchId,
  direction,
  index,
  containerRef,
  onResize,
  onReset,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      let lastX = e.clientX;
      let lastY = e.clientY;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        if (direction === "horizontal") {
          const totalWidth = rect.width;
          if (totalWidth <= 0) return;
          const deltaX = moveEvent.clientX - lastX;
          lastX = moveEvent.clientX;
          onResize(branchId, index, deltaX / totalWidth);
        } else {
          const totalHeight = rect.height;
          if (totalHeight <= 0) return;
          const deltaY = moveEvent.clientY - lastY;
          lastY = moveEvent.clientY;
          onResize(branchId, index, deltaY / totalHeight);
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        setIsDragging(false);
        try {
          (e.target as HTMLElement).releasePointerCapture(upEvent.pointerId);
        } catch {
          // pointer capture might already be released
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [branchId, direction, index, containerRef, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation={direction === "vertical" ? "horizontal" : "vertical"}
      tabIndex={0}
      className={`split-resizer is-${direction} ${isDragging ? "is-active" : ""}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset(branchId);
      }}
      title={`Drag to resize (${direction === "horizontal" ? "left/right" : "up/down"}) • Double-click to reset evenly`}
    >
      <div className="split-resizer-line" />
    </div>
  );
};
