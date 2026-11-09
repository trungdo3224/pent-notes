import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  HardDrive,
  Hash,
  Info,
  ListTree,
  PanelRightClose,
  Search,
  Tag,
} from "lucide-react";
import { useCopyFeedback } from "../../hooks/useDomInteractions";
import {
  buildHeadingTree,
  calculateNoteStats,
  extractAllWorkspaceTags,
  extractHeadings,
  extractTags,
  HeadingNode,
  scrollToHeading,
} from "../../lib/catalogUtils";
import { findLeaf } from "../../lib/paneLayoutTree";
import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  findNoteAndPath,
  resolveActiveNoteData,
  useNotesStore,
} from "../../store/useNotesStore";

interface NoteCatalogSidebarProps {
  onOpenSearchWithQuery?: (query: string) => void;
}

export const NoteCatalogSidebar: React.FC<NoteCatalogSidebarProps> = ({
  onOpenSearchWithQuery,
}) => {
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const selectedNoteByFolder = useNotesStore((s) => s.selectedNoteByFolder);
  const sortOrder = useNotesStore((s) => s.sortOrder ?? "name-asc");
  const isCollapsed = useNotesStore((s) => s.isRightSidebarCollapsed);
  const width = useNotesStore(
    (s) => s.rightSidebarWidth ?? DEFAULT_RIGHT_SIDEBAR_WIDTH,
  );
  const activeTab = useNotesStore((s) => s.rightSidebarTab ?? "outline");
  const isSplitViewActive = useNotesStore((s) => s.isSplitViewActive);
  const paneLayout = useNotesStore((s) => s.paneLayout);
  const activePaneId = useNotesStore((s) => s.activePaneId);

  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);
  const setRightSidebarTab = useNotesStore((s) => s.setRightSidebarTab);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);
  const loadNoteContent = useNotesStore((s) => s.loadNoteContent);

  const [headingFilter, setHeadingFilter] = useState("");
  const [copiedPath, copyPath] = useCopyFeedback();

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const activeNoteData = useMemo(() => {
    if (isSplitViewActive && paneLayout && activePaneId) {
      const activeLeaf = findLeaf(paneLayout, activePaneId);
      if (activeLeaf && activeLeaf.noteId) {
        if (activeLeaf.folderId) {
          const secFolder = folders.find((f) => f.id === activeLeaf.folderId);
          if (secFolder) {
            const found = findNoteAndPath(secFolder.items, activeLeaf.noteId, [
              secFolder.name,
            ]);
            if (found) return found;
          }
        }
        for (const f of folders) {
          const found = findNoteAndPath(f.items, activeLeaf.noteId, [f.name]);
          if (found) return found;
        }
      }
    }
    return resolveActiveNoteData(activeFolder, selectedNoteByFolder, sortOrder);
  }, [
    paneLayout,
    activePaneId,
    isSplitViewActive,
    folders,
    activeFolder,
    selectedNoteByFolder,
    sortOrder,
  ]);

  const note = activeNoteData?.note ?? null;

  useEffect(() => {
    if (
      note?.id &&
      note?.filePath &&
      note.fileType !== "pdf" &&
      note.fileType !== "image" &&
      activeNoteContents[note.id] === undefined
    ) {
      void loadNoteContent(note.id, note.filePath);
    }
  }, [note, activeNoteContents, loadNoteContent]);

  const noteContent = note?.filePath
    ? (activeNoteContents[note.id] ?? "")
    : (note?.content ?? "");

  const headings = useMemo(() => {
    if (!noteContent) return [];
    return extractHeadings(noteContent);
  }, [noteContent]);

  const [collapsedHeadingIds, setCollapsedHeadingIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  useEffect(() => {
    setCollapsedHeadingIds(new Set());
    setActiveHeadingId(null);
  }, [note?.id]);

  const { headingTree, collapsibleSubheaderIds } = useMemo(() => {
    const tree = buildHeadingTree(headings);
    const collapsibleIds: string[] = [];

    function collectSubheadingsWithChildren(nodes: HeadingNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          collapsibleIds.push(node.id);
          collectSubheadingsWithChildren(node.children);
        }
      }
    }

    if (tree.length === 1 && tree[0].children.length > 0) {
      const secondLevelHasChildren = tree[0].children.some(
        (c) => c.children.length > 0,
      );
      if (secondLevelHasChildren) {
        // Document title (#) and primary sections (##) remain open;
        // any subheaders under the primary sections collapse into them.
        collectSubheadingsWithChildren(tree[0].children);
      } else {
        // Document title (#) is the parent header; its subheaders collapse into it.
        collapsibleIds.push(tree[0].id);
      }
    } else {
      // Multiple top-level headings: top-level parent headers remain open;
      // any heading with children collapses its subheaders into it.
      collectSubheadingsWithChildren(tree);
    }

    return { headingTree: tree, collapsibleSubheaderIds: collapsibleIds };
  }, [headings]);

  const hasCollapsibleSubheaders = collapsibleSubheaderIds.length > 0;
  const isAllSubheadersCollapsed =
    hasCollapsibleSubheaders &&
    collapsibleSubheaderIds.every((id) => collapsedHeadingIds.has(id));

  const toggleHeadingCollapse = (headingId: string) => {
    setCollapsedHeadingIds((prev) => {
      const next = new Set(prev);
      if (next.has(headingId)) {
        next.delete(headingId);
      } else {
        next.add(headingId);
      }
      return next;
    });
  };

  const toggleCollapseAllSubheaders = () => {
    if (!hasCollapsibleSubheaders) return;
    if (isAllSubheadersCollapsed) {
      setCollapsedHeadingIds(new Set());
    } else {
      setCollapsedHeadingIds(new Set(collapsibleSubheaderIds));
    }
  };

  const filteredHeadingTree = useMemo(() => {
    if (!headingFilter.trim()) return headingTree;
    const q = headingFilter.toLowerCase();

    function filterNodes(nodes: HeadingNode[]): HeadingNode[] {
      const res: HeadingNode[] = [];
      for (const node of nodes) {
        const matchesSelf = node.text.toLowerCase().includes(q);
        const matchedChildren = filterNodes(node.children);
        if (matchesSelf || matchedChildren.length > 0) {
          res.push({
            ...node,
            children: matchedChildren,
          });
        }
      }
      return res;
    }

    return filterNodes(headingTree);
  }, [headingTree, headingFilter]);

  const noteTags = useMemo(() => {
    if (!noteContent) return [];
    return extractTags(noteContent);
  }, [noteContent]);

  const allWorkspaceTags = useMemo(() => {
    return extractAllWorkspaceTags(folders, activeNoteContents);
  }, [folders, activeNoteContents]);

  const stats = useMemo(() => {
    if (!noteContent) return null;
    return calculateNoteStats(noteContent);
  }, [noteContent]);

  const handleHeadingClick = (
    node: HeadingNode,
    el: HTMLElement | null,
  ): void => {
    setActiveHeadingId(node.id);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    scrollToHeading(node.text, node.level, node.line);
  };

  const renderHeadingNodes = (nodes: HeadingNode[]): React.ReactNode => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isCollapsed = headingFilter.trim()
        ? false
        : collapsedHeadingIds.has(node.id);
      const isActive = activeHeadingId === node.id;
      const indentLevel = Math.max(0, node.level - 1);

      return (
        <React.Fragment key={node.id}>
          <div
            role="button"
            tabIndex={0}
            className={`outline-item outline-level-${node.level} ${isCollapsed ? "is-collapsed" : ""} ${isActive ? "is-active" : ""}`}
            style={{ paddingLeft: `${6 + indentLevel * 12}px` }}
            onClick={(e) => handleHeadingClick(node, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleHeadingClick(node, e.currentTarget);
              }
            }}
            title={`Jump to line ${node.line}: ${node.text}`}
          >
            {hasChildren ? (
              <button
                type="button"
                className="outline-chevron-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHeadingCollapse(node.id);
                }}
                title={
                  isCollapsed ? "Expand subheaders" : "Collapse subheaders"
                }
                aria-label={
                  isCollapsed ? "Expand subheaders" : "Collapse subheaders"
                }
              >
                {isCollapsed ? (
                  <ChevronRight size={13} strokeWidth={2} />
                ) : (
                  <ChevronDown size={13} strokeWidth={2} />
                )}
              </button>
            ) : (
              <span className="outline-chevron-spacer" />
            )}

            <span className={`outline-level-dot dot-level-${node.level}`} />
            <span className="outline-item-title">{node.text}</span>
          </div>

          {!isCollapsed && hasChildren && renderHeadingNodes(node.children)}
        </React.Fragment>
      );
    });
  };

  if (isCollapsed) return null;

  return (
    <aside
      className="catalog-sidebar"
      style={{ width: `${width}px` }}
      aria-label="Note catalog and outline"
    >
      {/* Header */}
      <div className="catalog-header">
        <button
          type="button"
          className="catalog-close-btn"
          onClick={toggleRightSidebar}
          title="Collapse catalog sidebar (Ctrl+])"
          aria-label="Collapse catalog"
        >
          <PanelRightClose size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Tabs Row */}
      <div className="catalog-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "outline"}
          className={`catalog-tab-btn ${activeTab === "outline" ? "is-active" : ""}`}
          onClick={() => setRightSidebarTab("outline")}
          title="Headings Outline (Table of Contents)"
        >
          <ListTree size={13} strokeWidth={1.8} />
          <span>Outline</span>
          {headings.length > 0 && (
            <span className="catalog-tab-badge">{headings.length}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tags"}
          className={`catalog-tab-btn ${activeTab === "tags" ? "is-active" : ""}`}
          onClick={() => setRightSidebarTab("tags")}
          title="Tags & Categories"
        >
          <Tag size={13} strokeWidth={1.8} />
          <span>Tags</span>
          {noteTags.length > 0 && (
            <span className="catalog-tab-badge">{noteTags.length}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "info"}
          className={`catalog-tab-btn ${activeTab === "info" ? "is-active" : ""}`}
          onClick={() => setRightSidebarTab("info")}
          title="Note Properties & Metadata"
        >
          <Info size={13} strokeWidth={1.8} />
          <span>Info</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="catalog-content">
        {!note ? (
          <div className="catalog-empty-state">
            <BookOpen
              size={24}
              strokeWidth={1.4}
              className="catalog-empty-icon"
            />
            <p className="catalog-empty-title">
              Select a note to inspect its outline and catalog.
            </p>
          </div>
        ) : (
          <>
            {/* Outline / Table of Contents Tab */}
            {activeTab === "outline" && (
              <div className="catalog-outline-view">
                {headings.length > 0 && (
                  <div className="catalog-outline-toolbar">
                    <div className="catalog-search-wrapper">
                      <Search size={12} className="catalog-search-icon" />
                      <input
                        type="text"
                        className="catalog-search-input"
                        placeholder="Filter headings..."
                        value={headingFilter}
                        onChange={(e) => setHeadingFilter(e.target.value)}
                      />
                      {headingFilter && (
                        <button
                          type="button"
                          className="catalog-search-clear"
                          onClick={() => setHeadingFilter("")}
                          title="Clear filter"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="catalog-toolbar-btn"
                      title={
                        !hasCollapsibleSubheaders
                          ? "No subheaders to collapse"
                          : isAllSubheadersCollapsed
                            ? "Expand all subheaders"
                            : "Collapse all subheaders"
                      }
                      aria-label={
                        isAllSubheadersCollapsed
                          ? "Expand all subheaders"
                          : "Collapse all subheaders"
                      }
                      disabled={!hasCollapsibleSubheaders}
                      onClick={toggleCollapseAllSubheaders}
                    >
                      {isAllSubheadersCollapsed ? (
                        <ChevronsUpDown size={14} strokeWidth={1.8} />
                      ) : (
                        <ChevronsDownUp size={14} strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                )}

                {headings.length === 0 ? (
                  <div className="catalog-empty-state">
                    <p className="catalog-empty-title">
                      No headings in this note.
                    </p>
                    <span className="catalog-empty-subtitle">
                      Use <code># Heading 1</code> or <code>## Heading 2</code>{" "}
                      to create sections.
                    </span>
                  </div>
                ) : filteredHeadingTree.length === 0 ? (
                  <div className="catalog-empty-state">
                    <p className="catalog-empty-title">
                      No headings match &ldquo;{headingFilter}&rdquo;
                    </p>
                  </div>
                ) : (
                  <nav className="outline-list" aria-label="Table of Contents">
                    {renderHeadingNodes(filteredHeadingTree)}
                  </nav>
                )}
              </div>
            )}

            {/* Tags Tab */}
            {activeTab === "tags" && (
              <div className="catalog-tags-view">
                <div className="catalog-section">
                  <div className="catalog-section-label">TAGS IN THIS NOTE</div>
                  {noteTags.length === 0 ? (
                    <div className="catalog-subtle-hint">
                      No tags detected. Add tags in text like{" "}
                      <code>#recon</code>, <code>#nmap</code>, or frontmatter{" "}
                      <code>tags: [sqli]</code>.
                    </div>
                  ) : (
                    <div className="catalog-tags-cloud">
                      {noteTags.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          className="catalog-tag-pill"
                          onClick={() => onOpenSearchWithQuery?.(`#${t.tag}`)}
                          title={`Search notes with #${t.tag}`}
                        >
                          <Hash size={11} className="tag-hash-icon" />
                          <span>{t.tag}</span>
                          <span className="catalog-tag-count">{t.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="catalog-section" style={{ marginTop: 20 }}>
                  <div className="catalog-section-label">
                    WORKSPACE TAG CLOUD
                  </div>
                  {allWorkspaceTags.length === 0 ? (
                    <div className="catalog-subtle-hint">
                      No tags found across workspace.
                    </div>
                  ) : (
                    <div className="catalog-tags-cloud">
                      {allWorkspaceTags.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          className="catalog-tag-pill is-secondary"
                          onClick={() => onOpenSearchWithQuery?.(`#${t.tag}`)}
                          title={`Search notes with #${t.tag} (${t.count} occurrences)`}
                        >
                          <Hash size={11} className="tag-hash-icon" />
                          <span>{t.tag}</span>
                          <span className="catalog-tag-count">{t.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info & Properties Tab */}
            {activeTab === "info" && stats && (
              <div className="catalog-info-view">
                {/* Statistics Grid */}
                <div className="catalog-section">
                  <div className="catalog-section-label">NOTE STATISTICS</div>
                  <div className="catalog-stats-grid">
                    <div className="catalog-stat-card">
                      <FileText size={14} className="stat-icon" />
                      <span className="catalog-stat-value">
                        {stats.words.toLocaleString()}
                      </span>
                      <span className="catalog-stat-label">Words</span>
                    </div>
                    <div className="catalog-stat-card">
                      <FileCode size={14} className="stat-icon" />
                      <span className="catalog-stat-value">
                        {stats.chars.toLocaleString()}
                      </span>
                      <span className="catalog-stat-label">Characters</span>
                    </div>
                    <div className="catalog-stat-card">
                      <ListTree size={14} className="stat-icon" />
                      <span className="catalog-stat-value">
                        {headings.length}
                      </span>
                      <span className="catalog-stat-label">Headings</span>
                    </div>
                  </div>
                </div>

                {/* Storage & File Details */}
                <div className="catalog-section" style={{ marginTop: 18 }}>
                  <div className="catalog-section-label">STORAGE DETAILS</div>
                  {note.filePath ? (
                    <div className="catalog-disk-card">
                      <div className="catalog-disk-header">
                        <HardDrive size={13} className="primary-accent-icon" />
                        <span className="catalog-disk-status">
                          Live disk file
                        </span>
                      </div>
                      <code className="catalog-path-code" title={note.filePath}>
                        {note.filePath}
                      </code>
                      <button
                        type="button"
                        className="subtle-btn is-compact"
                        style={{ marginTop: 8 }}
                        onClick={() => copyPath(note.filePath!)}
                      >
                        <Copy size={12} />
                        <span>
                          {copiedPath ? "Copied path!" : "Copy absolute path"}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="catalog-disk-card">
                      <div className="catalog-disk-header">
                        <span className="catalog-disk-status">
                          Stored in session workspace
                        </span>
                      </div>
                      <span className="catalog-subtle-hint">
                        Not linked to a standalone disk file. Use &ldquo;Open
                        local folder&rdquo; to sync with local directories.
                      </span>
                    </div>
                  )}
                </div>

                {/* Linked References / Wikilinks */}
                {stats.wikiLinks.length > 0 && (
                  <div className="catalog-section" style={{ marginTop: 18 }}>
                    <div className="catalog-section-label">
                      OUTGOING WIKILINKS ({stats.wikiLinks.length})
                    </div>
                    <div className="catalog-links-list">
                      {stats.wikiLinks.map((target) => (
                        <button
                          key={target}
                          type="button"
                          className="catalog-link-pill"
                          onClick={() => onOpenSearchWithQuery?.(target)}
                          title={`Search for note "${target}"`}
                        >
                          <ExternalLink size={12} />
                          <span>{target}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
