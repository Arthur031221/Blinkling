const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "captureUI",
  Object.freeze({
    init: () => ipcRenderer.invoke("glimpselet:capture-ui:init"),
    finish: (rect) => ipcRenderer.invoke("glimpselet:capture-ui:finish", rect),
    cancel: () => ipcRenderer.invoke("glimpselet:capture-ui:cancel"),
    settings: () => ipcRenderer.invoke("glimpselet:capture-ui:settings"),
  }),
);
