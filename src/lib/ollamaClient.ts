export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModel {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
  aborted?: boolean;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatChunk {
  model?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  error?: string;
  aborted?: boolean;
}

export interface OllamaSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const HOST_STORAGE_KEY = "pent_notes_ollama_host";
const MODEL_STORAGE_KEY = "pent_notes_ollama_selected_model";
const WEB_SEARCH_STORAGE_KEY = "pent_notes_ollama_web_search";

export function getSavedWebSearch(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSavedWebSearch(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WEB_SEARCH_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore
  }
}

export async function searchOllamaWeb(
  query: string,
  options?: { apiKey?: string; maxResults?: number },
): Promise<OllamaSearchResult[]> {
  if (typeof window !== "undefined" && window.electronAPI?.ollama?.searchWeb) {
    try {
      const results = await window.electronAPI.ollama.searchWeb(query, options);
      return results || [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getOllamaHost(): string {
  if (typeof window === "undefined") return DEFAULT_OLLAMA_HOST;
  return localStorage.getItem(HOST_STORAGE_KEY) || DEFAULT_OLLAMA_HOST;
}

export function setOllamaHost(host: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HOST_STORAGE_KEY, host.trim());
}

export function getSavedOllamaModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MODEL_STORAGE_KEY) || "";
}

export function setSavedOllamaModel(model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODEL_STORAGE_KEY, model.trim());
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function cleanBaseUrl(host: string): string {
  let h = (host || DEFAULT_OLLAMA_HOST).trim();
  if (!/^https?:\/\//i.test(h)) {
    h = "http://" + h;
  }
  return h.replace(/\/+$/, "");
}

/**
 * Fetch available local models from Ollama
 */
export async function fetchOllamaModels(
  host = getOllamaHost(),
): Promise<OllamaModel[]> {
  if (typeof window !== "undefined" && window.electronAPI?.ollama?.listModels) {
    const raw = await window.electronAPI.ollama.listModels(host);
    return raw as OllamaModel[];
  }

  const url = `${cleanBaseUrl(host)}/api/tags`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Ollama returned status ${res.status}`);
  }
  const data = await res.json();
  return (data.models as OllamaModel[]) || [];
}

/**
 * Pull and download a model from Ollama library with streaming progress.
 * Returns an abort function.
 */
export function pullOllamaModel(
  host: string,
  modelName: string,
  onProgress: (progress: OllamaPullProgress) => void,
): () => void {
  if (typeof window !== "undefined" && window.electronAPI?.ollama?.pullModel) {
    return window.electronAPI.ollama.pullModel(host, modelName, onProgress);
  }

  // Web fallback with ReadableStream
  const controller = new AbortController();
  const url = `${cleanBaseUrl(host)}/api/pull`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `Ollama error (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          // Ignore
        }
        onProgress({ status: "error", error: errMsg });
        return;
      }

      if (!res.body) {
        onProgress({ status: "error", error: "No response body from Ollama" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaPullProgress;
            if (parsed.error) {
              onProgress({ status: "error", error: parsed.error });
              return;
            }
            onProgress(parsed);
          } catch {
            // Ignore incomplete line chunk
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as OllamaPullProgress;
          if (parsed.error) {
            onProgress({ status: "error", error: parsed.error });
            return;
          }
          onProgress(parsed);
        } catch {
          // Ignore
        }
      }

      onProgress({ status: "success" });
    } catch (err) {
      if (controller.signal.aborted) {
        onProgress({ status: "aborted" });
      } else {
        onProgress({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();

  return () => controller.abort();
}

/**
 * Stream chat completions from local Ollama instance.
 * Returns an abort function.
 */
export function streamOllamaChat(
  host: string,
  model: string,
  messages: OllamaChatMessage[],
  onChunk: (chunk: OllamaChatChunk) => void,
): () => void {
  if (typeof window !== "undefined" && window.electronAPI?.ollama?.chat) {
    return window.electronAPI.ollama.chat(host, { model, messages }, onChunk);
  }

  // Web fallback with ReadableStream
  const controller = new AbortController();
  const url = `${cleanBaseUrl(host)}/api/chat`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `Ollama error (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          // Ignore
        }
        onChunk({ error: errMsg, done: true });
        return;
      }

      if (!res.body) {
        onChunk({ error: "No response stream from Ollama", done: true });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaChatChunk;
            onChunk(parsed);
          } catch {
            // Ignore incomplete line chunk
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as OllamaChatChunk;
          onChunk(parsed);
        } catch {
          // Ignore
        }
      }

      onChunk({ done: true });
    } catch (err) {
      if (controller.signal.aborted) {
        onChunk({ done: true, aborted: true });
      } else {
        onChunk({
          error: err instanceof Error ? err.message : String(err),
          done: true,
        });
      }
    }
  })();

  return () => controller.abort();
}
