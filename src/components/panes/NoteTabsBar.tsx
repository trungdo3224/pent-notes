import React, { useCallback, useMemo, useRef, useState } from "react";
import { Code, Plus, X } from "lucide-react";
import { clampMenuPosition } from "../../hooks/useDomInteractions";
import { getAllLeaves } from "../../lib/paneLayoutTree";
import { findNoteAcrossFolders, findNoteNode } from "../../lib/treeUtils";
import { FloatingContextMenu } from "../shared/FloatingContextMenu";
import { NoteFileIcon } from "../shared/NoteMetaBadges";
import { isNotePendingSave, useNotesStore } from "../../store/useNotesStore";
import { NoteItem } from "../../types";

interface TabContextMenuState {
  x: number;
  y: number;
  noteId: string;
}

export const NoteTabsBar: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const openNotesByFolder = useNotesStore((s) => s.openNotesByFolder ?? {});
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const paneLayout = useNotesStore((s) => s.paneLayout);
  const activePaneId = useNotesStore((s) => s.activePaneId);
  const setActivePaneId = useNotesStore((s) => s.setActivePaneId);
  const selectNote = useNotesStore((s) => s.selectNote);
  const closeNoteTab = useNotesStore((s) => s.closeNoteTab);
  const closeOtherNoteTabs = useNotesStore((s) => s.closeOtherNoteTabs);
  const closeNotesToTheRight = useNotesStore((s) => s.closeNotesToTheRight);
  const closeSavedNoteTabs = useNotesStore((s) => s.closeSavedNoteTabs);
  const closeAllNoteTabs = useNotesStore((s) => s.closeAllNoteTabs);
  const splitPane = useNotesStore((s) => s.splitPane);
  const createNote = useNotesStore((s) => s.createNote);
  const createCodeFile = useNotesStore((s) => s.createCodeFile);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(
    null,
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const activeNoteId = selectedFolderId
    ? (selectedNoteByFolder[selectedFolderId] ?? null)
    : null;

  const leaves = useMemo(
    () => (isSplitViewActive && paneLayout ? getAllLeaves(paneLayout) : []),
    [isSplitViewActive, paneLayout],
  );

  const sourceNoteId = leaves[0]?.noteId ?? null;

  const sidePaneNotes = useMemo(() => {
    if (leaves.length <= 1) return [];
    const result: {
      noteId: string;
      folderId: string | null;
      paneNumber: number;
    }[] = [];
    for (let i = 1; i < leaves.length; i++) {
      const leaf = leaves[i];
      if (leaf.noteId && leaf.noteId !== sourceNoteId) {
        result.push({
          noteId: leaf.noteId,
          folderId: leaf.folderId,
          paneNumber: i + 1,
        });
      }
    }
    return result;
  }, [leaves, sourceNoteId]);

  const paneNumbersByNoteId = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const item of sidePaneNotes) {
      const existing = map.get(item.noteId) ?? [];
      if (!existing.includes(item.paneNumber)) {
        existing.push(item.paneNumber);
      }
      map.set(item.noteId, existing);
    }
    return map;
  }, [sidePaneNotes]);

  // Resolve list of open notes, including side/below panes with distinct documents
  const openNotes = useMemo(() => {
    if (!activeFolder) return [];
    const openIds = openNotesByFolder[activeFolder.id];
    const resolved: NoteItem[] = [];
    const seenIds = new Set<string>();

    if (Array.isArray(openIds) && openIds.length > 0) {
      for (const id of openIds) {
        const found = findNoteNode(activeFolder.items, id);
        if (found && !seenIds.has(found.id)) {
          resolved.push(found);
          seenIds.add(found.id);
        }
      }
    } else if (activeNoteId) {
      const active = findNoteNode(activeFolder.items, activeNoteId);
      if (active && !seenIds.has(active.id)) {
        resolved.push(active);
        seenIds.add(active.id);
      }
    }

    for (const item of sidePaneNotes) {
      if (!seenIds.has(item.noteId)) {
        const noteNode =
          findNoteNode(activeFolder.items, item.noteId) ??
          findNoteAcrossFolders(folders, item.noteId)?.note ??
          null;
        if (noteNode) {
          resolved.push(noteNode);
          seenIds.add(noteNode.id);
        }
      }
    }

    return resolved;
  }, [activeFolder, openNotesByFolder, activeNoteId, sidePaneNotes, folders]);

  const activeLeaf = useMemo(
    () => leaves.find((l) => l.id === activePaneId),
    [leaves, activePaneId],
  );

  const currentActiveNoteId =
    isSplitViewActive && activeLeaf?.noteId ? activeLeaf.noteId : activeNoteId;

  // Handle horizontal mouse wheel scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  }, []);

  const handleTabClick = (noteId: string) => {
    if (isSplitViewActive && leaves.length > 1) {
      const targetLeaf = leaves.find((l) => l.noteId === noteId);
      if (targetLeaf) {
        setActivePaneId(targetLeaf.id);
        return;
      }
    }
    if (noteId !== currentActiveNoteId) {
      selectNote(noteId);
    }
  };

  const handleAuxClick = (e: React.MouseEvent, noteId: string) => {
    // Middle click closes tab
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      closeNoteTab(noteId, activeFolder?.id);
    }
  };

  const handleClose = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    e.preventDefault();
    closeNoteTab(noteId, activeFolder?.id);
  };

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 160, 245);
    setContextMenu({ x, y, noteId });
  };

  const handleAction = (action: () => void) => {
    closeContextMenu();
    action();
  };

  const handleCreateNew = async () => {
    await createNote(null);
  };

  const handleCreateCode = async () => {
    await createCodeFile(null);
  };

  if (!activeFolder || openNotes.length === 0) {
    return null;
  }

  const clickedIndex = contextMenu
    ? openNotes.findIndex((n) => n.id === contextMenu.noteId)
    : -1;
  const isOnlyTab = openNotes.length <= 1;
  const isLastTab = clickedIndex === openNotes.length - 1;
  const hasSavedTabs = openNotes.some(
    (n) => !isNotePendingSave(n.id, n.filePath),
  );

  return (
    <div className="note-tabs-strip-container" onWheel={handleWheel}>
      <div
        className="note-tabs-scroll-area"
        ref={scrollContainerRef}
        onScroll={closeContextMenu}
      >
        {openNotes.map((note) => {
          const isActive = note.id === currentActiveNoteId;
          const isContextOpen = contextMenu?.noteId === note.id;
          const paneNums = paneNumbersByNoteId.get(note.id);
          const paneBadge =
            paneNums && paneNums.length > 0
              ? paneNums.length === 1
                ? `Pane ${paneNums[0]}`
                : `Pane ${paneNums.join(", ")}`
              : null;

          return (
            <div
              key={note.id}
              className={`note-tab-item ${isActive ? "is-active" : ""} ${isContextOpen ? "is-context-open" : ""}`}
              onClick={() => handleTabClick(note.id)}
              onAuxClick={(e) => handleAuxClick(e, note.id)}
              onContextMenu={(e) => handleContextMenu(e, note.id)}
              title={`${note.title || "Untitled"}${note.filePath ? `\n${note.filePath}` : ""}${paneBadge ? ` (${paneBadge})` : ""}`}
              role="tab"
              aria-selected={isActive}
            >
              <div className="note-tab-icon">
                <NoteFileIcon note={note} />
              </div>

              <span className="note-tab-title">
                {note.title.trim() || "Untitled Note"}
              </span>

              {paneBadge && (
                <span
                  className="note-tab-pane-tag"
                  title={`Open in ${paneBadge}`}
                >
                  {paneBadge}
                </span>
              )}

              <button
                type="button"
                className="note-tab-close-btn"
                onClick={(e) => handleClose(e, note.id)}
                title="Close tab (Middle click)"
                aria-label={`Close ${note.title || "Untitled Note"}`}
              >
                <X size={12} strokeWidth={2.8} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="note-tab-new-btn"
          onClick={handleCreateNew}
          title="New Note (Ctrl+N)"
          aria-label="New Note"
        >
          <Plus size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="note-tab-new-btn"
          onClick={handleCreateCode}
          title="New Code File"
          aria-label="New Code File"
        >
          <Code size={13} strokeWidth={2} />
        </button>
      </div>

      {contextMenu && (
        <FloatingContextMenu
          isOpen
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          className="note-tab-context-menu"
          ariaLabel="Tab actions"
        >
          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            onClick={() =>
              handleAction(() =>
                closeNoteTab(contextMenu.noteId, activeFolder.id),
              )
            }
          >
            Close
          </button>

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            disabled={isOnlyTab}
            onClick={() =>
              handleAction(() =>
                closeOtherNoteTabs(contextMenu.noteId, activeFolder.id),
              )
            }
          >
            Close Others
          </button>

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            disabled={isLastTab}
            onClick={() =>
              handleAction(() =>
                closeNotesToTheRight(contextMenu.noteId, activeFolder.id),
              )
            }
          >
            Close to the Right
          </button>

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            disabled={!hasSavedTabs}
            onClick={() =>
              handleAction(() => closeSavedNoteTabs(activeFolder.id))
            }
          >
            Close Saved
          </button>

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            onClick={() =>
              handleAction(() => closeAllNoteTabs(activeFolder.id))
            }
          >
            Close All
          </button>

          <div className="dropdown-menu-divider" />

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            onClick={() =>
              handleAction(() => {
                if (activeFolder) {
                  const fromLeaf = leaves.find(
                    (l) => l.noteId === contextMenu.noteId,
                  );
                  splitPane(
                    "horizontal",
                    activeFolder.id,
                    contextMenu.noteId,
                    fromLeaf?.id,
                  );
                }
              })
            }
          >
            Split Right
          </button>

          <button
            type="button"
            className="note-tab-context-menu-item"
            role="menuitem"
            onClick={() =>
              handleAction(() => {
                if (activeFolder) {
                  const fromLeaf = leaves.find(
                    (l) => l.noteId === contextMenu.noteId,
                  );
                  splitPane(
                    "vertical",
                    activeFolder.id,
                    contextMenu.noteId,
                    fromLeaf?.id,
                  );
                }
              })
            }
          >
            Split Down
          </button>
        </FloatingContextMenu>
      )}
    </div>
  );
};
