const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel) => (listener) => {
  const handle = (_e, value) => listener(value);
  ipcRenderer.on(channel, handle);
  return () => ipcRenderer.removeListener(channel, handle);
};
contextBridge.exposeInMainWorld(
  "guideOverlay",
  Object.freeze({
    init: () => ipcRenderer.invoke("blinkling:overlay:init"),
    onDraw: subscribe("blinkling:overlay:draw"),
    onCommand: subscribe("blinkling:overlay:command"),
    markClick: (n) => ipcRenderer.send("blinkling:overlay:mark-click", n),
    nav: (dir) => ipcRenderer.send("blinkling:overlay:nav", dir),
    regions: (list) => ipcRenderer.send("blinkling:overlay:regions", list),
  }),
);
