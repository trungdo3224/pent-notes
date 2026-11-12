import React, { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, FolderPlus, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildExplorerTreeFromFiles } from "../../lib/fileUtils";
import { fsApi } from "../../lib/fsApi";
import { useNotesStore } from "../../store/useNotesStore";
import { LinkModalTargetMode } from "../../types";

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
      setFolderPath("");
      setCustomName("");
      setError("");
      setBusy(false);
    }
  }, [isOpen, initialTargetMode, activeFolder]);

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !busy && closeLinkModal()}
    >
      <DialogContent className="max-w-md p-6">
        <input
          ref={setFolderInputElement}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFolderFilesSelected(e)}
        />

        <DialogHeader className="mb-2">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            <DialogTitle>Add Folder</DialogTitle>
          </div>
        </DialogHeader>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="local-folder-path-input"
              className="text-xs font-medium text-foreground"
            >
              Local folder path
            </label>
            <div className="flex gap-2">
              <Input
                id="local-folder-path-input"
                type="text"
                placeholder="C:\Users\you\Desktop\my-vault"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                disabled={busy}
                autoFocus
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleBrowseFolderClick()}
                disabled={busy}
                className="gap-1.5 h-9 shrink-0"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Browse...</span>
              </Button>
            </div>
          </div>

          {targetMode !== "current-tab" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="local-tab-custom-name"
                  className="text-xs font-medium text-foreground"
                >
                  Folder display name
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Optional
                </span>
              </div>
              <Input
                id="local-tab-custom-name"
                type="text"
                placeholder="Leave blank to use the directory name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
            </div>
          )}

          {activeFolder && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
              <span className="text-xs font-medium text-foreground">
                Target placement
              </span>
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-foreground">
                  <input
                    type="radio"
                    name="link-target"
                    className="accent-primary"
                    checked={targetMode === "new-tab"}
                    onChange={() => setTargetMode("new-tab")}
                    disabled={busy}
                  />
                  <span>Open as a new tab</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-foreground">
                  <input
                    type="radio"
                    name="link-target"
                    className="accent-primary"
                    checked={targetMode === "subfolder"}
                    onChange={() => setTargetMode("subfolder")}
                    disabled={busy}
                  />
                  <span>
                    Open as a subfolder inside &ldquo;{activeFolder.name}&rdquo;
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-foreground">
                  <input
                    type="radio"
                    name="link-target"
                    className="accent-primary"
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
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={closeLinkModal}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !folderPath.trim()}
              className="gap-2"
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="h-4 w-4" />
              )}
              <span>{busy ? "Adding Folder..." : "Add Folder"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
