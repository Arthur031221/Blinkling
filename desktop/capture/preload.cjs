const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "captureUI",
  Object.freeze({
    init: () => ipcRenderer.invoke("blinkling:capture-ui:init"),
    finish: (rect) => ipcRenderer.invoke("blinkling:capture-ui:finish", rect),
    cancel: () => ipcRenderer.invoke("blinkling:capture-ui:cancel"),
    settings: () => ipcRenderer.invoke("blinkling:capture-ui:settings"),
  }),
);
