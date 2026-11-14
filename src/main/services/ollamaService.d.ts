export function listModels(
  host?: string,
): Promise<Array<{ name: string; size?: number }>>;
export function pullModel(
  host: string,
  modelName: string,
  onProgress: (progress: {
    status?: string;
    completed?: number;
    total?: number;
    error?: string;
  }) => void,
): () => void;
export function chatStream(
  host: string,
  payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
  },
  onChunk: (chunk: {
    message?: { role: string; content: string };
    done?: boolean;
    error?: string;
    aborted?: boolean;
  }) => void,
): () => void;
export function searchWeb(
  query: string,
  options?: { apiKey?: string; maxResults?: number },
): Promise<Array<{ title: string; url: string; snippet: string }>>;
