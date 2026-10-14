const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, listener) {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld(
  "glimpselet",
  Object.freeze({
    action: (action) => ipcRenderer.invoke("glimpselet:action", action),
    interactive: (regions) => ipcRenderer.send("glimpselet:regions", regions),
    shell: (command) => ipcRenderer.invoke("glimpselet:shell", command),
    onShell: (listener) => subscribe("glimpselet:shell", listener),
    onEvent: (listener) => subscribe("glimpselet:event", listener),
  }),
);
