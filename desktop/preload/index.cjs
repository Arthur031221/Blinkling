const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "glimpselet",
  Object.freeze({
    shell: (command) => ipcRenderer.invoke("glimpselet:shell", command),
    onShell: (listener) => {
      const handler = (_event, value) => listener(value);
      ipcRenderer.on("glimpselet:shell", handler);
      return () => ipcRenderer.removeListener("glimpselet:shell", handler);
    },
    action: (action) => ipcRenderer.invoke("glimpselet:action", action),
    interactive: (regions) => ipcRenderer.send("glimpselet:regions", regions),
    onEvent: (listener) => {
      const handler = (_event, value) => listener(value);
      ipcRenderer.on("glimpselet:event", handler);
      return () => ipcRenderer.removeListener("glimpselet:event", handler);
    },
  }),
);
