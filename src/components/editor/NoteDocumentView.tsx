import React from "react";
import { LinkedNoteInfo } from "../../lib/catalogUtils";
import { isCodeNote, isImageNote, isPdfNote } from "../../lib/fileUtils";
import { NoteItem } from "../../types";
import { ConnectedNotesFooter } from "../shared/ConnectedNotesFooter";
import { CodeEditor } from "./CodeEditor";
import { ImageViewer } from "./ImageViewer";
import { MarkdownEditor } from "./MarkdownEditor";
import { PdfViewer } from "./PdfViewer";

interface NoteDocumentViewProps {
  note: NoteItem;
  content: string;
  isLoading: boolean;
  linkedNotes: LinkedNoteInfo[];
  paneKey?: string;
  titleInputRef?: React.RefObject<HTMLInputElement>;
  onTitleFocus?: () => void;
  onChangeTitle: (title: string) => void;
  onChangeContent: (content: string) => void;
  onOpenLinkedNote: (topFolderId: string, noteId: string) => void;
  onUnlinkNote: (targetNoteId: string) => void;
  stopFooterClickPropagation?: boolean;
}

/**
 * Shared note viewer/editor body rendering PDF, image, code, or markdown
 * content alongside the title input and connected-notes footer.
 */
export const NoteDocumentView: React.FC<NoteDocumentViewProps> = ({
  note,
  content,
  isLoading,
  linkedNotes,
  paneKey,
  titleInputRef,
  onTitleFocus,
  onChangeTitle,
  onChangeContent,
  onOpenLinkedNote,
  onUnlinkNote,
  stopFooterClickPropagation = false,
}) => {
  const isPdf = isPdfNote(note);
  if (isPdf) {
    return (
      <div className="editor-pdf-full">
        <PdfViewer
          title={note.title}
          filePath={note.filePath}
          pdfData={note.pdfData}
        />
      </div>
    );
  }

  const isImage = isImageNote(note);
  if (isImage) {
    return (
      <div className="editor-pdf-full">
        <ImageViewer
          title={note.title}
          filePath={note.filePath}
          imageData={note.imageData}
        />
      </div>
    );
  }

  const keyPrefix = paneKey ? `${paneKey}-` : "";

  if (isCodeNote(note)) {
    return (
      <div className="editor-code-full">
        {isLoading ? (
          <div className="editor-loading-placeholder" />
        ) : (
          <CodeEditor
            key={`code-editor-${keyPrefix}${note.id}`}
            value={content}
            onChange={onChangeContent}
            filePath={note.filePath || note.title}
          />
        )}
      </div>
    );
  }

  return (
    <div className="editor-scroll-container">
      <div className="editor-column">
        <input
          ref={titleInputRef}
          type="text"
          className="note-title-input"
          placeholder="Note title..."
          value={note.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          onFocus={onTitleFocus}
        />

        {isLoading ? (
          <div className="editor-loading-placeholder" />
        ) : (
          <MarkdownEditor
            key={`editor-${keyPrefix}${note.id}`}
            value={content}
            onChange={onChangeContent}
            filePath={paneKey ? note.filePath || note.title : note.filePath}
          />
        )}

        <ConnectedNotesFooter
          linkedNotes={linkedNotes}
          onOpenNote={onOpenLinkedNote}
          onUnlink={onUnlinkNote}
          stopContainerClickPropagation={stopFooterClickPropagation}
        />
      </div>
    </div>
  );
};
