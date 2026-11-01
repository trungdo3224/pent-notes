import React, { useEffect, useState } from 'react';
import { Check, FolderSync, HardDrive, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useDomInteractions';
import { useNotesStore } from '../store/useNotesStore';

const SAMPLE_LOCAL_PATHS = [
  'C:\\Users\\Skdu\\Desktop\\Techie\\pentest-book',
  'C:\\Users\\Skdu\\Desktop\\Techie\\Web-pentest\\Web-pentest-vault',
] as const;

export const LinkFolderModal: React.FC = () => {
  const isOpen = useNotesStore((s) => s.isLinkModalOpen);
  const closeLinkModal = useNotesStore((s) => s.closeLinkModal);
  const folders = useNotesStore((s) => s.folders);
  const selectedFolderId = useNotesStore((s) => s.selectedFolderId);
  const openLocalFolderAsTab = useNotesStore((s) => s.openLocalFolderAsTab);
  const linkFolderToDisk = useNotesStore((s) => s.linkFolderToDisk);

  const activeFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  const [folderPath, setFolderPath] = useState<string>(SAMPLE_LOCAL_PATHS[0]);
  const [targetMode, setTargetMode] = useState<'new-tab' | 'current-tab'>('new-tab');
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setBusy(false);
    }
  }, [isOpen]);

  useEscapeKey(isOpen && !busy, closeLinkModal);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = folderPath.replace(/^["']+|["']+$/g, '').trim();
    if (!cleaned) {
      setError('Please provide a folder path.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (targetMode === 'current-tab' && activeFolder) {
        const ok = await linkFolderToDisk(activeFolder.id, cleaned);
        if (!ok) {
          throw new Error('Failed to link and sync local folder.');
        }
      } else {
        await openLocalFolderAsTab(cleaned, customName);
      }
      closeLinkModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open local folder.');
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
        aria-label="Open or link local folder"
      >
        <div className="modal-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderSync size={20} className="primary-accent-icon" />
            <h2>Direct Local Folder Sync</h2>
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

        <div className="modal-illustration">
          <HardDrive size={30} strokeWidth={1.4} />
          <span>REAL-TIME TWO-WAY DISK SYNC</span>
        </div>

        <p className="modal-description">
          Open a local folder directly from your disk. All notes (<code>.md</code>) and subfolders
          load instantly. Notes you write or edit are saved straight to disk files in real time.
        </p>

        {/* Quick presets */}
        <div className="link-presets-container">
          <span className="link-presets-title">
            <Sparkles size={12} /> Detected Local Folders:
          </span>
          <div className="link-presets-list">
            {SAMPLE_LOCAL_PATHS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`link-preset-chip ${folderPath === preset ? 'is-active' : ''}`}
                onClick={() => setFolderPath(preset)}
                disabled={busy}
              >
                <span>{preset}</span>
                {folderPath === preset && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="field-label" htmlFor="local-folder-path-input">
            Local folder path<span>Absolute Windows path</span>
          </label>
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
          <p className="field-help">
            You can copy any directory path from File Explorer address bar and paste here.
          </p>

          {targetMode === 'new-tab' && (
            <>
              <label className="field-label" htmlFor="local-tab-custom-name">
                Tab display name<span>Optional</span>
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
                    checked={targetMode === 'new-tab'}
                    onChange={() => setTargetMode('new-tab')}
                    disabled={busy}
                  />
                  <span>Open as a new top-level tab</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="link-target"
                    checked={targetMode === 'current-tab'}
                    onChange={() => setTargetMode('current-tab')}
                    disabled={busy}
                  />
                  <span>Link to active tab &ldquo;{activeFolder.name}&rdquo;</span>
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
              {busy ? <LoaderCircle size={15} className="spin" /> : <FolderSync size={15} />}
              <span>{busy ? 'Scanning & Syncing...' : 'Open & Sync Folder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
