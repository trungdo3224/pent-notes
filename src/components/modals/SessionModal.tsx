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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineRenameInput } from "../shared/InlineRenameInput";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopyFeedback } from "../../hooks/useDomInteractions";
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

  const handleCreateNewInNewTab = async () => {
    try {
      const newSession = await sessionApi.createSession();
      sessionApi.openSessionInNewTab(newSession.id);
      await loadSessionsList();
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSessionModal()}>
      <DialogContent className="max-w-[640px] w-[92vw] gap-0 overflow-hidden p-0 border-[var(--line-strong)] bg-[var(--surface)]">
        <DialogHeader className="border-b border-[var(--line)] bg-[var(--sidebar)] px-5 py-4 pr-14 text-left space-y-0">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--forest)_14%,transparent)] text-[var(--forest)] border border-[color-mix(in_srgb,var(--forest)_28%,transparent)]">
              <Layers className="h-[18px] w-[18px]" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <DialogTitle className="text-[15.5px] font-bold text-[var(--heading)]">
                Session Management
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-[var(--muted)]">
                Workspaces are stored on disk in{" "}
                <code className="rounded border border-[var(--line)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                  data/sessions/*.json
                </code>
                . Switch workspaces or open independent sessions in new windows.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 bg-[var(--paper)] p-5">
          {/* Current Active Session Card */}
          <div
            className="flex flex-col gap-3 rounded-[10px] border border-[color-mix(in_srgb,var(--forest)_35%,transparent)] p-4 shadow-[0_4px_20px_var(--shadow)]"
            style={{
              background:
                "radial-gradient(circle at 100% 0%, var(--glow), transparent 60%), color-mix(in srgb, var(--forest) 6%, var(--surface))",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.04em] text-[var(--forest)]">
                <Radio className="h-3 w-3 animate-pulse" /> ACTIVE IN THIS
                WINDOW
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="h-7 gap-1.5 text-xs"
              >
                {copiedLink ? (
                  <Check className="h-3 w-3 text-[var(--forest)]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copiedLink ? "Copied URL!" : "Share URL"}</span>
              </Button>
            </div>

            <div className="flex flex-col gap-1">
              {isRenaming ? (
                <div className="flex flex-1 items-center gap-2">
                  <InlineRenameInput
                    variant="ui"
                    className="h-8 text-sm bg-[var(--paper)] border-[var(--line-strong)]"
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={() => void handleCommitRename()}
                    onCancel={() => setIsRenaming(false)}
                    stopClickPropagation={false}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2.5"
                    onClick={() => void handleCommitRename()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="m-0 truncate text-base font-semibold text-[var(--heading)]">
                    {currentSessionName}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-[var(--muted)] hover:text-[var(--ink)]"
                    onClick={() => setIsRenaming(true)}
                    title="Rename current session"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <span className="font-mono text-[11px] text-[var(--muted)]">
                ID: {currentSessionId}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleCreateNewSession()}
                className="h-8 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create New Session</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCreateNewInNewTab()}
                className="h-8 gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>New in New Tab</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleDuplicateToNewTab()}
                className="h-8 gap-1.5 text-xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Duplicate</span>
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* Saved Sessions List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                Saved Sessions (
                <code className="font-mono text-[10.5px] normal-case text-[var(--text)]">
                  data/sessions/
                </code>
                )
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void loadSessionsList()}
                disabled={loading}
                title="Refresh list"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            <ScrollArea className="h-[220px] rounded-lg border border-[var(--line)] bg-[var(--sidebar)] p-2">
              {loading && sessions.length === 0 ? (
                <div className="flex h-36 items-center justify-center gap-2 text-xs text-[var(--muted)]">
                  <LoaderCircle className="h-4 w-4 animate-spin text-[var(--forest)]" />
                  <span>Loading saved sessions...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
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
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 transition-all ${
                          isCurrent
                            ? "border-[var(--forest)] bg-[color-mix(in_srgb,var(--forest)_11%,var(--surface))] shadow-[inset_3px_0_0_var(--forest)]"
                            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--hover)]"
                        }`}
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-[var(--heading)]">
                              {sess.name}
                            </span>
                            {isCurrent && (
                              <Badge
                                variant="outline"
                                className="border-[color-mix(in_srgb,var(--forest)_45%,transparent)] bg-[color-mix(in_srgb,var(--forest)_16%,transparent)] px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-[var(--forest)]"
                              >
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
                            <span>Updated: {formattedDate}</span>
                            <span>•</span>
                            <span>{sess.folderCount ?? 0} folders</span>
                            <span>•</span>
                            <span>{sess.noteCount ?? 0} notes</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {!isCurrent && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2.5 text-xs"
                              onClick={() =>
                                sessionApi.switchSessionInCurrentTab(sess.id)
                              }
                              title="Switch to this session in this tab"
                            >
                              <FolderOpen className="h-3 w-3" />
                              <span>Switch</span>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[var(--muted)] hover:text-[var(--ink)]"
                            onClick={() =>
                              sessionApi.openSessionInNewTab(sess.id)
                            }
                            title="Open this session in a new browser tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          {sessions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[var(--muted)] hover:bg-[rgba(235,107,107,0.15)] hover:text-[var(--danger)]"
                              onClick={() =>
                                void handleDeleteSession(sess.id, sess.name)
                              }
                              title="Delete session"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="border-t border-[var(--line)] bg-[var(--sidebar)] px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={closeSessionModal}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
