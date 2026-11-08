import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Layers,
  LoaderCircle,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCopyFeedback, useEscapeKey } from "../../hooks/useDomInteractions";
import { SessionInfo, sessionApi } from "../../lib/sessionManager";
import { useNotesStore } from "../../store/useNotesStore";

export const SessionModal: React.FC = () => {
  const isOpen = useNotesStore((s) => s.isSessionModalOpen);
  const closeSessionModal = useNotesStore((s) => s.closeSessionModal);
  const currentSessionId = useNotesStore((s) => s.currentSessionId);
  const currentSessionName = useNotesStore((s) => s.currentSessionName);
  const setSessionName = useNotesStore((s) => s.setSessionName);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(currentSessionName);
  const [copiedLink, copyToClipboard] = useCopyFeedback();
  const [error, setError] = useState("");

  const loadSessionsList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await sessionApi.listSessions();
      setSessions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDraftName(currentSessionName);
      void loadSessionsList();
    }
  }, [isOpen, currentSessionName, loadSessionsList]);

  useEscapeKey(isOpen, closeSessionModal);

  if (!isOpen) return null;

  const handleCommitRename = async () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== currentSessionName) {
      setSessionName(trimmed);
      try {
        await sessionApi.renameSession(currentSessionId, trimmed);
        await loadSessionsList();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename.");
      }
    }
    setIsRenaming(false);
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", currentSessionId);
    copyToClipboard(url.toString());
  };

  const handleCreateNewSession = async () => {
    try {
      const newSession = await sessionApi.createSession();
      sessionApi.switchSessionInCurrentTab(newSession.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create session.",
      );
    }
  };

  const handleDuplicateToNewTab = async () => {
    try {
      const newSession = await sessionApi.createSession(
        `${currentSessionName} (Copy)`,
        currentSessionId,
      );
      sessionApi.openSessionInNewTab(newSession.id);
      await loadSessionsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone session.");
    }
  };

  const handleDeleteSession = async (id: string, name: string) => {
    if (sessions.length <= 1) {
      setError("Cannot delete the only remaining session.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }
    try {
      await sessionApi.deleteSession(id);
      if (id === currentSessionId) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          sessionApi.switchSessionInCurrentTab(remaining[0].id);
          return;
        }
      }
      await loadSessionsList();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete session.",
      );
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSessionModal();
      }}
    >
      <div
        className="modal session-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tab session management"
      >
        <div className="modal-heading">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={20} className="primary-accent-icon" />
            <h2>Session Management</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close dialog"
            onClick={closeSessionModal}
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-description" style={{ marginBottom: 14 }}>
          Workspaces are stored in clean JSON files on disk (
          <code>data/sessions/*.json</code>). New tabs start in your Default
          session. You can switch to any existing session or create new ones
          whenever you need.
        </p>

        {/* Current Tab Active Session Card */}
        <div className="current-session-card">
          <div className="current-session-header">
            <span className="current-session-tag">
              <Radio size={11} className="session-pulse-dot" /> ACTIVE IN THIS
              TAB
            </span>
            <button
              type="button"
              className="copy-link-btn"
              onClick={handleCopyLink}
              title="Copy link to this session"
            >
              {copiedLink ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedLink ? "Copied URL!" : "Share URL"}</span>
            </button>
          </div>

          <div className="current-session-name-row">
            {isRenaming ? (
              <div style={{ display: "flex", gap: 6, flex: 1 }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ height: 32, fontSize: 14 }}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  autoFocus
                  onBlur={() => void handleCommitRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCommitRename();
                    if (e.key === "Escape") setIsRenaming(false);
                  }}
                />
                <button
                  type="button"
                  className="primary-subtle-btn"
                  style={{ height: 32, padding: "0 10px" }}
                  onClick={() => void handleCommitRename()}
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <>
                <h3 className="current-session-title">{currentSessionName}</h3>
                <button
                  type="button"
                  className="icon-action-btn"
                  title="Rename current session"
                  onClick={() => setIsRenaming(true)}
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
          <span className="current-session-id">ID: {currentSessionId}</span>

          <div className="current-session-actions">
            <button
              type="button"
              className="primary-subtle-btn"
              onClick={() => void handleCreateNewSession()}
              title="Create a new session in this tab"
            >
              <Plus size={14} />
              <span>Create New Session</span>
            </button>
            <button
              type="button"
              className="subtle-btn"
              onClick={() => sessionApi.openSessionInNewTab()}
              title="Open a fresh new session in a new browser tab"
            >
              <ExternalLink size={14} />
              <span>New in New Tab</span>
            </button>
            <button
              type="button"
              className="subtle-btn"
              onClick={() => void handleDuplicateToNewTab()}
              title="Duplicate this session into a new tab"
            >
              <Sparkles size={14} />
              <span>Duplicate</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="form-error" role="alert" style={{ margin: "12px 0" }}>
            {error}
          </div>
        )}

        {/* Saved Sessions List */}
        <div className="sessions-list-section">
          <div className="sessions-list-header">
            <span className="sessions-list-title">
              SAVED SESSIONS (<code>data/sessions/</code>)
            </span>
            <button
              type="button"
              className="icon-action-btn"
              onClick={() => void loadSessionsList()}
              title="Refresh list"
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? "spin" : ""} />
            </button>
          </div>

          {loading && sessions.length === 0 ? (
            <div className="sessions-loading">
              <LoaderCircle size={18} className="spin" />
              <span>Loading saved sessions...</span>
            </div>
          ) : (
            <div className="sessions-scroll-list">
              {sessions.map((sess) => {
                const isCurrent = sess.id === currentSessionId;
                const formattedDate = sess.updatedAt
                  ? new Date(sess.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                    })
                  : "Recent";

                return (
                  <div
                    key={sess.id}
                    className={`session-card-row ${isCurrent ? "is-active" : ""}`}
                  >
                    <div className="session-card-info">
                      <div className="session-card-top">
                        <span className="session-card-name">{sess.name}</span>
                        {isCurrent && (
                          <span className="session-card-badge">Current</span>
                        )}
                      </div>
                      <div className="session-card-meta">
                        <span>Updated: {formattedDate}</span>
                        <span>•</span>
                        <span>{sess.folderCount ?? 0} folders</span>
                        <span>•</span>
                        <span>{sess.noteCount ?? 0} notes</span>
                      </div>
                    </div>

                    <div className="session-card-actions">
                      {!isCurrent ? (
                        <button
                          type="button"
                          className="subtle-btn is-compact"
                          onClick={() =>
                            sessionApi.switchSessionInCurrentTab(sess.id)
                          }
                          title="Switch to this session in this tab"
                        >
                          <FolderOpen size={13} />
                          <span>Switch</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="icon-action-btn"
                        onClick={() => sessionApi.openSessionInNewTab(sess.id)}
                        title="Open this session in a new browser tab"
                      >
                        <ExternalLink size={14} />
                      </button>

                      {sessions.length > 1 && (
                        <button
                          type="button"
                          className="icon-action-btn is-danger"
                          onClick={() =>
                            void handleDeleteSession(sess.id, sess.name)
                          }
                          title="Delete session"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button
            type="button"
            className="subtle-btn"
            onClick={closeSessionModal}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
