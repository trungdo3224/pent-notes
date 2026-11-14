import { contextBridge, ipcRenderer } from "electron";

function createStreamIpcClient({
  prefix,
  startChannel,
  abortChannel,
  eventChannelPrefix,
  isTerminal,
  startArgs,
  onEvent,
}) {
  const reqId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const channel = `${eventChannelPrefix}:${reqId}`;
  const listener = (_, payload) => {
    onEvent(payload);
    if (isTerminal(payload)) {
      ipcRenderer.removeListener(channel, listener);
    }
  };
  ipcRenderer.on(channel, listener);
  ipcRenderer.send(startChannel, { reqId, ...startArgs });
  return () => {
    ipcRenderer.removeListener(channel, listener);
    ipcRenderer.send(abortChannel, { reqId });
  };
}

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  dialog: {
    selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  },

  fs: {
    scanFolder: (folderPath) => ipcRenderer.invoke("fs:scan", folderPath),
    writeFile: (filePath, content) =>
      ipcRenderer.invoke("fs:write-file", filePath, content),
    createFile: (parentPath, name, content) =>
      ipcRenderer.invoke("fs:create-file", parentPath, name, content),
    createFolder: (parentPath, name) =>
      ipcRenderer.invoke("fs:create-folder", parentPath, name),
    renamePath: (oldPath, newPath) =>
      ipcRenderer.invoke("fs:rename", oldPath, newPath),
    deletePath: (targetPath) => ipcRenderer.invoke("fs:delete", targetPath),
    readFile: (filePath) => ipcRenderer.invoke("fs:read-file", filePath),
    readDir: (dirPath) => ipcRenderer.invoke("fs:read-dir", dirPath),
    saveImage: (parentDir, fileName, base64Data) =>
      ipcRenderer.invoke("fs:save-image", parentDir, fileName, base64Data),
    getRawUrl: (filePath) =>
      `pent-file://stream?path=${encodeURIComponent(filePath)}`,
  },

  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    get: (sessionId) => ipcRenderer.invoke("sessions:get", sessionId),
    save: (sessionId, name, payload) =>
      ipcRenderer.invoke("sessions:save", sessionId, name, payload),
    delete: (sessionId) => ipcRenderer.invoke("sessions:delete", sessionId),
  },

  window: {
    setTitleBarOverlay: (options) =>
      ipcRenderer.invoke("window:setTitleBarOverlay", options),
  },

  ollama: {
    listModels: (host) => ipcRenderer.invoke("ollama:list-models", host),
    searchWeb: (query, options) =>
      ipcRenderer.invoke("ollama:search-web", { query, ...options }),
    pullModel: (host, modelName, onProgress) =>
      createStreamIpcClient({
        prefix: "pull",
        startChannel: "ollama:pull-start",
        abortChannel: "ollama:pull-abort",
        eventChannelPrefix: "ollama:pull-progress",
        isTerminal: (progress) =>
          progress.status === "success" ||
          progress.status === "error" ||
          progress.status === "aborted",
        startArgs: { host, modelName },
        onEvent: onProgress,
      }),
    chat: (host, { model, messages }, onChunk) =>
      createStreamIpcClient({
        prefix: "chat",
        startChannel: "ollama:chat-start",
        abortChannel: "ollama:chat-abort",
        eventChannelPrefix: "ollama:chat-chunk",
        isTerminal: (chunk) => Boolean(chunk.done || chunk.error),
        startArgs: { host, model, messages },
        onEvent: onChunk,
      }),
  },
});
