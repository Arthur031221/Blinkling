const { contextBridge, ipcRenderer } = require("electron");
const on = (channel) => (listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("welcomeAPI", {
  ready: () => ipcRenderer.invoke("blinkling:welcome-ready"),
  permission: (action) =>
    ipcRenderer.invoke("blinkling:welcome-permission", String(action)),
  close: () => ipcRenderer.send("blinkling:welcome-close"),
  onState: on("blinkling:welcome-state"),
  onOpen: on("blinkling:welcome-open"),
  onClose: on("blinkling:welcome-close"),
});
