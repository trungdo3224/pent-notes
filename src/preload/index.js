import { contextBridge, ipcRenderer } from "electron";

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
});
