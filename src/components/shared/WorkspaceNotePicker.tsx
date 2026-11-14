import React, { useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { useClickOutside, useEscapeKey } from "../../hooks/useDomInteractions";
import { WorkspaceNoteOption } from "../../lib/catalogUtils";

interface WorkspaceNotePickerProps {
  wrapperClassName?: string;
  popoverClassName?: string;
  headerTitle: string;
  searchPlaceholder: string;
  emptyText: string;
  buttonClassName: string | ((isOpen: boolean) => string);
  buttonTitle: string;
  buttonAriaLabel: string;
  buttonContent: React.ReactNode;
  options: WorkspaceNoteOption[];
  isOptionActive: (option: WorkspaceNoteOption) => boolean;
  onSelectOption: (option: WorkspaceNoteOption) => void;
  closeOnSelect?: boolean;
  showUnlinkedPlus?: boolean;
  showSearchIcon?: boolean;
  stopTriggerPropagation?: boolean;
  stopPopoverClickPropagation?: boolean;
  renderTopActions?: (close: () => void) => React.ReactNode;
}

/**
 * Reusable searchable popover for picking or linking notes across all workspace folders.
 */
export const WorkspaceNotePicker: React.FC<WorkspaceNotePickerProps> = ({
  wrapperClassName = "editor-link-control",
  popoverClassName = "editor-link-popover",
  headerTitle,
  searchPlaceholder,
  emptyText,
  buttonClassName,
  buttonTitle,
  buttonAriaLabel,
  buttonContent,
  options,
  isOptionActive,
  onSelectOption,
  closeOnSelect = false,
  showUnlinkedPlus = true,
  showSearchIcon = false,
  stopTriggerPropagation = false,
  stopPopoverClickPropagation = false,
  renderTopActions,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIsOpen(false);
    setFilterQuery("");
  };

  useClickOutside(containerRef, isOpen, close);
  useEscapeKey(isOpen, close);

  const filteredOptions = useMemo(() => {
    if (!filterQuery.trim()) return options;
    const q = filterQuery.trim().toLowerCase();
    return options.filter((opt) => {
      const title = (opt.note.title || "Untitled").toLowerCase();
      const folderPath = [opt.topFolderName, ...opt.subfolderNames]
        .join("/")
        .toLowerCase();
      return title.includes(q) || folderPath.includes(q);
    });
  }, [options, filterQuery]);

  return (
    <div className={wrapperClassName} ref={containerRef}>
      <button
        type="button"
        className={
          typeof buttonClassName === "function"
            ? buttonClassName(isOpen)
            : buttonClassName
        }
        onClick={(e) => {
          if (stopTriggerPropagation) e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={buttonTitle}
        aria-label={buttonAriaLabel}
        aria-expanded={isOpen}
      >
        {buttonContent}
      </button>

      {isOpen && (
        <div
          className={popoverClassName}
          onClick={
            stopPopoverClickPropagation ? (e) => e.stopPropagation() : undefined
          }
        >
          {renderTopActions?.(close)}

          <div className="editor-link-popover-header">
            <span>{headerTitle}</span>
          </div>

          <div className="editor-link-search">
            {showSearchIcon && (
              <Search size={12} className="editor-link-search-icon" />
            )}
            <input
              type="text"
              className="editor-link-search-input"
              placeholder={searchPlaceholder}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="editor-link-list">
            {filteredOptions.length === 0 ? (
              <div className="editor-link-empty">{emptyText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const active = isOptionActive(opt);
                const pathLabel = [opt.topFolderName, ...opt.subfolderNames]
                  .filter(Boolean)
                  .join(" / ");
                return (
                  <button
                    key={opt.note.id}
                    type="button"
                    className={`editor-link-option ${active ? "is-linked" : ""}`}
                    onClick={() => {
                      onSelectOption(opt);
                      if (closeOnSelect) close();
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
                    {showUnlinkedPlus ? (
                      <span className="editor-link-option-check">
                        {active ? (
                          <Check size={13} strokeWidth={2.3} />
                        ) : (
                          <Plus size={13} />
                        )}
                      </span>
                    ) : (
                      active && <Check size={13} strokeWidth={2.3} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
