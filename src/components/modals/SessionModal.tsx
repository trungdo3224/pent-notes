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
      <DialogContent className="max-w-xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <DialogTitle>Session Management</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Workspaces are stored in clean JSON files on disk (
            <code className="px-1 py-0.5 rounded bg-muted">
              data/sessions/*.json
            </code>
            ). New tabs start in your Default session. You can switch sessions
            or create new ones anytime.
          </DialogDescription>
        </DialogHeader>

        {/* Current Active Session Card */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Radio className="h-3 w-3 animate-pulse" /> ACTIVE IN THIS TAB
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="h-7 gap-1.5 text-xs"
            >
              {copiedLink ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedLink ? "Copied URL!" : "Share URL"}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {isRenaming ? (
              <div className="flex flex-1 items-center gap-2">
                <InlineRenameInput
                  variant="ui"
                  className="h-8 text-sm"
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
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {currentSessionName}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsRenaming(true)}
                  title="Rename current session"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            ID: {currentSessionId}
          </span>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleCreateNewSession()}
              className="gap-1.5 h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Session</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sessionApi.openSessionInNewTab()}
              className="gap-1.5 h-8 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>New in New Tab</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleDuplicateToNewTab()}
              className="gap-1.5 h-8 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Duplicate</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Saved Sessions List */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              SAVED SESSIONS (
              <code className="text-[11px]">data/sessions/</code>)
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => void loadSessionsList()}
              disabled={loading}
              title="Refresh list"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          <ScrollArea className="h-[210px] rounded-md border border-border bg-card p-2">
            {loading && sessions.length === 0 ? (
              <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>Loading saved sessions...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
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
                      className={`flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors ${
                        isCurrent
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {sess.name}
                          </span>
                          {isCurrent && (
                            <Badge
                              variant="default"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>Updated: {formattedDate}</span>
                          <span>•</span>
                          <span>{sess.folderCount ?? 0} folders</span>
                          <span>•</span>
                          <span>{sess.noteCount ?? 0} notes</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isCurrent && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
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
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
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

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={closeSessionModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
