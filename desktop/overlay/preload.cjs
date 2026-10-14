const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "guideOverlay",
  Object.freeze({
    init: () => ipcRenderer.invoke("blinkling:overlay:init"),
    onStep: (listener) => {
      const handle = (_e, value) => listener(value);
      ipcRenderer.on("blinkling:overlay:step", handle);
      return () => ipcRenderer.removeListener("blinkling:overlay:step", handle);
    },
  }),
);
