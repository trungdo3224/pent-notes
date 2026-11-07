import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Folder, Search, X } from "lucide-react";
import { useNotesStore } from "../store/useNotesStore";
import { ExplorerNode } from "../types";

const SNIPPET_MAX_LENGTH = 140;
const INITIAL_RESULTS_LIMIT = 20;
const FILTERED_RESULTS_LIMIT = 30;
const INPUT_FOCUS_DELAY_MS = 50;

interface SearchResultItem {
  folderId: string;
  folderName: string;
  noteId: string;
  title: string;
  snippet: string;
  path: string[];
}

function collectNotes(
  nodes: ExplorerNode[],
  folderId: string,
  folderName: string,
  currentPath: string[],
  activeNoteContents: Record<string, string>,
): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  for (const node of nodes) {
    if (node.type === "note") {
      const displayTitle = node.title.trim() || "Untitled";
      const content = activeNoteContents[node.id] ?? node.content ?? "";
      results.push({
        folderId,
        folderName,
        noteId: node.id,
        title: displayTitle,
        snippet: content.slice(0, SNIPPET_MAX_LENGTH).replace(/\s+/g, " "),
        path: [...currentPath, displayTitle],
      });
    } else if (node.type === "folder") {
      results.push(
        ...collectNotes(
          node.children,
          folderId,
          folderName,
          [...currentPath, node.name],
          activeNoteContents,
        ),
      );
    }
  }
  return results;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery,
}) => {
  const folders = useNotesStore((s) => s.folders);
  const activeNoteContents = useNotesStore((s) => s.activeNoteContents);
  const selectFolder = useNotesStore((s) => s.selectFolder);
  const selectNote = useNotesStore((s) => s.selectNote);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flatten all notes across all top-level folders
  const allNotes = useMemo(() => {
    const list: SearchResultItem[] = [];
    for (const f of folders) {
      list.push(
        ...collectNotes(f.items, f.id, f.name, [f.name], activeNoteContents),
      );
    }
    return list;
  }, [folders, activeNoteContents]);

  // Filter notes based on query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allNotes.slice(0, INITIAL_RESULTS_LIMIT);
    return allNotes
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.folderName.toLowerCase().includes(q) ||
          item.snippet.toLowerCase().includes(q),
      )
      .slice(0, FILTERED_RESULTS_LIMIT);
  }, [allNotes, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || "");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        if (initialQuery) {
          inputRef.current?.select();
        }
      }, INPUT_FOCUS_DELAY_MS);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: SearchResultItem) => {
    selectFolder(item.folderId);
    selectNote(item.noteId);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length ? (prev + 1) % filtered.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div
        className="search-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="search-input-wrapper">
          <Search size={18} strokeWidth={2} className="search-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search notes, checklists, methodologies... (↑ ↓ to navigate, ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="search-kbd">ESC</kbd>
          )}
        </div>

        <div className="search-results-list">
          {filtered.length === 0 ? (
            <div className="search-empty">
              <p>No notes matching &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.folderId}-${item.noteId}`}
                  role="button"
                  tabIndex={0}
                  className={`search-result-row ${isSelected ? "is-active" : ""}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <FileText
                    size={16}
                    strokeWidth={1.8}
                    className="search-result-icon"
                  />
                  <div className="search-result-body">
                    <div className="search-result-title-row">
                      <span className="search-result-title">{item.title}</span>
                      <span className="search-result-folder">
                        <Folder size={11} strokeWidth={1.8} />
                        {item.folderName}
                      </span>
                    </div>
                    {item.snippet && (
                      <p className="search-result-snippet">{item.snippet}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="search-palette-footer">
          <div className="search-palette-hint">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>↵</kbd> open note
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
          <span className="search-palette-count">
            {filtered.length} {filtered.length === 1 ? "note" : "notes"} found
          </span>
        </div>
      </div>
    </div>
  );
};
