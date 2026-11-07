import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  fetchOllamaModels,
  formatBytes,
  getOllamaHost,
  getSavedOllamaModel,
  getSavedWebSearch,
  OllamaChatMessage,
  OllamaModel,
  OllamaPullProgress,
  OllamaSearchResult,
  pullOllamaModel,
  searchOllamaWeb,
  setSavedOllamaModel,
  setSavedWebSearch,
  streamOllamaChat,
} from "../lib/ollamaClient";
import { NoteItem } from "../types";
import { useNotesStore } from "../store/useNotesStore";

interface OllamaChatboxProps {
  note: NoteItem | null;
  noteContent: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: OllamaSearchResult[];
}

const POPULAR_MODELS = [
  "llama3.2",
  "deepseek-r1:7b",
  "phi3:mini",
  "qwen2.5:7b",
  "mistral:7b",
  "gemma2:2b",
];

export const OllamaChatbox: React.FC<OllamaChatboxProps> = ({
  note,
  noteContent,
}) => {
  const updateNote = useNotesStore((s) => s.updateNote);

  // Connection & Model states
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    getSavedOllamaModel(),
  );
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Pull Model states
  const [isPullOpen, setIsPullOpen] = useState(false);
  const [pullModelInput, setPullModelInput] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(
    null,
  );
  const [pullError, setPullError] = useState<string | null>(null);
  const pullAbortRef = useRef<(() => void) | null>(null);

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeContext, setIncludeContext] = useState<boolean>(true);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() =>
    getSavedWebSearch(),
  );
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);

  // Action feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appendedId, setAppendedId] = useState<string | null>(null);

  const chatAbortRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Load models on mount
  const loadModels = useCallback(async (preferModel?: string) => {
    setIsLoadingModels(true);
    setConnectionError(null);
    try {
      const fetched = await fetchOllamaModels();
      setModels(fetched);
      setIsConnected(true);

      if (fetched.length > 0) {
        if (preferModel && fetched.some((m) => m.name === preferModel)) {
          setSelectedModel(preferModel);
          setSavedOllamaModel(preferModel);
        } else {
          setSelectedModel((prev) => {
            if (prev && fetched.some((m) => m.name === prev)) {
              return prev;
            }
            const defaultM = fetched[0].name;
            setSavedOllamaModel(defaultM);
            return defaultM;
          });
        }
      }
    } catch (err) {
      setIsConnected(false);
      setConnectionError(
        err instanceof Error
          ? err.message
          : "Could not connect to Ollama local instance.",
      );
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleSelectModel = (modelName: string) => {
    setSelectedModel(modelName);
    setSavedOllamaModel(modelName);
  };

  // Pull new model
  const handleStartPull = (targetModel?: string) => {
    const modelToPull = (targetModel || pullModelInput).trim();
    if (!modelToPull || isPulling) return;

    setPullError(null);
    setIsPulling(true);
    setPullProgress({ status: "Starting download..." });

    const abort = pullOllamaModel(getOllamaHost(), modelToPull, (progress) => {
      setPullProgress(progress);

      if (progress.status === "success") {
        setIsPulling(false);
        setPullModelInput("");
        setIsPullOpen(false);
        // Reload models and select the new model
        void loadModels(modelToPull);
      } else if (progress.status === "error") {
        setIsPulling(false);
        setPullError(
          progress.error ||
            `Failed to download model "${modelToPull}". Please check if the model name exists on Ollama.`,
        );
      } else if (progress.status === "aborted") {
        setIsPulling(false);
        setPullProgress(null);
      }
    });

    pullAbortRef.current = abort;
  };

  const handleCancelPull = () => {
    pullAbortRef.current?.();
    pullAbortRef.current = null;
    setIsPulling(false);
    setPullProgress(null);
  };

  const handleToggleWebSearch = () => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      setSavedWebSearch(next);
      return next;
    });
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isGenerating || !selectedModel) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsgId = `asst-${Date.now() + 1}`;
    setInputValue("");
    setIsGenerating(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let searchSources: OllamaSearchResult[] | undefined;

    // Optional web search augmentation
    if (webSearchEnabled) {
      setIsSearchingWeb(true);
      try {
        const results = await searchOllamaWeb(text);
        if (results && results.length > 0) {
          searchSources = results;
        }
      } catch {
        // Fall back gracefully to standard chat without web search
      } finally {
        setIsSearchingWeb(false);
      }
    }

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now() + 1,
      sources: searchSources,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Build message payload
    const systemPrompts: OllamaChatMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful, knowledgeable AI assistant inside Pent Notes. Provide clear, accurate, and concise markdown answers.",
      },
    ];

    if (includeContext && note && noteContent) {
      systemPrompts.push({
        role: "system",
        content: `Active Note Context:\nTitle: ${note.title}\nContent:\n${noteContent.slice(0, 14000)}`,
      });
    }

    if (searchSources && searchSources.length > 0) {
      const formattedResults = searchSources
        .map(
          (r, idx) =>
            `[Source ${idx + 1}] ${r.title}\nURL: ${r.url}\nSummary: ${r.snippet}`,
        )
        .join("\n\n");
      systemPrompts.push({
        role: "system",
        content:
          `You have access to real-time web search results for the user query:\n\n${formattedResults}\n\n` +
          `Use these search results to provide a modern, up-to-date answer. Cite sources with markdown links [Source Title](URL) where relevant.`,
      });
    }

    const conversationHistory: OllamaChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const finalMessages: OllamaChatMessage[] = [
      ...systemPrompts,
      ...conversationHistory,
      { role: "user", content: text },
    ];

    let accumulatedContent = "";

    const abort = streamOllamaChat(
      getOllamaHost(),
      selectedModel,
      finalMessages,
      (chunk) => {
        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: accumulatedContent }
                : msg,
            ),
          );
        }

        if (chunk.done || chunk.error || chunk.aborted) {
          setIsGenerating(false);
          chatAbortRef.current = null;

          if (chunk.error) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      content: accumulatedContent || `⚠️ Error: ${chunk.error}`,
                    }
                  : msg,
              ),
            );
          }
        }
      },
    );

    chatAbortRef.current = abort;
  };

  const handleStopGenerating = () => {
    chatAbortRef.current?.();
    chatAbortRef.current = null;
    setIsGenerating(false);
  };

  const handleClearMessages = () => {
    if (isGenerating) {
      handleStopGenerating();
    }
    setMessages([]);
  };

  const handleCopyMessage = (id: string, text: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1800);
      });
    }
  };

  const handleAppendToNote = (id: string, text: string) => {
    if (!note) return;
    const current = noteContent || "";
    const newContent = `${current.trimEnd()}\n\n${text}\n`;
    updateNote(note.id, { content: newContent });
    setAppendedId(id);
    setTimeout(() => setAppendedId(null), 2000);
  };

  // Render markdown with code block copy buttons
  const renderMessageContent = (content: string) => {
    if (!content.includes("```")) {
      return <div className="ollama-text-content">{content}</div>;
    }

    const parts = content.split(/(```[\s\S]*?```)/g);
    return (
      <div className="ollama-text-content">
        {parts.map((part, index) => {
          if (part.startsWith("```") && part.endsWith("```")) {
            const lines = part.slice(3, -3).trim().split("\n");
            const firstLine = lines[0].trim();
            const lang = firstLine && !firstLine.includes(" ") ? firstLine : "";
            const code = (lang ? lines.slice(1) : lines).join("\n");

            return (
              <div key={index} className="ollama-code-block">
                <div className="ollama-code-header">
                  <span className="ollama-code-lang">{lang || "code"}</span>
                  <button
                    type="button"
                    className="ollama-code-copy-btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(code);
                    }}
                    title="Copy code"
                  >
                    <Copy size={11} />
                    <span>Copy</span>
                  </button>
                </div>
                <pre className="ollama-code-body">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    );
  };

  // Calculate pull progress percentage
  const pullPercentage =
    pullProgress?.total && pullProgress?.completed
      ? Math.round((pullProgress.completed / pullProgress.total) * 100)
      : null;

  return (
    <div className="ollama-chatbox-container">
      {/* Top Model Control Bar */}
      <div className="ollama-header">
        <div className="ollama-model-select-wrapper">
          <div
            className="ollama-status-dot-wrap"
            title={isConnected ? "Ollama Connected" : "Ollama Offline"}
          >
            <span
              className={`ollama-status-dot ${isConnected ? "is-connected" : "is-offline"}`}
            />
          </div>

          <div className="ollama-model-dropdown-wrap">
            <select
              className="ollama-model-select"
              value={selectedModel}
              onChange={(e) => handleSelectModel(e.target.value)}
              disabled={models.length === 0 || isGenerating || isPulling}
              title="Select active Ollama model"
            >
              {models.length === 0 ? (
                <option value="">No models installed</option>
              ) : (
                models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.size ? `(${formatBytes(m.size)})` : ""}
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={13} className="ollama-select-chevron" />
          </div>

          <button
            type="button"
            className="ollama-icon-btn"
            onClick={() => loadModels()}
            disabled={isLoadingModels}
            title="Refresh Ollama model list"
          >
            <RefreshCw size={13} className={isLoadingModels ? "spin" : ""} />
          </button>

          <button
            type="button"
            className={`ollama-icon-btn ${isPullOpen ? "is-active" : ""}`}
            onClick={() => setIsPullOpen((v) => !v)}
            title="Download new model from Ollama library"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Model Pull Panel */}
      {isPullOpen && (
        <div className="ollama-pull-panel">
          <div className="ollama-pull-header">
            <span className="ollama-pull-title">Download Ollama Model</span>
            <button
              type="button"
              className="ollama-close-btn"
              onClick={() => setIsPullOpen(false)}
              disabled={isPulling}
            >
              <X size={13} />
            </button>
          </div>

          <form
            className="ollama-pull-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleStartPull();
            }}
          >
            <div className="ollama-pull-input-wrap">
              <input
                type="text"
                className="ollama-pull-input"
                placeholder="e.g. llama3.2, deepseek-r1:7b..."
                value={pullModelInput}
                onChange={(e) => setPullModelInput(e.target.value)}
                disabled={isPulling}
              />
              {isPulling ? (
                <button
                  type="button"
                  className="ollama-pull-cancel-btn"
                  onClick={handleCancelPull}
                  title="Cancel download"
                >
                  <Square size={12} />
                  <span>Cancel</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className="ollama-pull-submit-btn"
                  disabled={!pullModelInput.trim()}
                >
                  <Download size={13} />
                  <span>Pull</span>
                </button>
              )}
            </div>

            {/* Popular model shortcuts */}
            {!isPulling && (
              <div className="ollama-popular-tags">
                <span className="ollama-tags-label">Popular:</span>
                {POPULAR_MODELS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="ollama-tag-pill"
                    onClick={() => {
                      setPullModelInput(tag);
                      handleStartPull(tag);
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Pull Progress indicator */}
          {isPulling && pullProgress && (
            <div className="ollama-progress-box">
              <div className="ollama-progress-status-row">
                <Loader2 size={12} className="spin primary-accent-icon" />
                <span className="ollama-progress-status">
                  {pullProgress.status}
                </span>
                {pullPercentage !== null && (
                  <span className="ollama-progress-percent">
                    {pullPercentage}%
                  </span>
                )}
              </div>

              {pullPercentage !== null && (
                <div className="ollama-progress-bar-bg">
                  <div
                    className="ollama-progress-bar-fill"
                    style={{ width: `${pullPercentage}%` }}
                  />
                </div>
              )}

              {pullProgress.total && pullProgress.completed && (
                <div className="ollama-progress-bytes">
                  {formatBytes(pullProgress.completed)} /{" "}
                  {formatBytes(pullProgress.total)}
                </div>
              )}
            </div>
          )}

          {pullError && (
            <div className="ollama-pull-error">
              <AlertCircle size={13} className="ollama-error-icon" />
              <span>{pullError}</span>
            </div>
          )}
        </div>
      )}

      {/* Offline Alert if Ollama is unreachable */}
      {!isConnected && (
        <div className="ollama-offline-banner">
          <AlertCircle size={14} className="ollama-offline-icon" />
          <div className="ollama-offline-text">
            <strong>Ollama is not running locally</strong>
            <p>
              {connectionError ||
                "Please start Ollama (`ollama serve`) on your computer, then click retry."}
            </p>
          </div>
          <button
            type="button"
            className="subtle-btn is-compact"
            onClick={() => loadModels()}
          >
            <RefreshCw size={11} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Context Bar & Clear Chat */}
      <div className="ollama-context-bar">
        {note ? (
          <label
            className="ollama-context-toggle"
            title="Include current note as context"
          >
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
            />
            <FileText size={11} />
            <span className="ollama-context-name">{note.title}</span>
          </label>
        ) : (
          <span className="ollama-no-context-hint">
            General Assistant (No note context)
          </span>
        )}

        {messages.length > 0 && (
          <button
            type="button"
            className="ollama-clear-btn"
            onClick={handleClearMessages}
            title="Clear chat history"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Messages Thread */}
      <div className="ollama-messages-thread">
        {messages.length === 0 ? (
          <div className="ollama-empty-state">
            <div className="ollama-empty-badge">
              <Sparkles size={16} />
              <span>LOCAL AI ASSISTANT</span>
            </div>
            <h4 className="ollama-empty-heading">
              {selectedModel ? `Chat with ${selectedModel}` : "Ready to chat"}
            </h4>
            <p className="ollama-empty-desc">
              Powered by your local Ollama runtime. Fast, private, and offline.
            </p>

            {note && (
              <div className="ollama-prompts-grid">
                <button
                  type="button"
                  className="ollama-prompt-card"
                  onClick={() =>
                    handleSendMessage("Summarize the key points of this note.")
                  }
                >
                  <span>📝 Summarize this note</span>
                </button>
                <button
                  type="button"
                  className="ollama-prompt-card"
                  onClick={() =>
                    handleSendMessage(
                      "What action items or next steps are mentioned here?",
                    )
                  }
                >
                  <span>✅ Extract action items</span>
                </button>
                <button
                  type="button"
                  className="ollama-prompt-card"
                  onClick={() =>
                    handleSendMessage(
                      "Improve clarity, tone, and grammar of this note.",
                    )
                  }
                >
                  <span>✍️ Polish writing & tone</span>
                </button>
                <button
                  type="button"
                  className="ollama-prompt-card"
                  onClick={() =>
                    handleSendMessage(
                      "Generate 3 follow-up research questions based on this note.",
                    )
                  }
                >
                  <span>💡 Brainstorm ideas</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`ollama-message-bubble ${msg.role === "user" ? "is-user" : "is-assistant"}`}
            >
              <div className="ollama-message-avatar">
                {msg.role === "user" ? <User size={13} /> : <Bot size={13} />}
              </div>

              <div className="ollama-message-body">
                {renderMessageContent(msg.content)}

                {msg.role === "assistant" &&
                  msg.sources &&
                  msg.sources.length > 0 && (
                    <div className="ollama-message-sources">
                      <div className="ollama-sources-header">
                        <Globe size={11} />
                        <span>Web Sources ({msg.sources.length})</span>
                      </div>
                      <div className="ollama-sources-list">
                        {msg.sources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ollama-source-chip"
                            title={`${src.title}\n${src.url}`}
                          >
                            <span className="ollama-source-idx">
                              [{idx + 1}]
                            </span>
                            <span className="ollama-source-chip-title">
                              {src.title || src.url}
                            </span>
                            <ExternalLink size={9} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                {msg.role === "assistant" && msg.content && (
                  <div className="ollama-message-actions">
                    <button
                      type="button"
                      className="ollama-msg-action-btn"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check size={11} className="primary-accent-icon" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {note && (
                      <button
                        type="button"
                        className="ollama-msg-action-btn"
                        onClick={() => handleAppendToNote(msg.id, msg.content)}
                        title="Append response to current note"
                      >
                        {appendedId === msg.id ? (
                          <>
                            <Check size={11} className="primary-accent-icon" />
                            <span>Appended!</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine size={11} />
                            <span>Append to note</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isSearchingWeb && (
          <div className="ollama-searching-bubble">
            <Globe size={12} className="spin primary-accent-icon" />
            <span>Searching the web for latest information...</span>
          </div>
        )}

        {isGenerating &&
          messages[messages.length - 1]?.role !== "assistant" && (
            <div className="ollama-message-bubble is-assistant">
              <div className="ollama-message-avatar">
                <Bot size={13} />
              </div>
              <div className="ollama-message-body">
                <div className="ollama-typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="ollama-input-bar">
        <form
          className="ollama-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <textarea
            ref={textareaRef}
            className="ollama-textarea"
            rows={1}
            placeholder={
              !isConnected
                ? "Ollama offline..."
                : !selectedModel
                  ? "Select or pull a model..."
                  : "Ask Ollama... (Shift+Enter for newline)"
            }
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={!isConnected || !selectedModel || isGenerating}
          />

          <div className="ollama-input-toolbar">
            <div className="ollama-input-toolbar-left">
              <button
                type="button"
                className={`ollama-input-pill ${webSearchEnabled ? "is-active" : ""}`}
                onClick={handleToggleWebSearch}
                title={
                  webSearchEnabled
                    ? "Web search active: Ollama queries live web sources"
                    : "Web search disabled (click to enable)"
                }
              >
                <Globe size={12} />
              </button>
            </div>

            <div className="ollama-input-toolbar-right">
              <span className="ollama-kbd-hint" title="Press Enter to send">
                <kbd>↵</kbd>
              </span>
              {isGenerating ? (
                <button
                  type="button"
                  className="ollama-stop-btn"
                  onClick={handleStopGenerating}
                  title="Stop generation"
                >
                  <Square size={11} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="ollama-send-btn"
                  disabled={
                    !inputValue.trim() || !isConnected || !selectedModel
                  }
                  title="Send message (Enter)"
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
