const { contextBridge, ipcRenderer } = require("electron");
const on = (channel) => (listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("miniAPI", {
  onInit: on("blinkling:mini-init"),
  onView: on("blinkling:mini-view"),
  onOpen: on("blinkling:mini-open"),
  onClose: on("blinkling:mini-close"),
  input: (text) => ipcRenderer.send("blinkling:mini-input", String(text)),
  submit: () => ipcRenderer.send("blinkling:mini-submit"),
  chip: (id) => ipcRenderer.send("blinkling:mini-chip", String(id)),
  remove: (id) => ipcRenderer.send("blinkling:mini-remove", String(id)),
  offer: (id) => ipcRenderer.send("blinkling:mini-offer", String(id)),
  attach: (value) => ipcRenderer.send("blinkling:mini-attach", value),
  select: (value) => ipcRenderer.send("blinkling:mini-select", value),
  escape: () => ipcRenderer.send("blinkling:mini-escape"),
  size: (height) => ipcRenderer.send("blinkling:mini-size", Number(height)),
});
