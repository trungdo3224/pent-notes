import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, FolderOpen, FolderUp, HardDrive, LoaderCircle, Plus, X } from 'lucide-react';
import { ExplorerNode, NoteItem } from '../types';

export type ImportTargetMode = 'top-folder' | 'subfolder' | 'note';

interface ImportModalProps {
  initialMode: ImportTargetMode;
  activeFolderName: string | null;
  onClose: () => void;
  onImportedNotes: (notes: NoteItem[]) => void;
  onImportedFolder: (
    rootName: string,
    items: ExplorerNode[],
    asTopLevel: boolean,
    localPath?: string
  ) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  initialMode,
  activeFolderName,
  onClose,
  onImportedNotes,
  onImportedFolder,
}) => {
  const [inputPath, setInputPath] = useState('');
  const [customName, setCustomName] = useState('');
  const [asTopLevel, setAsTopLevel] = useState<boolean>(
    initialMode === 'top-folder' || !activeFolderName
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const setFolderInputElement = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
      el.setAttribute('mozdirectory', '');
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const handleSubmitPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/import-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: inputPath.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not import from the specified path.');
      }

      if (data.kind === 'file' && data.note) {
        const note: NoteItem = {
          ...data.note,
          title: customName.trim() || data.note.title,
        };
        onImportedNotes([note]);
        onClose();
        return;
      }

      if (data.kind === 'folder') {
        const folderName = customName.trim() || data.rootName || 'Imported Folder';
        onImportedFolder(folderName, data.items ?? [], asTopLevel, data.rootPath);
        onClose();
        return;
      }

      throw new Error('Unexpected response when reading path.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from path.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal add-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import notes or folder"
      >
        <div className="modal-heading">
          <h2>Import notes or folder</h2>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-illustration">
          <FolderOpen size={30} strokeWidth={1.4} />
          <span>IMPORT SEPARATE FILES OR AN ENTIRE FOLDER</span>
        </div>

        <p className="modal-description">
          Paste a folder or Markdown file path from File Explorer, or browse directly from your
          computer.
        </p>

        <div className="import-picker-row">
          <input
            ref={noteInputRef}
            type="file"
            accept=".md,.markdown,.mdx,.txt"
            multiple
            hidden
            onChange={async (e) => {
              const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              if (selectedFiles.length === 0) return;

              setBusy(true);
              setError('');
              try {
                const notes: NoteItem[] = [];
                for (const file of selectedFiles) {
                  const content = await file.text();
                  notes.push({
                    id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    type: 'note',
                    title:
                      file.name.replace(/\.(md|markdown|mdx|txt)$/i, '').trim() || 'Untitled',
                    content,
                    updatedAt: file.lastModified
                      ? new Date(file.lastModified).toISOString().slice(0, 10)
                      : new Date().toISOString().slice(0, 10),
                  });
                }
                onImportedNotes(notes);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to read selected files.');
              } finally {
                setBusy(false);
              }
            }}
          />

          <input
            ref={setFolderInputElement}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              if (selectedFiles.length === 0) return;

              setBusy(true);
              setError('');
              try {
                const firstRel = (
                  selectedFiles[0].webkitRelativePath || selectedFiles[0].name
                ).replace(/\\/g, '/');
                const firstParts = firstRel.split('/').filter(Boolean);
                const detectedRoot =
                  firstParts.length > 1 ? firstParts[0] : 'Imported Folder';
                const rootName = customName.trim() || detectedRoot;

                const rootItems: ExplorerNode[] = [];
                const ignoredDirs = new Set([
                  'node_modules',
                  '.git',
                  '.obsidian',
                  '.vscode',
                  '.idea',
                  'dist',
                  'build',
                ]);

                const ensureFolder = (
                  container: ExplorerNode[],
                  segments: string[]
                ): ExplorerNode[] => {
                  let current = container;
                  for (const seg of segments) {
                    let existing = current.find(
                      (n): n is Extract<ExplorerNode, { type: 'folder' }> =>
                        n.type === 'folder' && n.name === seg
                    );
                    if (!existing) {
                      existing = {
                        id: `sub-${Date.now().toString(36)}-${Math.random()
                          .toString(36)
                          .slice(2, 6)}`,
                        type: 'folder',
                        name: seg,
                        children: [],
                      };
                      current.push(existing);
                    }
                    current = existing.children;
                  }
                  return current;
                };

                for (const file of selectedFiles) {
                  const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
                  const parts = rel.split('/').filter(Boolean);
                  const inner = parts.length > 1 ? parts.slice(1) : parts;

                  if (inner.some((seg) => seg.startsWith('.') || ignoredDirs.has(seg))) {
                    continue;
                  }
                  const fileName = inner[inner.length - 1];
                  if (!/\.(md|markdown|mdx|txt)$/i.test(fileName)) {
                    continue;
                  }

                  const content = await file.text();
                  const targetContainer = ensureFolder(rootItems, inner.slice(0, -1));
                  targetContainer.push({
                    id: `note-${Date.now().toString(36)}-${Math.random()
                      .toString(36)
                      .slice(2, 6)}`,
                    type: 'note',
                    title:
                      fileName.replace(/\.(md|markdown|mdx|txt)$/i, '').trim() || 'Untitled',
                    content,
                    updatedAt: file.lastModified
                      ? new Date(file.lastModified).toISOString().slice(0, 10)
                      : new Date().toISOString().slice(0, 10),
                  });
                }

                onImportedFolder(rootName, rootItems, asTopLevel);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to read selected folder.');
              } finally {
                setBusy(false);
              }
            }}
          />

          <button
            type="button"
            className="picker-card-btn"
            disabled={busy}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp size={18} />
            <div>
              <strong>Browse Folder...</strong>
              <span>Select a directory from disk</span>
            </div>
          </button>

          <button
            type="button"
            className="picker-card-btn"
            disabled={busy}
            onClick={() => noteInputRef.current?.click()}
          >
            <FileUp size={18} />
            <div>
              <strong>Browse Note File(s)...</strong>
              <span>Select .md or .txt files</span>
            </div>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmitPath(e)}>
          <label className="field-label" htmlFor="import-path-input">
            Folder or file path<span>From File Explorer</span>
          </label>
          <input
            id="import-path-input"
            type="text"
            className="form-input"
            placeholder="C:\Users\you\Documents\my-notes"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            disabled={busy}
          />
          <p className="field-help">
            In File Explorer, open the folder (or right-click a note file) and copy its address.
          </p>

          <label className="field-label" htmlFor="import-custom-name">
            Custom name<span>Optional</span>
          </label>
          <input
            id="import-custom-name"
            type="text"
            className="form-input"
            placeholder="Leave blank to use the folder or file name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={120}
            disabled={busy}
          />

          {activeFolderName && (
            <div className="import-destination-choice">
              <span className="field-label" style={{ marginBottom: 6 }}>
                Folder import destination
              </span>
              <div className="destination-radios">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="import-dest"
                    checked={asTopLevel}
                    onChange={() => setAsTopLevel(true)}
                  />
                  <span>New top-level navbar tab</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="import-dest"
                    checked={!asTopLevel}
                    onChange={() => setAsTopLevel(false)}
                  />
                  <span>Subfolder inside &ldquo;{activeFolderName}&rdquo;</span>
                </label>
              </div>
            </div>
          )}

          <div className="folder-explanation">
            <HardDrive size={16} />
            <span>
              Markdown (<code>.md</code>, <code>.mdx</code>) and text (<code>.txt</code>) files are
              imported with their nested folder structure intact.
            </span>
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="subtle-btn"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-subtle-btn"
              disabled={busy || !inputPath.trim()}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}
              <span>{busy ? 'Importing...' : 'Import from path'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

