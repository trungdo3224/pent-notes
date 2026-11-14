import React from "react";
import { Link2, X } from "lucide-react";
import { LinkedNoteInfo } from "../../lib/catalogUtils";

interface ConnectedNotesFooterProps {
  linkedNotes: LinkedNoteInfo[];
  onOpenNote: (topFolderId: string, noteId: string) => void;
  onUnlink: (targetNoteId: string) => void;
  openTitleFormatter?: (title: string) => string;
  stopContainerClickPropagation?: boolean;
}

/**
 * Displays interactive chips for linked workspace notes with quick-open and unlink actions.
 */
export const ConnectedNotesFooter: React.FC<ConnectedNotesFooterProps> = ({
  linkedNotes,
  onOpenNote,
  onUnlink,
  openTitleFormatter = (title) => `Open "${title}" in separated tab`,
  stopContainerClickPropagation = false,
}) => {
  if (linkedNotes.length === 0) return null;

  return (
    <div
      className="connected-notes-footer"
      onClick={
        stopContainerClickPropagation ? (e) => e.stopPropagation() : undefined
      }
    >
      <div className="connected-notes-header">
        <Link2 size={13} strokeWidth={2} className="connected-notes-icon" />
        <span>Connected notes ({linkedNotes.length})</span>
      </div>
      <div className="connected-notes-list">
        {linkedNotes.map((item) => {
          const displayTitle = item.note.title.trim() || "Untitled";
          return (
            <div key={item.note.id} className="connected-note-pill">
              <button
                type="button"
                className="connected-note-label-btn"
                onClick={() => onOpenNote(item.topFolderId, item.note.id)}
                title={openTitleFormatter(displayTitle)}
              >
                <span className="connected-note-title">{displayTitle}</span>
              </button>

              <button
                type="button"
                className="connected-note-unlink-btn"
                onClick={() => onUnlink(item.note.id)}
                title={`Unlink "${displayTitle}"`}
                aria-label="Unlink"
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
