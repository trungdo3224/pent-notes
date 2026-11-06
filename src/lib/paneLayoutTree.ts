import {
  EditorViewMode,
  PaneBranchNode,
  PaneLayoutNode,
  PaneLeafNode,
  SplitDirection,
} from "../types";

export function createPaneId(): string {
  return "pane-" + Math.random().toString(36).slice(2, 9);
}

export function createBranchId(): string {
  return "branch-" + Math.random().toString(36).slice(2, 9);
}

export function createLeafNode(
  folderId: string | null,
  noteId: string | null,
  viewMode: EditorViewMode = "editor",
  id?: string,
): PaneLeafNode {
  return {
    id: id || createPaneId(),
    type: "leaf",
    folderId,
    noteId,
    viewMode,
  };
}

export function getAllLeaves(node: PaneLayoutNode | null): PaneLeafNode[] {
  if (!node) return [];
  if (node.type === "leaf") return [node];
  return node.children.flatMap(getAllLeaves);
}

export function findLeaf(
  node: PaneLayoutNode | null,
  leafId: string,
): PaneLeafNode | null {
  if (!node) return null;
  if (node.type === "leaf") {
    return node.id === leafId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) return found;
  }
  return null;
}

export function splitLeafInTree(
  root: PaneLayoutNode,
  targetLeafId: string,
  direction: SplitDirection,
  newLeaf: PaneLeafNode,
): PaneLayoutNode {
  if (root.type === "leaf") {
    if (root.id === targetLeafId) {
      return {
        id: createBranchId(),
        type: "branch",
        direction,
        children: [root, newLeaf],
        sizes: [0.5, 0.5],
      };
    }
    return root;
  }

  // Root is a branch
  const targetIdx = root.children.findIndex((c) => c.id === targetLeafId);
  if (targetIdx !== -1) {
    const targetChild = root.children[targetIdx];
    if (root.direction === direction) {
      // Same direction: insert next to targetChild in this branch
      const currentSize = root.sizes[targetIdx] ?? 1 / root.children.length;
      const half = currentSize / 2;
      const newSizes = [...root.sizes];
      newSizes.splice(targetIdx, 1, half, half);

      const newChildren = [...root.children];
      newChildren.splice(targetIdx + 1, 0, newLeaf);

      return {
        ...root,
        children: newChildren,
        sizes: newSizes,
      };
    } else {
      // Perpendicular direction: nest into a sub-branch at targetIdx
      const subBranch: PaneBranchNode = {
        id: createBranchId(),
        type: "branch",
        direction,
        children: [targetChild, newLeaf],
        sizes: [0.5, 0.5],
      };
      const newChildren = [...root.children];
      newChildren[targetIdx] = subBranch;
      return {
        ...root,
        children: newChildren,
      };
    }
  }

  // Target leaf is nested deeper
  return {
    ...root,
    children: root.children.map((c) =>
      splitLeafInTree(c, targetLeafId, direction, newLeaf),
    ),
  };
}

function normalizeSizes(sizes: number[]): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum <= 0) return sizes.map(() => 1 / sizes.length);
  return sizes.map((s) => s / sum);
}

export function removeLeafFromTree(
  root: PaneLayoutNode,
  targetLeafId: string,
): PaneLayoutNode | null {
  if (root.type === "leaf") {
    return root.id === targetLeafId ? null : root;
  }

  // Branch node
  const directIdx = root.children.findIndex((c) => c.id === targetLeafId);
  if (directIdx !== -1) {
    const newChildren = root.children.filter((_, idx) => idx !== directIdx);
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) {
      return newChildren[0]; // Unwrap branch
    }
    const filteredSizes = root.sizes.filter((_, idx) => idx !== directIdx);
    return {
      ...root,
      children: newChildren,
      sizes: normalizeSizes(filteredSizes),
    };
  }

  // Target is deeper
  const updatedChildren: PaneLayoutNode[] = [];
  const updatedSizes: number[] = [];

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    const res = removeLeafFromTree(child, targetLeafId);
    if (res !== null) {
      updatedChildren.push(res);
      updatedSizes.push(root.sizes[i] ?? 1 / root.children.length);
    }
  }

  if (updatedChildren.length === 0) return null;
  if (updatedChildren.length === 1) {
    return updatedChildren[0]; // Unwrap branch
  }

  return {
    ...root,
    children: updatedChildren,
    sizes: normalizeSizes(updatedSizes),
  };
}

export function updateLeafInTree(
  root: PaneLayoutNode,
  leafId: string,
  updater: (leaf: PaneLeafNode) => PaneLeafNode,
): PaneLayoutNode {
  if (root.type === "leaf") {
    return root.id === leafId ? updater(root) : root;
  }
  return {
    ...root,
    children: root.children.map((c) => updateLeafInTree(c, leafId, updater)),
  };
}

export function resizeBranchInTree(
  root: PaneLayoutNode,
  branchId: string,
  dividerIndex: number,
  deltaRatio: number,
  minSize = 0.08,
): PaneLayoutNode {
  if (root.type === "leaf") return root;

  if (root.id === branchId) {
    const i = dividerIndex;
    const j = dividerIndex + 1;
    if (i < 0 || j >= root.sizes.length) return root;

    const sizeI = root.sizes[i] ?? 0.5;
    const sizeJ = root.sizes[j] ?? 0.5;

    // Constrain delta so neither drops below minSize
    const maxDelta = sizeJ - minSize;
    const minDelta = minSize - sizeI;
    const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaRatio));

    const newSizes = [...root.sizes];
    newSizes[i] = sizeI + clampedDelta;
    newSizes[j] = sizeJ - clampedDelta;

    return {
      ...root,
      sizes: newSizes,
    };
  }

  return {
    ...root,
    children: root.children.map((c) =>
      resizeBranchInTree(c, branchId, dividerIndex, deltaRatio, minSize),
    ),
  };
}

export function resetBranchSizes(
  root: PaneLayoutNode,
  branchId?: string,
): PaneLayoutNode {
  if (root.type === "leaf") return root;

  if (!branchId || root.id === branchId) {
    const evenSizes = root.children.map(() => 1 / root.children.length);
    return {
      ...root,
      sizes: evenSizes,
      children: root.children.map((c) => (branchId ? c : resetBranchSizes(c))),
    };
  }

  return {
    ...root,
    children: root.children.map((c) => resetBranchSizes(c, branchId)),
  };
}

export function toggleBranchDirection(
  root: PaneLayoutNode,
  branchId?: string,
): PaneLayoutNode {
  if (root.type === "leaf") return root;

  if (!branchId || root.id === branchId) {
    const nextDir: SplitDirection =
      root.direction === "horizontal" ? "vertical" : "horizontal";
    return {
      ...root,
      direction: nextDir,
    };
  }

  return {
    ...root,
    children: root.children.map((c) => toggleBranchDirection(c, branchId)),
  };
}
