const { contextBridge, ipcRenderer } = require("electron");
const listen = (channel) => (handler) => {
  const wrapped = (_event, message) => handler(message);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};
contextBridge.exposeInMainWorld(
  "pickLayer",
  Object.freeze({
    onState: listen("blinkling:pick:state"),
    onPlay: listen("blinkling:pick:play"),
    pointer: (type, x, y) => ipcRenderer.send("blinkling:pick:pointer", { type, x, y }),
    landed: () => ipcRenderer.send("blinkling:pick:landed"),
  }),
);
