import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Eye,
  FileText,
  FileUp,
  Folder,
  FolderUp,
  HardDrive,
  Link2,
  PanelLeftOpen,
  PanelRightOpen,
  PanelTopOpen,
  PenLine,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useClickOutside, usePointerDrag } from '../hooks/useDomInteractions';
import {
  countWords,
  listConnectableNotes,
  resolveWorkspaceConnections,
} from '../lib/catalogUtils';
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
  const navigateToNote = useNotesStore((s) => s.navigateToNote);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const openImportModal = useNotesStore((s) => s.openImportModal);
  const clearFocusNoteTitle = useNotesStore((s) => s.clearFocusNoteTitle);

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [pdfViewMode, setPdfViewMode] = useState<PdfViewMode>('pdf');
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [linkFilter, setLinkFilter] = useState('');
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const pdfAttachInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);

  const closeLinkPicker = useCallback(() => {
    setIsLinkPickerOpen(false);
    setLinkFilter('');
  }, []);
  useClickOutside(linkPickerRef, isLinkPickerOpen, closeLinkPicker);

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

  const connections = useMemo(
    () => resolveWorkspaceConnections(folders, note?.id ?? null),
    [folders, note?.id]
  );

  const connectableNotes = useMemo(() => {
    const all = listConnectableNotes(folders, note?.id ?? null);
    if (!linkFilter.trim()) return all;
    const q = linkFilter.trim().toLowerCase();
    return all.filter((item) => {
      const title = (item.note.title || 'Untitled').toLowerCase();
      const folderPath = [item.topFolderName, ...item.subfolderNames].join('/').toLowerCase();
      return title.includes(q) || folderPath.includes(q);
    });
  }, [folders, note?.id, linkFilter]);

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
                  ? 'Expand (Ctrl+])'
                  : 'Collapse (Ctrl+])'
              }
              aria-label="Toggle note catalog"
            >
              <PanelRightOpen size={15} strokeWidth={1.8} />
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
                ? 'Choose a note from the folder explorer or right-click in the sidebar to create a new note or subfolder.'
                : 'Create a folder or import an existing notes directory to get started.'}
            </p>
            {!hasActiveFolder && (
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
              {/* <span>Disk file</span> */}
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

          {/* Collapsible Link & Attach Menu */}
          <div className="editor-link-picker-wrap" ref={linkPickerRef}>
            <button
              type="button"
              className={`mode-btn editor-link-btn ${
                isLinkPickerOpen || connections.linkedNotes.length > 0 ? 'is-active' : ''
              }`}
              onClick={() => setIsLinkPickerOpen((v) => !v)}
              title="Link notes or attach a PDF to this note"
              aria-label="Link notes and attach files"
              aria-expanded={isLinkPickerOpen}
            >
              <Link2 size={13} strokeWidth={2} />
              {/* <span>Link & Attach</span> */}
              {connections.linkedNotes.length > 0 && (
                <span className="editor-link-count-badge">{connections.linkedNotes.length}</span>
              )}
              <ChevronDown size={12} strokeWidth={2} />
            </button>

            {isLinkPickerOpen && (
              <div className="editor-link-popover">
                {!isPdf && (
                  <>
                    <button
                      type="button"
                      className="editor-attach-pdf-menu-item"
                      onClick={() => {
                        closeLinkPicker();
                        pdfAttachInputRef.current?.click();
                      }}
                    >
                      <FileUp size={14} strokeWidth={1.9} className="attach-pdf-menu-icon" />
                      <div className="attach-pdf-menu-text">
                        <span className="attach-pdf-menu-title">Attach PDF to note...</span>
                        <span className="attach-pdf-menu-sub">View PDF side-by-side with notes</span>
                      </div>
                    </button>
                    <div className="dropdown-menu-divider" />
                  </>
                )}

                <div className="editor-link-popover-header">
                  <span>FIND & CONNECT OTHER NOTES</span>
                  {/* <span className="editor-link-popover-hint">or type [[Note Title]]</span> */}
                </div>
                <div className="editor-link-search">
                  <Search size={12} className="editor-link-search-icon" />
                  <input
                    type="text"
                    className="editor-link-search-input"
                    placeholder="Filter notes or folders..."
                    value={linkFilter}
                    onChange={(e) => setLinkFilter(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="editor-link-list">
                  {connectableNotes.length === 0 ? (
                    <div className="editor-link-empty">No other notes found in workspace.</div>
                  ) : (
                    connectableNotes.map((opt) => {
                      const isLinked = connections.linkedNoteIds.has(opt.note.id);
                      const pathLabel = [opt.topFolderName, ...opt.subfolderNames].join(' / ');
                      return (
                        <button
                          key={opt.note.id}
                          type="button"
                          className={`editor-link-option ${isLinked ? 'is-linked' : ''}`}
                          onClick={() => toggleNoteLink(note.id, opt.note.id)}
                        >
                          <div className="editor-link-option-info">
                            <span className="editor-link-option-title">
                              {opt.note.title.trim() || 'Untitled'}
                            </span>
                            <span className="editor-link-option-path">{pathLabel}</span>
                          </div>
                          <span className="editor-link-option-check">
                            {isLinked ? <Check size={13} strokeWidth={2.3} /> : <Plus size={13} />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="editor-topbar-divider" />

          <button
            type="button"
            className={`mode-btn editor-catalog-btn ${!isRightSidebarCollapsed ? 'is-active' : ''}`}
            onClick={toggleRightSidebar}
            title={
              isRightSidebarCollapsed
                ? 'Expand (Ctrl+])'
                : 'Collapse (Ctrl+])'
            }
            aria-label="Toggle note catalog"
          >
            <PanelRightOpen size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Connected Notes Strip */}
      {connections.linkedNotes.length > 0 && (
        <div className="editor-connected-strip" aria-label="Connected notes">
          <span className="connected-strip-label">
            <Link2 size={12} strokeWidth={2.2} />
            <span>Connected:</span>
          </span>
          <div className="connected-strip-pills">
            {connections.linkedNotes.map((item) => {
              const isOtherTopFolder = item.topFolderId !== selectedFolderId;
              const folderPrefix = isOtherTopFolder
                ? [item.topFolderName, ...item.subfolderNames].join(' / ')
                : item.subfolderNames.join(' / ');
              return (
                <div key={item.note.id} className="connected-note-chip">
                  <button
                    type="button"
                    className="connected-note-jump-btn"
                    onClick={() => navigateToNote(item.topFolderId, item.note.id)}
                    title={`Jump to "${item.note.title.trim() || 'Untitled'}"`}
                  >
                    {folderPrefix && (
                      <span className="connected-note-folder">{folderPrefix} / </span>
                    )}
                    <span className="connected-note-title">
                      {item.note.title.trim() || 'Untitled'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="connected-note-unlink-btn"
                    onClick={() => toggleNoteLink(note.id, item.note.id)}
                    title={`Unlink "${item.note.title.trim() || 'Untitled'}"`}
                    aria-label={`Unlink ${item.note.title.trim() || 'Untitled'}`}
                  >
                    <X size={11} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
