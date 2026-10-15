const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pickLayerAPI", {
  onInit: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on("blinkling:pick-init", handler);
    return () => ipcRenderer.removeListener("blinkling:pick-init", handler);
  },
  onMessage: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on("blinkling:pick-message", handler);
    return () => ipcRenderer.removeListener("blinkling:pick-message", handler);
  },
  pointer: (type, x, y) =>
    ipcRenderer.send("blinkling:pick-pointer", { type: String(type), x: Number(x), y: Number(y) }),
  flightDone: (token) => ipcRenderer.send("blinkling:pick-flight-done", String(token)),
  ready: () => ipcRenderer.send("blinkling:pick-ready"),
});
