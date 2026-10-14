const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "guideOverlay",
  Object.freeze({
    init: () => ipcRenderer.invoke("glimpselet:overlay:init"),
    onStep: (listener) => {
      const handle = (_e, value) => listener(value);
      ipcRenderer.on("glimpselet:overlay:step", handle);
      return () =>
        ipcRenderer.removeListener("glimpselet:overlay:step", handle);
    },
  }),
);
