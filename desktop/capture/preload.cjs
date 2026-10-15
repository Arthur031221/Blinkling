const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "captureUI",
  Object.freeze({
    init: () => ipcRenderer.invoke("blinkling:capture-ui:init"),
    onOpen: (listener) =>
      ipcRenderer.on("blinkling:capture-ui:open", (_event, payload) =>
        listener(payload),
      ),
    ready: () => ipcRenderer.invoke("blinkling:capture-ui:ready"),
    finish: (choice) =>
      ipcRenderer.invoke("blinkling:capture-ui:finish", choice),
    cancel: () => ipcRenderer.invoke("blinkling:capture-ui:cancel"),
    settings: () => ipcRenderer.invoke("blinkling:capture-ui:settings"),
  }),
);
