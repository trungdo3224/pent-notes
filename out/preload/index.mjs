import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => "pong",
  platform: process.platform
});
