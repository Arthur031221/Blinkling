const { contextBridge, ipcRenderer } = require("electron");
const on = (channel) => (listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("settingsAPI", {
  ready: () => ipcRenderer.invoke("blinkling:settings-ready"),
  set: (key, value) =>
    ipcRenderer.invoke("blinkling:settings-set", { key, value }),
  help: (name) => ipcRenderer.send("blinkling:settings-help", String(name)),
  close: () => ipcRenderer.send("blinkling:settings-close"),
  nudge: (value) => ipcRenderer.send("blinkling:settings-nudge", value),
  onKept: on("blinkling:settings-nudge-kept"),
  onState: on("blinkling:settings-state"),
  onOpen: on("blinkling:settings-open"),
  onClose: on("blinkling:settings-close"),
});
