const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hmsDesktop", {
  getConfig: () => ipcRenderer.invoke("hms:get-config"),
  setServer: (url) => ipcRenderer.invoke("hms:set-server", url),
  version: () => ipcRenderer.invoke("hms:version"),
});
