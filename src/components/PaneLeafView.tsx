import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  HardDrive,
  Link2,
  PenLine,
  Search,
  X,
} from "lucide-react";
import { useClickOutside } from "../hooks/useDomInteractions";
import {
  countWords,
  listConnectableNotes,
  resolveWorkspaceConnections,
} from "../lib/catalogUtils";
import { isPdfNote } from "../lib/fileUtils";
import { findNoteAndPath, findNoteByTitle } from "../lib/treeUtils";
import { isObsidianMode, useNotesStore } from "../store/useNotesStore";
import { PaneLeafNode, TopLevelFolder } from "../types";
import { MarkdownEditor } from "./MarkdownEditor";
import { MilkdownViewer } from "./MilkdownViewer";
import { PdfViewer } from "./PdfViewer";

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
  const setPaneViewMode = useNotesStore((s) => s.setPaneViewMode);
  const setPaneNote = useNotesStore((s) => s.setPaneNote);
  const closePane = useNotesStore((s) => s.closePane);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);
  const loadNoteContent = useNotesStore((s) => s.loadNoteContent);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
    setFilterQuery("");
  }, []);
  useClickOutside(pickerRef, isPickerOpen, closePicker);

  // Resolve note data for this leaf
  const noteData = useMemo(() => {
    if (!leaf.noteId) return null;
    if (leaf.folderId) {
      const folder = folders.find((f) => f.id === leaf.folderId);
      if (folder) {
        const found = findNoteAndPath(folder.items, leaf.noteId, [folder.name]);
        if (found) return found;
      }
    }
    for (const f of folders) {
      const found = findNoteAndPath(f.items, leaf.noteId, [f.name]);
      if (found) return found;
    }
    return null;
  }, [folders, leaf.folderId, leaf.noteId]);

  const note = noteData?.note ?? null;
  const breadcrumb = noteData?.path ?? [];

  // Workspace searchable notes for switcher
  const allWorkspaceNotes = useMemo(() => {
    const all = listConnectableNotes(folders, null);
    if (!filterQuery.trim()) return all;
    const q = filterQuery.trim().toLowerCase();
    return all.filter((item) => {
      const title = (item.note.title || "Untitled").toLowerCase();
      const folderPath = [item.topFolderName, ...item.subfolderNames]
        .join("/")
        .toLowerCase();
      return title.includes(q) || folderPath.includes(q);
    });
  }, [folders, filterQuery]);

  const noteContent = note
    ? (activeNoteContents[note.id] ?? note.content ?? "")
    : "";

  React.useEffect(() => {
    if (
      note?.id &&
      note?.filePath &&
      activeNoteContents[note.id] === undefined
    ) {
      void loadNoteContent(note.id, note.filePath);
    }
  }, [note?.id, note?.filePath, activeNoteContents, loadNoteContent]);

  // Connected notes for this note
  const connections = useMemo(
    () =>
      note ? resolveWorkspaceConnections(folders, note.id, noteContent) : null,
    [folders, note, noteContent],
  );

  const wikilinkNotes = useMemo(() => {
    return listConnectableNotes(folders, null).map((item) => ({
      id: item.note.id,
      title: item.note.title.trim() || "Untitled",
      folderPath: [item.topFolderName, ...item.subfolderNames].join(" / "),
    }));
  }, [folders]);

  const handleOpenWikilink = useCallback(
    (targetTitle: string) => {
      for (const f of folders) {
        const found = findNoteByTitle(f.items, targetTitle);
        if (found) {
          setPaneNote(leaf.id, f.id, found.id);
          return;
        }
      }
    },
    [folders, leaf.id, setPaneNote],
  );

  const isPdf = note ? isPdfNote(note) : false;
  const words = note ? countWords(note.content) : 0;

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
            <div className="editor-breadcrumb" aria-label="Note path">
              {breadcrumb.length > 0 && (
                <Folder
                  size={13}
                  strokeWidth={1.9}
                  className="breadcrumb-icon"
                />
              )}
              {breadcrumb.map((segment, idx) => (
                <React.Fragment key={`${segment}-${idx}`}>
                  {idx > 0 && (
                    <ChevronRight
                      size={12}
                      strokeWidth={2}
                      className="breadcrumb-sep"
                    />
                  )}
                  <span
                    className={
                      idx === breadcrumb.length - 1
                        ? "breadcrumb-current"
                        : "breadcrumb-part"
                    }
                    title={segment}
                  >
                    {segment}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <span className="editor-pane-empty-title">Select a file</span>
          )}

          {/* Quick File Switcher Popover */}
          <div className="pane-file-switch-wrap" ref={pickerRef}>
            <button
              type="button"
              className="pane-file-switch-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsPickerOpen((v) => !v);
              }}
              title={`Switch file in Pane ${index + 1}`}
              aria-label="Switch file"
            >
              <FileText size={12} />
              <ChevronDown size={11} />
            </button>

            {isPickerOpen && (
              <div
                className="editor-link-popover pane-switch-popover"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="editor-link-popover-header">
                  <span>OPEN FILE IN PANE {index + 1}</span>
                </div>
                <div className="editor-link-search">
                  <Search size={12} className="editor-link-search-icon" />
                  <input
                    type="text"
                    className="editor-link-search-input"
                    placeholder="Search files in workspace..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="editor-link-list">
                  {allWorkspaceNotes.length === 0 ? (
                    <div className="editor-link-empty">
                      No matching files found.
                    </div>
                  ) : (
                    allWorkspaceNotes.map((opt) => {
                      const isCurrent = note?.id === opt.note.id;
                      const pathLabel = [
                        opt.topFolderName,
                        ...opt.subfolderNames,
                      ].join(" / ");
                      return (
                        <button
                          key={opt.note.id}
                          type="button"
                          className={`editor-link-option ${isCurrent ? "is-linked" : ""}`}
                          onClick={() => {
                            setPaneNote(leaf.id, opt.topFolderId, opt.note.id);
                            closePicker();
                          }}
                        >
                          <div className="editor-link-option-info">
                            <span className="editor-link-option-title">
                              {opt.note.title.trim() || "Untitled"}
                            </span>
                            <span className="editor-link-option-path">
                              {pathLabel}
                            </span>
                          </div>
                          {isCurrent && <Check size={13} strokeWidth={2.3} />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pane Header Controls */}
        <div className="editor-pane-header-right">
          {note && (
            <>
              {isPdf ? (
                <span className="editor-pdf-badge">PDF</span>
              ) : note.filePath ? (
                <span className="editor-disk-badge" title={note.filePath}>
                  <HardDrive size={11} />
                </span>
              ) : null}

              <span className="editor-meta">{words}w</span>

              {!isPdf && (
                <div
                  className="editor-mode-switch"
                  role="group"
                  aria-label="Pane markdown style mode"
                >
                  <button
                    type="button"
                    className={`mode-btn ${isObsidianMode(leaf.viewMode) ? "is-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaneViewMode(leaf.id, "obsidian");
                    }}
                    title="Obsidian Style (Markdown, wikilinks, Live Preview)"
                    aria-label="Obsidian Style"
                  >
                    <PenLine size={12} />
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${!isObsidianMode(leaf.viewMode) ? "is-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaneViewMode(leaf.id, "notebook");
                    }}
                    title="Notebook Style (Milkdown Crepe block WYSIWYG, slash menus)"
                    aria-label="Notebook Style"
                  >
                    <BookOpen size={12} />
                  </button>
                </div>
              )}
            </>
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
        isPdf ? (
          <div className="editor-pdf-full">
            <PdfViewer
              title={note.title}
              filePath={note.filePath}
              pdfData={note.pdfData}
            />
          </div>
        ) : (
          <div className="editor-scroll-container">
            <div className="editor-column">
              <input
                type="text"
                className="note-title-input"
                placeholder="Note title..."
                value={note.title}
                onChange={(e) => updateNote(note.id, { title: e.target.value })}
                onFocus={onSelect}
              />

              {isObsidianMode(leaf.viewMode) ? (
                <MarkdownEditor
                  key={`editor-obsidian-${leaf.id}-${note.id}`}
                  content={noteContent}
                  onChange={(val) => updateNote(note.id, { content: val })}
                  readonly={false}
                  notes={wikilinkNotes}
                  onOpenWikilink={handleOpenWikilink}
                />
              ) : (
                <MilkdownViewer
                  key={`editor-notebook-${leaf.id}-${note.id}`}
                  content={noteContent}
                  onChange={(val) => updateNote(note.id, { content: val })}
                  readonly={false}
                />
              )}

              {/* Connected Notes Footer */}
              {connections && connections.linkedNotes.length > 0 && (
                <div
                  className="connected-notes-footer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="connected-notes-header">
                    <Link2
                      size={13}
                      strokeWidth={2}
                      className="connected-notes-icon"
                    />
                    <span>
                      Connected notes ({connections.linkedNotes.length})
                    </span>
                  </div>
                  <div className="connected-notes-list">
                    {connections.linkedNotes.map((item) => (
                      <div key={item.note.id} className="connected-note-pill">
                        <button
                          type="button"
                          className="connected-note-label-btn"
                          onClick={() =>
                            setPaneNote(leaf.id, item.topFolderId, item.note.id)
                          }
                          title={`Open "${item.note.title.trim() || "Untitled"}" here`}
                        >
                          <span className="connected-note-title">
                            {item.note.title.trim() || "Untitled"}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="connected-note-unlink-btn"
                          onClick={() => toggleNoteLink(note.id, item.note.id)}
                          title={`Unlink "${item.note.title.trim() || "Untitled"}"`}
                          aria-label="Unlink"
                        >
                          <X size={11} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
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
