import React from "react";
import { Code, FileText, HardDrive, Image as ImageIcon } from "lucide-react";
import { countWords } from "../../lib/catalogUtils";
import {
  getCodeLanguageLabel,
  isCodeNote,
  isImageNote,
  isPdfNote,
} from "../../lib/fileUtils";
import { NoteItem } from "../../types";

interface NoteFileIconProps {
  note: NoteItem;
  size?: number;
  pdfBadgeClassName?: string;
  iconClassName?: string;
}

/**
 * Renders the file-type icon or PDF badge for a note tab or workspace picker item.
 */
export const NoteFileIcon: React.FC<NoteFileIconProps> = ({
  note,
  size = 13,
  pdfBadgeClassName = "note-tab-pdf-badge",
  iconClassName = "note-tab-file-icon",
}) => {
  if (isPdfNote(note)) {
    return <span className={pdfBadgeClassName}>PDF</span>;
  }
  if (isImageNote(note)) {
    return (
      <ImageIcon size={size} className={`${iconClassName} is-image-icon`} />
    );
  }
  if (isCodeNote(note)) {
    return <Code size={size} className={`${iconClassName} is-code-icon`} />;
  }
  return <FileText size={size} className={iconClassName} />;
};

interface EditorNoteStatusProps {
  note: NoteItem;
  content: string;
  compact?: boolean;
}

/**
 * Displays the file-type / disk-sync badges and line or word count for an active note.
 */
export const EditorNoteStatus: React.FC<EditorNoteStatusProps> = ({
  note,
  content,
  compact = false,
}) => {
  const isPdf = isPdfNote(note);
  const isImage = !isPdf && isImageNote(note);
  const isCode = !isPdf && !isImage && isCodeNote(note);
  const codeLang = isCode
    ? getCodeLanguageLabel(note.filePath || note.title)
    : "";
  const iconSize = compact ? 11 : 12;
  const words = countWords(content);
  const lines = content.split("\n").length;

  return (
    <>
      {isPdf ? (
        <span
          className="editor-pdf-badge"
          title={compact ? undefined : "Embedded PDF document"}
        >
          {compact ? (
            "PDF"
          ) : (
            <>
              <FileText size={12} className="pdf-badge-icon" />
              <span>PDF Document</span>
            </>
          )}
        </span>
      ) : isImage ? (
        <span
          className="editor-image-badge"
          title={compact ? undefined : "Image viewer"}
        >
          {compact ? (
            "IMG"
          ) : (
            <>
              <ImageIcon size={12} className="image-badge-icon" />
              <span>Image</span>
            </>
          )}
        </span>
      ) : isCode ? (
        <span
          className="editor-code-badge"
          title={compact ? note.filePath : `Code file: ${note.filePath || ""}`}
        >
          <Code
            size={iconSize}
            className={compact ? undefined : "code-badge-icon"}
          />
          <span>{codeLang}</span>
        </span>
      ) : note.filePath ? (
        <span
          className="editor-disk-badge"
          title={compact ? note.filePath : `Live disk sync: ${note.filePath}`}
        >
          <HardDrive
            size={iconSize}
            className={compact ? undefined : "disk-badge-icon"}
          />
        </span>
      ) : null}

      {!isPdf && !isImage && (
        <span className="editor-meta">
          {compact
            ? isCode
              ? `${lines}L`
              : `${words}w`
            : isCode
              ? `${lines} lines`
              : `${words} ${words === 1 ? "word" : "words"}`}
        </span>
      )}
    </>
  );
};
