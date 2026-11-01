import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Columns2,
  Eye,
  FilePlus,
  FileText,
  FileUp,
  Folder,
  FolderUp,
  HardDrive,
  PanelLeftOpen,
  PanelTopOpen,
  PenLine,
  Plus,
} from 'lucide-react';
import { usePointerDrag } from '../hooks/useDomInteractions';
import { countWords } from '../lib/catalogUtils';
import { isPdfNote, readFileAsDataUrl } from '../lib/fileUtils';
import {
  DEFAULT_SPLIT_RATIO,
  resolveActiveNoteData,
  useNotesStore,
} from '../store/useNotesStore';
import { PdfViewMode } from '../types';
import { MilkdownViewer } from './MilkdownViewer';
import { PdfViewer } from './PdfViewer';

export const NoteEditor: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const viewMode = useNotesStore((s) => s.viewMode);
  const shouldFocusTitle = useNotesStore((s) => s.shouldFocusNoteTitle);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const isRightSidebarCollapsed = useNotesStore((s) => s.isRightSidebarCollapsed);
  const editorSplitRatio = useNotesStore((s) => s.editorSplitRatio ?? DEFAULT_SPLIT_RATIO);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? 'name-asc');

  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);
  const setViewMode = useNotesStore((s) => s.setViewMode);
  const setEditorSplitRatio = useNotesStore((s) => s.setEditorSplitRatio);
  const updateNote = useNotesStore((s) => s.updateNote);
  const createNote = useNotesStore((s) => s.createNote);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const openImportModal = useNotesStore((s) => s.openImportModal);
  const clearFocusNoteTitle = useNotesStore((s) => s.clearFocusNoteTitle);

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [pdfViewMode, setPdfViewMode] = useState<PdfViewMode>('pdf');
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const pdfAttachInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const activeNoteData = useMemo(
    () => resolveActiveNoteData(activeFolder, selectedNoteByFolder, sortOrder),
    [activeFolder, selectedNoteByFolder, sortOrder]
  );

  const note = activeNoteData?.note ?? null;
  const breadcrumb = activeNoteData?.path ?? (activeFolder ? [activeFolder.name] : []);
  const hasActiveFolder = Boolean(activeFolder);

  useEffect(() => {
    if (shouldFocusTitle && note && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
      clearFocusNoteTitle();
    }
  }, [shouldFocusTitle, note, clearFocusNoteTitle]);

  const handleSplitDragMove = useCallback(
    (clientX: number) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const ratio = (offsetX / rect.width) * 100;
      setEditorSplitRatio(ratio);
    },
    [setEditorSplitRatio]
  );

  const stopSplitDrag = useCallback(() => setIsDraggingSplit(false), []);
  usePointerDrag(isDraggingSplit, handleSplitDragMove, stopSplitDrag);

  if (!note) {
    return (
      <main className="editor-pane">
        <div className="editor-topbar">
          <div className="editor-topbar-left">
            {isSidebarCollapsed && (
              <button
                type="button"
                className="sidebar-expand-btn"
                onClick={toggleSidebar}
                title="Expand sidebar (Ctrl+\)"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen size={15} strokeWidth={1.8} />
              </button>
            )}
            {isNavbarCollapsed && (
              <button
                type="button"
                className="sidebar-expand-btn"
                onClick={toggleNavbar}
                title="Expand top navbar (Ctrl+Shift+\)"
                aria-label="Expand top navbar"
              >
                <PanelTopOpen size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
          <div className="editor-topbar-controls">
            <button
              type="button"
              className={`mode-btn editor-catalog-btn ${!isRightSidebarCollapsed ? 'is-active' : ''}`}
              onClick={toggleRightSidebar}
              title={
                isRightSidebarCollapsed
                  ? 'Open note catalog & outline (Ctrl+])'
                  : 'Collapse note catalog (Ctrl+])'
              }
              aria-label="Toggle note catalog"
            >
              <BookOpen size={13} strokeWidth={1.8} />
              <span>Catalog</span>
            </button>
          </div>
        </div>
        <div className="editor-empty-wrapper">
          <div className="editor-empty-state">
            <p className="editor-empty-title">
              {hasActiveFolder ? 'No note selected' : 'Workspace is empty'}
            </p>
            <p className="editor-empty-subtitle">
              {hasActiveFolder
                ? 'Choose a note from the folder explorer or create a new one.'
                : 'Create a folder or import an existing notes directory to get started.'}
            </p>
            {hasActiveFolder ? (
              <button
                type="button"
                className="primary-subtle-btn"
                onClick={() => void createNote(null)}
              >
                <FilePlus size={15} />
                <span>New note</span>
              </button>
            ) : (
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="primary-subtle-btn"
                  onClick={createTopFolder}
                >
                  <Plus size={15} />
                  <span>New folder</span>
                </button>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => openImportModal('top-folder')}
                >
                  <FolderUp size={15} />
                  <span>Import folder</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = `${note.content.slice(0, start)}  ${note.content.slice(end)}`;
      updateNote(note.id, { content: updated });

      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  const words = countWords(note.content);
  const isPdf = isPdfNote(note);

  const handleAttachPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !note) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateNote(note.id, {
      fileType: 'pdf',
      pdfData: dataUrl,
    });
    setPdfViewMode('split');
  };

  const renderSplitDivider = () => (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      className={`split-resizer ${isDraggingSplit ? 'is-active' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDraggingSplit(true);
      }}
      onTouchStart={() => setIsDraggingSplit(true)}
      onDoubleClick={() => setEditorSplitRatio(DEFAULT_SPLIT_RATIO)}
      title="Drag to resize split view (Double-click to reset 50/50)"
    >
      <div className="split-resizer-line" />
    </div>
  );

  return (
    <main className="editor-pane">
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          {isSidebarCollapsed && (
            <button
              type="button"
              className="sidebar-expand-btn"
              onClick={toggleSidebar}
              title="Expand sidebar (Ctrl+\)"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={15} strokeWidth={1.8} />
            </button>
          )}
          {isNavbarCollapsed && (
            <button
              type="button"
              className="sidebar-expand-btn"
              onClick={toggleNavbar}
              title="Expand top navbar (Ctrl+Shift+\)"
              aria-label="Expand top navbar"
            >
              <PanelTopOpen size={15} strokeWidth={1.8} />
            </button>
          )}
          <div className="editor-breadcrumb" aria-label="Note path">
            {breadcrumb.length > 0 && <Folder size={13} strokeWidth={1.9} className="breadcrumb-icon" />}
            {breadcrumb.map((segment, index) => (
              <React.Fragment key={`${segment}-${index}`}>
                {index > 0 && <ChevronRight size={12} strokeWidth={2} className="breadcrumb-sep" />}
                <span
                  className={
                    index === breadcrumb.length - 1 ? 'breadcrumb-current' : 'breadcrumb-part'
                  }
                  title={segment}
                >
                  {segment}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="editor-topbar-controls">
          {isPdf ? (
            <span className="editor-pdf-badge" title="Embedded PDF document">
              <FileText size={12} className="pdf-badge-icon" />
              <span>PDF Document</span>
            </span>
          ) : note.filePath ? (
            <span className="editor-disk-badge" title={`Live disk sync: ${note.filePath}`}>
              <HardDrive size={12} className="disk-badge-icon" />
              <span>Disk file</span>
            </span>
          ) : null}

          <span className="editor-meta">
            {words} {words === 1 ? 'word' : 'words'}
          </span>

          {isPdf ? (
            <div className="editor-mode-switch" role="group" aria-label="PDF view mode">
              <button
                type="button"
                className={`mode-btn ${pdfViewMode === 'pdf' ? 'is-active' : ''}`}
                onClick={() => setPdfViewMode('pdf')}
                title="View PDF full pane"
              >
                <FileText size={13} />
                <span>PDF View</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${pdfViewMode === 'split' ? 'is-active' : ''}`}
                onClick={() => setPdfViewMode('split')}
                title="Split View (PDF on left, Notes on right)"
              >
                <Columns2 size={13} />
                <span>Split with Notes</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${pdfViewMode === 'notes' ? 'is-active' : ''}`}
                onClick={() => setPdfViewMode('notes')}
                title="Markdown notes only"
              >
                <PenLine size={13} />
                <span>Notes</span>
              </button>
            </div>
          ) : (
            <div className="editor-mode-switch" role="group" aria-label="Editor view mode">
              <button
                type="button"
                className={`mode-btn ${viewMode === 'write' ? 'is-active' : ''}`}
                onClick={() => setViewMode('write')}
                title="Write mode"
              >
                <PenLine size={13} />
                <span>Write</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${viewMode === 'split' ? 'is-active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Split mode"
              >
                <Columns2 size={13} />
                <span>Split</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${viewMode === 'preview' ? 'is-active' : ''}`}
                onClick={() => setViewMode('preview')}
                title="Preview mode"
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            </div>
          )}

          <input
            ref={pdfAttachInputRef}
            type="file"
            accept=".pdf"
            hidden
            onChange={(e) => void handleAttachPdf(e)}
          />
          {!isPdf && (
            <button
              type="button"
              className="mode-btn attach-pdf-btn"
              onClick={() => pdfAttachInputRef.current?.click()}
              title="Attach a PDF to view side-by-side with this note"
            >
              <FileUp size={13} strokeWidth={1.8} />
              <span>Attach PDF</span>
            </button>
          )}

          <div className="editor-topbar-divider" />

          <button
            type="button"
            className={`mode-btn editor-catalog-btn ${!isRightSidebarCollapsed ? 'is-active' : ''}`}
            onClick={toggleRightSidebar}
            title={
              isRightSidebarCollapsed
                ? 'Open note catalog & outline (Ctrl+])'
                : 'Collapse note catalog (Ctrl+])'
            }
            aria-label="Toggle note catalog"
          >
            <BookOpen size={13} strokeWidth={1.8} />
            <span>Catalog</span>
          </button>
        </div>
      </div>

      {isPdf && pdfViewMode === 'pdf' ? (
        <div className="editor-pdf-full">
          <PdfViewer
            title={note.title}
            filePath={note.filePath}
            pdfData={note.pdfData}
          />
        </div>
      ) : isPdf && pdfViewMode === 'split' ? (
        <div
          ref={splitContainerRef}
          className={`editor-split-layout ${isDraggingSplit ? 'is-dragging' : ''}`}
        >
          <section
            className="editor-split-col is-pdf"
            style={{ width: `calc(${editorSplitRatio}% - 4px)`, flex: 'none' }}
          >
            <PdfViewer
              title={note.title}
              filePath={note.filePath}
              pdfData={note.pdfData}
            />
          </section>

          {renderSplitDivider()}

          <section
            className="editor-split-col is-write"
            style={{ width: `calc(${100 - editorSplitRatio}% - 4px)`, flex: 'none' }}
          >
            <div className="editor-column">
              <input
                ref={titleInputRef}
                type="text"
                className="note-title-input"
                placeholder="Note title..."
                value={note.title}
                onChange={(e) => updateNote(note.id, { title: e.target.value })}
              />
              <textarea
                className="note-content-textarea"
                placeholder="Write notes about this PDF in Markdown..."
                value={note.content}
                onChange={(e) => updateNote(note.id, { content: e.target.value })}
                onKeyDown={handleTextareaKeyDown}
                spellCheck
              />
            </div>
          </section>
        </div>
      ) : viewMode === 'split' ? (
        <div
          ref={splitContainerRef}
          className={`editor-split-layout ${isDraggingSplit ? 'is-dragging' : ''}`}
        >
          <section
            className="editor-split-col is-write"
            style={{ width: `calc(${editorSplitRatio}% - 4px)`, flex: 'none' }}
          >
            <div className="editor-column">
              <input
                ref={titleInputRef}
                type="text"
                className="note-title-input"
                placeholder="Note title..."
                value={note.title}
                onChange={(e) => updateNote(note.id, { title: e.target.value })}
              />
              <textarea
                className="note-content-textarea"
                placeholder="Start writing in Markdown..."
                value={note.content}
                onChange={(e) => updateNote(note.id, { content: e.target.value })}
                onKeyDown={handleTextareaKeyDown}
                spellCheck
              />
            </div>
          </section>

          {renderSplitDivider()}

          <section
            className="editor-split-col is-preview"
            style={{ width: `calc(${100 - editorSplitRatio}% - 4px)`, flex: 'none' }}
          >
            <div className="editor-column">
              <h1 className="preview-note-title">{note.title.trim() || 'Untitled'}</h1>
              <MilkdownViewer
                key={`split-${note.id}`}
                content={note.content}
                readonly={true}
              />
            </div>
          </section>
        </div>
      ) : (
        <div className="editor-scroll-container">
          <div className="editor-column">
            <input
              ref={titleInputRef}
              type="text"
              className="note-title-input"
              placeholder="Note title..."
              value={note.title}
              onChange={(e) => updateNote(note.id, { title: e.target.value })}
            />

            {viewMode === 'write' ? (
              <textarea
                className="note-content-textarea"
                placeholder="Start writing in Markdown..."
                value={note.content}
                onChange={(e) => updateNote(note.id, { content: e.target.value })}
                onKeyDown={handleTextareaKeyDown}
                spellCheck
              />
            ) : (
              <MilkdownViewer
                key={`preview-${note.id}`}
                content={note.content}
                onChange={(val) => updateNote(note.id, { content: val })}
                readonly={false}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
};
