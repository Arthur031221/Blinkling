const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel, listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld(
  "glimpselet",
  Object.freeze({
    configuration: () => ipcRenderer.invoke("test:configuration"),
    sendTurn: (turn) => ipcRenderer.invoke("test:send", turn),
    select: (value) => ipcRenderer.invoke("test:select", value),
    stop: () => ipcRenderer.invoke("test:stop"),
    activity: (value) => ipcRenderer.send("test:activity", value),
    pin: (value) => ipcRenderer.send("test:pin", value),
    close: () => ipcRenderer.send("test:close"),
    typing: (value) => ipcRenderer.send("test:typing", value),
    openChat: (id) => ipcRenderer.send("test:open-chat", id),
    onEvent: (fn) => subscribe("glimpselet:event", fn),
    onCapture: (fn) => subscribe("test:capture", fn),
    onSurface: (fn) => subscribe("test:surface", fn),
  }),
);
