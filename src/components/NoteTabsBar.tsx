import React, { useCallback, useMemo, useRef } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { isPdfNote } from '../lib/fileUtils';
import { findNoteNode } from '../lib/treeUtils';
import { useNotesStore } from '../store/useNotesStore';
import { NoteItem } from '../types';

export const NoteTabsBar: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const openNotesByFolder = useNotesStore((s) => s.openNotesByFolder ?? {});
  const selectNote = useNotesStore((s) => s.selectNote);
  const closeNoteTab = useNotesStore((s) => s.closeNoteTab);
  const createNote = useNotesStore((s) => s.createNote);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const activeNoteId = selectedFolderId ? selectedNoteByFolder[selectedFolderId] ?? null : null;

  // Resolve list of open notes
  const openNotes = useMemo(() => {
    if (!activeFolder) return [];
    const openIds = openNotesByFolder[activeFolder.id];
    const resolved: NoteItem[] = [];

    if (Array.isArray(openIds) && openIds.length > 0) {
      for (const id of openIds) {
        const found = findNoteNode(activeFolder.items, id);
        if (found) resolved.push(found);
      }
    } else if (activeNoteId) {
      const active = findNoteNode(activeFolder.items, activeNoteId);
      if (active) resolved.push(active);
    }

    return resolved;
  }, [activeFolder, openNotesByFolder, activeNoteId]);

  // Handle horizontal mouse wheel scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  }, []);

  const handleTabClick = (noteId: string) => {
    if (noteId !== activeNoteId) {
      selectNote(noteId);
    }
  };

  const handleAuxClick = (e: React.MouseEvent, noteId: string) => {
    // Middle click closes tab
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      closeNoteTab(noteId);
    }
  };

  const handleClose = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    e.preventDefault();
    closeNoteTab(noteId);
  };

  const handleCreateNew = async () => {
    await createNote(null);
  };

  if (!activeFolder || openNotes.length === 0) {
    return null;
  }

  return (
    <div className="note-tabs-strip-container" onWheel={handleWheel}>
      <div className="note-tabs-scroll-area" ref={scrollContainerRef}>
        {openNotes.map((note) => {
          const isActive = note.id === activeNoteId;
          const isPdf = isPdfNote(note);

          return (
            <div
              key={note.id}
              className={`note-tab-item ${isActive ? 'is-active' : ''}`}
              onClick={() => handleTabClick(note.id)}
              onAuxClick={(e) => handleAuxClick(e, note.id)}
              title={`${note.title || 'Untitled'}${note.filePath ? `\n${note.filePath}` : ''}`}
              role="tab"
              aria-selected={isActive}
            >
              <div className="note-tab-icon">
                {isPdf ? (
                  <span className="note-tab-pdf-badge">PDF</span>
                ) : (
                  <FileText size={13} className="note-tab-file-icon" />
                )}
              </div>

              <span className="note-tab-title">
                {note.title.trim() || 'Untitled Note'}
              </span>

              <button
                type="button"
                className="note-tab-close-btn"
                onClick={(e) => handleClose(e, note.id)}
                title="Close tab (Middle click)"
                aria-label={`Close ${note.title || 'Untitled Note'}`}
              >
                <X size={12} strokeWidth={2.2} />
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
      </div>
    </div>
  );
};

