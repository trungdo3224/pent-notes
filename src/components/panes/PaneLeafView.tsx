import React, { useMemo } from "react";
import { ChevronDown, FileText, X } from "lucide-react";
import {
  listConnectableNotes,
  resolveWorkspaceConnections,
} from "../../lib/catalogUtils";
import { isImageNote, isPdfNote } from "../../lib/fileUtils";
import {
  findNoteAndPath,
  findNoteAndPathAcrossFolders,
} from "../../lib/treeUtils";
import { useNotesStore } from "../../store/useNotesStore";
import { PaneLeafNode, TopLevelFolder } from "../../types";
import { NoteDocumentView } from "../editor/NoteDocumentView";
import { NoteBreadcrumb } from "../shared/NoteBreadcrumb";
import { EditorNoteStatus } from "../shared/NoteMetaBadges";
import { WorkspaceNotePicker } from "../shared/WorkspaceNotePicker";

interface PaneLeafViewProps {
  leaf: PaneLeafNode;
  index: number;
  totalPanes: number;
  isActive: boolean;
  folders: TopLevelFolder[];
  onSelect: () => void;
}

export const PaneLeafView: React.FC<PaneLeafViewProps> = ({
  leaf,
  index,
  totalPanes,
  isActive,
  folders,
  onSelect,
}) => {
  const updateNote = useNotesStore((s) => s.updateNote);
  const setPaneNote = useNotesStore((s) => s.setPaneNote);
  const openInSplitView = useNotesStore((s) => s.openInSplitView);
  const closePane = useNotesStore((s) => s.closePane);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);
  const loadNoteContent = useNotesStore((s) => s.loadNoteContent);

  const noteData = useMemo(() => {
    if (!leaf.noteId) return null;
    if (leaf.folderId) {
      const folder = folders.find((f) => f.id === leaf.folderId);
      if (folder) {
        const found = findNoteAndPath(folder.items, leaf.noteId, [folder.name]);
        if (found) return found;
      }
    }
    return findNoteAndPathAcrossFolders(folders, leaf.noteId);
  }, [folders, leaf.folderId, leaf.noteId]);

  const note = noteData?.note ?? null;
  const breadcrumb = noteData?.path ?? [];

  const allWorkspaceNotes = useMemo(
    () => listConnectableNotes(folders, null),
    [folders],
  );

  const noteContent = note
    ? (activeNoteContents[note.id] ?? note.content ?? "")
    : "";

  React.useEffect(() => {
    if (
      note?.id &&
      note?.filePath &&
      !isPdfNote(note) &&
      !isImageNote(note) &&
      activeNoteContents[note.id] === undefined
    ) {
      void loadNoteContent(note.id, note.filePath);
    }
  }, [note, activeNoteContents, loadNoteContent]);

  const connections = useMemo(
    () =>
      note
        ? resolveWorkspaceConnections(
            folders,
            note.id,
            noteContent,
            activeNoteContents,
          )
        : null,
    [folders, note, noteContent, activeNoteContents],
  );

  const isContentLoading = Boolean(
    note?.filePath && activeNoteContents[note.id] === undefined,
  );

  return (
    <section
      className={`editor-split-col ${isActive ? "is-active-pane" : ""}`}
      onClick={onSelect}
      style={{ flex: 1, height: "100%", width: "100%" }}
    >
      {/* Pane Header */}
      <div className="editor-pane-header">
        <div className="editor-pane-header-left">
          <span
            className="editor-pane-tag"
            title={`Pane ${index + 1} (${isActive ? "Focused" : "Click to focus"})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            Pane {index + 1}
          </span>

          {note ? (
            <NoteBreadcrumb segments={breadcrumb} />
          ) : (
            <span className="editor-pane-empty-title">Select a file</span>
          )}

          {/* Quick File Switcher Popover */}
          <WorkspaceNotePicker
            wrapperClassName="pane-file-switch-wrap"
            popoverClassName="editor-link-popover pane-switch-popover"
            headerTitle={`OPEN FILE IN PANE ${index + 1}`}
            searchPlaceholder="Search files in workspace..."
            emptyText="No matching files found."
            buttonClassName="pane-file-switch-btn"
            buttonTitle={`Switch file in Pane ${index + 1}`}
            buttonAriaLabel="Switch file"
            buttonContent={
              <>
                <FileText size={12} />
                <ChevronDown size={11} />
              </>
            }
            options={allWorkspaceNotes}
            isOptionActive={(opt) => note?.id === opt.note.id}
            onSelectOption={(opt) =>
              setPaneNote(leaf.id, opt.topFolderId, opt.note.id)
            }
            closeOnSelect
            showUnlinkedPlus={false}
            showSearchIcon
            stopTriggerPropagation
            stopPopoverClickPropagation
          />
        </div>

        {/* Pane Header Controls */}
        <div className="editor-pane-header-right">
          {note && (
            <EditorNoteStatus note={note} content={noteContent} compact />
          )}

          {/* Pane Header Actions */}
          <div className="pane-header-actions">
            {totalPanes > 1 && (
              <button
                type="button"
                className="pane-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  closePane(leaf.id);
                }}
                title="Close this pane"
                aria-label="Close pane"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pane Content */}
      {note ? (
        <NoteDocumentView
          note={note}
          content={noteContent}
          isLoading={isContentLoading}
          linkedNotes={connections?.linkedNotes ?? []}
          paneKey={leaf.id}
          onTitleFocus={onSelect}
          onChangeTitle={(title) => updateNote(note.id, { title })}
          onChangeContent={(content) => updateNote(note.id, { content })}
          onOpenLinkedNote={openInSplitView}
          onUnlinkNote={(targetId) => toggleNoteLink(note.id, targetId)}
          stopFooterClickPropagation
        />
      ) : (
        <div className="split-empty-pane" onClick={onSelect}>
          <FileText size={36} strokeWidth={1.5} className="split-empty-icon" />
          <p className="split-empty-title">Pane {index + 1} Empty</p>
          <p className="split-empty-sub">
            Click any note in the left sidebar, or use the file switcher above
            to open a note in this view.
          </p>
        </div>
      )}
    </section>
  );
};
