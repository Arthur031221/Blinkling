const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "mini",
  Object.freeze({
    onState(handler) {
      const wrapped = (_event, state) => handler(state);
      ipcRenderer.on("blinkling:mini:state", wrapped);
      return () => ipcRenderer.removeListener("blinkling:mini:state", wrapped);
    },
    ready: () => ipcRenderer.send("blinkling:mini:ready"),
    input: (text) => ipcRenderer.send("blinkling:mini:input", String(text)),
    key: (key, shiftKey) =>
      ipcRenderer.send("blinkling:mini:key", { key: String(key), shiftKey: !!shiftKey }),
    chip: (id) => ipcRenderer.send("blinkling:mini:chip", String(id)),
    remove: (id) => ipcRenderer.send("blinkling:mini:remove", String(id)),
    pause: () => ipcRenderer.send("blinkling:mini:pause"),
    offer: (id) => ipcRenderer.send("blinkling:mini:offer", String(id)),
    dismiss: (id) => ipcRenderer.send("blinkling:mini:dismiss", String(id)),
    size: (width, height) => ipcRenderer.send("blinkling:mini:size", { width, height }),
  }),
);
