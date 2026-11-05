import React, { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, FolderPlus, LoaderCircle, X } from "lucide-react";
import { useEscapeKey } from "../hooks/useDomInteractions";
import { buildExplorerTreeFromFiles } from "../lib/fileUtils";
import { fsApi } from "../lib/fsApi";
import { useNotesStore } from "../store/useNotesStore";
import { LinkModalTargetMode } from "../types";

export const LinkFolderModal: React.FC = () => {
  const isOpen = useNotesStore((s) => s.isLinkModalOpen);
  const initialTargetMode = useNotesStore((s) => s.linkModalTargetMode);
  const closeLinkModal = useNotesStore((s) => s.closeLinkModal);
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const openLocalFolderAsTab = useNotesStore((s) => s.openLocalFolderAsTab);
  const linkFolderToDisk = useNotesStore((s) => s.linkFolderToDisk);
  const importFolder = useNotesStore((s) => s.importFolder);

  const activeFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  const [folderPath, setFolderPath] = useState<string>("");
  const [targetMode, setTargetMode] = useState<LinkModalTargetMode>("new-tab");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const setFolderInputElement = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
      el.setAttribute("mozdirectory", "");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTargetMode(activeFolder ? initialTargetMode : "new-tab");
    } else {
      setError("");
      setBusy(false);
    }
  }, [isOpen, initialTargetMode, activeFolder]);

  useEscapeKey(isOpen && !busy, closeLinkModal);

  if (!isOpen) return null;

  const handleBrowseFolderClick = async () => {
    if (
      typeof window !== "undefined" &&
      window.electronAPI?.dialog?.selectFolder
    ) {
      try {
        const selected = await window.electronAPI.dialog.selectFolder();
        if (selected) {
          setFolderPath(selected);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to open folder picker.",
        );
      }
      return;
    }
    folderInputRef.current?.click();
  };

  const handleFolderFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (selectedFiles.length === 0) return;

    setBusy(true);
    setError("");
    try {
      const { rootName, items } = await buildExplorerTreeFromFiles(
        selectedFiles,
        customName,
      );
      const placement: LinkModalTargetMode = activeFolder
        ? targetMode
        : "new-tab";
      importFolder(rootName, items, placement);
      closeLinkModal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to read selected folder.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = folderPath.replace(/^["']+|["']+$/g, "").trim();
    if (!cleaned) {
      setError("Please provide a folder path or use Browse.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (targetMode === "current-tab" && activeFolder) {
        const ok = await linkFolderToDisk(activeFolder.id, cleaned);
        if (!ok) {
          throw new Error("Failed to link and sync local folder.");
        }
      } else if (targetMode === "subfolder" && activeFolder) {
        const result = await fsApi.scanFolder(cleaned);
        const folderName = customName.trim() || result.rootName || "New Folder";
        importFolder(folderName, result.items, "subfolder", result.rootPath);
      } else {
        await openLocalFolderAsTab(cleaned, customName);
      }
      closeLinkModal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add local folder.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) closeLinkModal();
      }}
    >
      <div
        className="modal add-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add folder"
      >
        <input
          ref={setFolderInputElement}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFolderFilesSelected(e)}
        />

        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FolderPlus size={20} className="primary-accent-icon" />
            <h2>Add Folder</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close dialog"
            onClick={closeLinkModal}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="add-folder-form"
        >
          <label className="field-label" htmlFor="local-folder-path-input">
            Local folder path
          </label>
          <div className="folder-path-input-row">
            <input
              id="local-folder-path-input"
              type="text"
              className="form-input"
              placeholder="C:\Users\you\Desktop\my-vault"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              className="subtle-btn browse-folder-btn"
              onClick={() => void handleBrowseFolderClick()}
              disabled={busy}
              title="Browse and select a folder from your computer"
            >
              <FolderOpen size={15} />
              <span>Browse...</span>
            </button>
          </div>

          {targetMode !== "current-tab" && (
            <>
              <label className="field-label" htmlFor="local-tab-custom-name">
                Folder display name<span>Optional</span>
              </label>
              <input
                id="local-tab-custom-name"
                type="text"
                className="form-input"
                placeholder="Leave blank to use the directory name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
            </>
          )}

          {activeFolder && (
            <div className="import-destination-choice">
              <span className="field-label" style={{ marginBottom: 6 }}>
                Target placement
              </span>
              <div className="destination-radios">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="link-target"
                    checked={targetMode === "new-tab"}
                    onChange={() => setTargetMode("new-tab")}
                    disabled={busy}
                  />
                  <span>Open as a new tab</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="link-target"
                    checked={targetMode === "subfolder"}
                    onChange={() => setTargetMode("subfolder")}
                    disabled={busy}
                  />
                  <span>
                    Open as a subfolder inside &ldquo;{activeFolder.name}&rdquo;
                  </span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="link-target"
                    checked={targetMode === "current-tab"}
                    onChange={() => setTargetMode("current-tab")}
                    disabled={busy}
                  />
                  <span>
                    Link to active tab &ldquo;{activeFolder.name}&rdquo;
                  </span>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="subtle-btn"
              onClick={closeLinkModal}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-subtle-btn"
              disabled={busy || !folderPath.trim()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <FolderPlus size={15} />
              )}
              <span>{busy ? "Adding Folder..." : "Add Folder"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
