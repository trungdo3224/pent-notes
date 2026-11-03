import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
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
  Split,
  X,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useDomInteractions';
import {
  countWords,
  listConnectableNotes,
  resolveWorkspaceConnections,
} from '../lib/catalogUtils';
import { isPdfNote, NOTE_FILE_ACCEPT, readFileAsDataUrl } from '../lib/fileUtils';
import { getAllLeaves } from '../lib/paneLayoutTree';
import {
  resolveActiveNoteData,
  useNotesStore,
} from '../store/useNotesStore';
import { EditorViewMode, NoteItem } from '../types';
import { MilkdownViewer } from './MilkdownViewer';
import { PaneSplitTree } from './PaneSplitTree';
import { PdfViewer } from './PdfViewer';
import { SplitHandleMenu } from './SplitHandleMenu';

export const NoteEditor: React.FC = () => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const viewMode = useNotesStore((s) => s.viewMode);
  const shouldFocusTitle = useNotesStore((s) => s.shouldFocusNoteTitle);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const isRightSidebarCollapsed = useNotesStore((s) => s.isRightSidebarCollapsed);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? 'name-asc');

  // Multi-pane split state
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const paneLayout = useNotesStore((s) => s.paneLayout);

  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);
  const setViewMode = useNotesStore((s) => s.setViewMode);
  const updateNote = useNotesStore((s) => s.updateNote);
  const toggleNoteLink = useNotesStore((s) => s.toggleNoteLink);
  const createTopFolder = useNotesStore((s) => s.createTopFolder);
  const importNotesFiles = useNotesStore((s) => s.importNotesFiles);
  const openLinkModal = useNotesStore((s) => s.openLinkModal);
  const clearFocusNoteTitle = useNotesStore((s) => s.clearFocusNoteTitle);
  const closeSplitView = useNotesStore((s) => s.closeSplitView);

  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [linkFilter, setLinkFilter] = useState('');

  const pdfAttachInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);

  const closeLinkPicker = useCallback(() => {
    setIsLinkPickerOpen(false);
    setLinkFilter('');
  }, []);
  useClickOutside(linkPickerRef, isLinkPickerOpen, closeLinkPicker);

  // Active note resolution
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

  const totalPanes = useMemo(
    () => (paneLayout ? getAllLeaves(paneLayout).length : 1),
    [paneLayout]
  );

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

  if (!note && (!isSplitViewActive || !paneLayout)) {
    return (
      <main className="editor-pane">
        <div className="editor-topbar">
          <div className="editor-topbar-left">
            {isSidebarCollapsed && (
              <button
                type="button"
                className="sidebar-expand-btn"
                onClick={toggleSidebar}
                title="Expand sidebar"
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
                title="Expand top navbar"
                aria-label="Expand top navbar"
              >
                <PanelTopOpen size={15} strokeWidth={1.8} />
              </button>
            )}
            {renderBreadcrumb(breadcrumb)}
          </div>
          <div className="editor-topbar-controls">
            {isRightSidebarCollapsed && (
              <button
                type="button"
                className="sidebar-expand-btn is-right-btn"
                onClick={toggleRightSidebar}
                title="Expand right catalog sidebar"
                aria-label="Expand right sidebar"
              >
                <PanelRightOpen size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>

        <div className="editor-empty-state">
          <div className="editor-empty-box">
            <div className="empty-state-badge">PENT NOTES</div>
            <h2 className="editor-empty-title">
              {hasActiveFolder ? 'Folder is empty' : 'No folder selected'}
            </h2>
            <p className="editor-empty-description">
              {hasActiveFolder
                ? 'Create a new markdown note or import existing files from your computer to begin working in this folder.'
                : 'Choose a folder from the navigation bar above or create a new workspace folder.'}
            </p>

            <div className="empty-state-actions">
              <input
                ref={noteFileInputRef}
                type="file"
                accept={NOTE_FILE_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  const selected = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = '';
                  if (selected.length > 0) {
                    void importNotesFiles(selected);
                  }
                }}
              />
              {hasActiveFolder ? (
                <>
                  <button
                    type="button"
                    className="empty-action-primary"
                    onClick={() => noteFileInputRef.current?.click()}
                  >
                    <FileUp size={15} strokeWidth={2} />
                    <span>Import Notes</span>
                  </button>
                  <button
                    type="button"
                    className="empty-action-secondary"
                    onClick={() => openLinkModal('subfolder')}
                  >
                    <FolderUp size={15} strokeWidth={1.8} />
                    <span>Add Subfolder</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="empty-action-primary"
                  onClick={createTopFolder}
                >
                  <Plus size={15} strokeWidth={2} />
                  <span>Create First Folder</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    targetNote: NoteItem
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = `${targetNote.content.slice(0, start)}  ${targetNote.content.slice(end)}`;
      updateNote(targetNote.id, { content: updated });

      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  const handleAttachPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !note) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateNote(note.id, {
      fileType: 'pdf',
      pdfData: dataUrl,
    });
  };

  function renderBreadcrumb(crumbs: string[]) {
    return (
      <div className="editor-breadcrumb" aria-label="Note path">
        {crumbs.length > 0 && <Folder size={13} strokeWidth={1.9} className="breadcrumb-icon" />}
        {crumbs.map((segment, index) => (
          <React.Fragment key={`${segment}-${index}`}>
            {index > 0 && <ChevronRight size={12} strokeWidth={2} className="breadcrumb-sep" />}
            <span
              className={index === crumbs.length - 1 ? 'breadcrumb-current' : 'breadcrumb-part'}
              title={segment}
            >
              {segment}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  const renderNoteContent = (
    targetNote: NoteItem,
    targetViewMode: EditorViewMode,
    isPrimaryTitle = false
  ) => {
    const isPdf = isPdfNote(targetNote);

    if (isPdf) {
      return (
        <div className="editor-pdf-full">
          <PdfViewer
            title={targetNote.title}
            filePath={targetNote.filePath}
            pdfData={targetNote.pdfData}
          />
        </div>
      );
    }

    return (
      <div className="editor-scroll-container">
        <div className="editor-column">
          <input
            ref={isPrimaryTitle ? titleInputRef : undefined}
            type="text"
            className="note-title-input"
            placeholder="Note title..."
            value={targetNote.title}
            onChange={(e) => updateNote(targetNote.id, { title: e.target.value })}
          />

          {targetViewMode === 'write' ? (
            <textarea
              className="note-content-textarea"
              placeholder="Start writing in Markdown..."
              value={targetNote.content}
              onChange={(e) => updateNote(targetNote.id, { content: e.target.value })}
              onKeyDown={(e) => handleTextareaKeyDown(e, targetNote)}
              spellCheck
            />
          ) : (
            <MilkdownViewer
              key={`preview-main-${targetNote.id}`}
              content={targetNote.content}
              onChange={(val) => updateNote(targetNote.id, { content: val })}
              readonly={false}
            />
          )}

          {/* Connected Notes Footer in Single View */}
          {connections && connections.linkedNotes.length > 0 && (
            <div className="connected-notes-footer">
              <div className="connected-notes-header">
                <Link2 size={13} strokeWidth={2} className="connected-notes-icon" />
                <span>Connected notes ({connections.linkedNotes.length})</span>
              </div>
              <div className="connected-notes-list">
                {connections.linkedNotes.map((item) => (
                  <div key={item.note.id} className="connected-note-pill">
                    <span className="connected-note-title" title={item.note.title}>
                      {item.note.title.trim() || 'Untitled'}
                    </span>

                    <button
                      type="button"
                      className="connected-note-unlink-btn"
                      onClick={() => toggleNoteLink(note!.id, item.note.id)}
                      title={`Unlink "${item.note.title.trim() || 'Untitled'}"`}
                      aria-label={`Unlink ${item.note.title.trim() || 'Untitled'}`}
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
    );
  };

  const primaryWords = note ? countWords(note.content) : 0;
  const isPrimaryPdf = note ? isPdfNote(note) : false;

  return (
    <main className="editor-pane">
      {/* Top Bar */}
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          {isSidebarCollapsed && (
            <button
              type="button"
              className="sidebar-expand-btn"
              onClick={toggleSidebar}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={15} strokeWidth={1.8} />
            </button>
          )}

          {!isSplitViewActive && renderBreadcrumb(breadcrumb)}

          {isSplitViewActive && (
            <div className="editor-split-indicator-pill">
              <Split size={13} strokeWidth={2} />
              <span>Split View ({totalPanes} {totalPanes === 1 ? 'Pane' : 'Panes'})</span>
            </div>
          )}
        </div>

        <div className="editor-topbar-controls">
          {!isSplitViewActive && note && (
            <>
              {isPrimaryPdf ? (
                <span className="editor-pdf-badge" title="Embedded PDF document">
                  <FileText size={12} className="pdf-badge-icon" />
                  <span>PDF Document</span>
                </span>
              ) : note.filePath ? (
                <span className="editor-disk-badge" title={`Live disk sync: ${note.filePath}`}>
                  <HardDrive size={12} className="disk-badge-icon" />
                </span>
              ) : null}

              <span className="editor-meta">
                {primaryWords} {primaryWords === 1 ? 'word' : 'words'}
              </span>

              {/* View Mode Toggle: Write vs Preview */}
              {!isPrimaryPdf && (
                <div className="editor-mode-switch" role="group" aria-label="Editor view mode">
                  <button
                    type="button"
                    className={`mode-btn ${viewMode === 'write' ? 'is-active' : ''}`}
                    onClick={() => setViewMode('write')}
                    title="Write mode (raw Markdown)"
                  >
                    <PenLine size={13} />
                    <span>Write</span>
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${viewMode === 'preview' ? 'is-active' : ''}`}
                    onClick={() => setViewMode('preview')}
                    title="Preview mode (Rich Markdown)"
                  >
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>
                </div>
              )}
            </>
          )}

          <input
            ref={pdfAttachInputRef}
            type="file"
            accept=".pdf"
            hidden
            onChange={(e) => void handleAttachPdf(e)}
          />

          {/* Collapsible Link & Attach Menu */}
          {note && (
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
                {connections.linkedNotes.length > 0 && (
                  <span className="editor-link-count-badge">{connections.linkedNotes.length}</span>
                )}
                <ChevronDown size={12} strokeWidth={2} />
              </button>

              {isLinkPickerOpen && (
                <div className="editor-link-popover">
                  {!isPrimaryPdf && (
                    <>
                      <button
                        type="button"
                        className="editor-link-popover-item is-attach-btn"
                        onClick={() => {
                          closeLinkPicker();
                          pdfAttachInputRef.current?.click();
                        }}
                      >
                        <FileUp size={14} strokeWidth={1.8} />
                        <span>Attach PDF to this note</span>
                      </button>
                      <div className="dropdown-menu-divider" />
                    </>
                  )}

                  <div className="editor-link-popover-header">
                    <span>CONNECT WITH NOTES</span>
                  </div>

                  <div className="editor-link-search">
                    <input
                      type="text"
                      className="editor-link-search-input"
                      placeholder="Search notes to link..."
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
          )}

          {/* Unified Grouped Split Handle */}
          <div className="editor-split-btn-group" role="group" aria-label="Split controls">
            <SplitHandleMenu buttonLabel={isSplitViewActive ? undefined : 'Split'} align="right" />

            {isSplitViewActive && (
              <button
                type="button"
                className="mode-btn editor-split-btn is-close-split"
                onClick={closeSplitView}
                title="Close split views"
                aria-label="Close split view"
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>

          {isRightSidebarCollapsed && (
            <button
              type="button"
              className="sidebar-expand-btn is-right-btn"
              onClick={toggleRightSidebar}
              title="Expand right catalog sidebar"
              aria-label="Expand right sidebar"
            >
              <PanelRightOpen size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* Main Body: Multi-view Recursive Split OR Single Note View */}
      {isSplitViewActive && paneLayout ? (
        <PaneSplitTree root={paneLayout} />
      ) : (
        note && renderNoteContent(note, viewMode, true)
      )}
    </main>
  );
};
