const DEFAULT_HOST = "http://127.0.0.1:11434";

function getBaseUrl(host) {
  let h = (host || DEFAULT_HOST).trim();
  if (!/^https?:\/\//i.test(h)) {
    h = "http://" + h;
  }
  return h.replace(/\/+$/, "");
}

/**
 * Fetch installed models from local Ollama instance
 */
export async function listModels(host = DEFAULT_HOST) {
  const url = `${getBaseUrl(host)}/api/tags`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned status ${res.status}`);
  }
  const data = await res.json();
  return data.models || [];
}

/**
 * Shared abortable NDJSON stream runner for Ollama streaming endpoints.
 */
function streamNdjson(
  url,
  body,
  { noBodyError, onItem, onComplete, onError, onAbort },
) {
  const controller = new AbortController();

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    try {
      const parsed = JSON.parse(trimmed);
      return onItem(parsed) !== false;
    } catch {
      return true;
    }
  };

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `Ollama error (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          // Fallback to generic message
        }
        onError(errMsg);
        return;
      }

      if (!res.body) {
        onError(noBodyError);
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
          if (!processLine(line)) return;
        }
      }

      if (buffer.trim() && !processLine(buffer)) {
        return;
      }

      onComplete();
    } catch (err) {
      if (controller.signal.aborted) {
        onAbort();
      } else {
        onError(err instanceof Error ? err.message : String(err));
      }
    }
  })();

  return () => controller.abort();
}

/**
 * Pull and download a new model from Ollama library with streaming progress
 */
export function pullModel(host, modelName, onProgress) {
  return streamNdjson(
    `${getBaseUrl(host)}/api/pull`,
    { name: modelName, stream: true },
    {
      noBodyError: "No response body from Ollama",
      onItem: (parsed) => {
        if (parsed.error) {
          onProgress({ status: "error", error: parsed.error });
          return false;
        }
        onProgress(parsed);
        return true;
      },
      onComplete: () => onProgress({ status: "success" }),
      onError: (error) => onProgress({ status: "error", error }),
      onAbort: () => onProgress({ status: "aborted" }),
    },
  );
}

/**
 * Stream chat completions from Ollama instance
 */
export function chatStream(host, { model, messages }, onChunk) {
  return streamNdjson(
    `${getBaseUrl(host)}/api/chat`,
    { model, messages, stream: true },
    {
      noBodyError: "No response stream from Ollama",
      onItem: (parsed) => {
        onChunk(parsed);
        return true;
      },
      onComplete: () => onChunk({ done: true }),
      onError: (error) => onChunk({ error, done: true }),
      onAbort: () => onChunk({ done: true, aborted: true }),
    },
  );
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Perform a web search to augment Ollama responses.
 * Uses Ollama Web Search API if an API key is available;
 * otherwise seamlessly falls back to DuckDuckGo organic search (no API key required).
 */
export async function searchWeb(query, { apiKey, maxResults = 5 } = {}) {
  const q = (query || "").trim();
  if (!q) return [];

  const key = apiKey || process.env.OLLAMA_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://ollama.com/api/web_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ query: q, max_results: maxResults }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results.map((r) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.content || r.snippet || "",
          }));
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: DuckDuckGo organic search
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return [];
    }
    const html = await res.text();
    const resultBlocks = html.split(
      /<div[^>]*class="[^"]*result\s+results_links[^"]*"[^>]*>/,
    );
    const items = [];

    for (let i = 1; i < resultBlocks.length && items.length < maxResults; i++) {
      const block = resultBlocks[i];
      if (
        block.includes("badge--ad") ||
        block.includes("ad_domain") ||
        block.includes("duckduckgo.com/y.js")
      ) {
        continue;
      }

      const titleMatch =
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(
          block,
        );
      if (!titleMatch) continue;

      let targetUrl = titleMatch[1];
      if (targetUrl.includes("uddg=")) {
        const uddgMatch = targetUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) targetUrl = decodeURIComponent(uddgMatch[1]);
      }

      const title = decodeHtmlEntities(
        titleMatch[2].replace(/<[^>]+>/g, "").trim(),
      );

      let snippet = "";
      const snippetMatch =
        /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (snippetMatch) {
        snippet = decodeHtmlEntities(
          snippetMatch[1].replace(/<[^>]+>/g, "").trim(),
        );
      }

      if (title && targetUrl) {
        items.push({ title, url: targetUrl, snippet });
      }
    }

    return items;
  } catch {
    return [];
  }
}
