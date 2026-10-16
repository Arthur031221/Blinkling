const { contextBridge, ipcRenderer } = require("electron");
const on = (channel) => (listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("viewerAPI", {
  close: () => ipcRenderer.send("blinkling:viewer-close"),
  onOpen: on("blinkling:viewer-open"),
  onClose: on("blinkling:viewer-close"),
});
