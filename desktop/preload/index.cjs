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
    onEvent: (listener) => {
      const remove = subscribe("glimpselet:event", listener);
      ipcRenderer.send("glimpselet:subscribe");
      return remove;
    },
    configuration: () => ipcRenderer.invoke("glimpselet:configuration"),
    sendTurn: (turn) => ipcRenderer.invoke("glimpselet:send", turn),
    select: (selection) => ipcRenderer.invoke("glimpselet:select", selection),
    stop: () => ipcRenderer.invoke("glimpselet:stop"),
    onCapture: (listener) => {
      const remove = subscribe("glimpselet:capture", listener);
      ipcRenderer.send("glimpselet:composer-ready");
      return remove;
    },
    onSurface: (listener) => subscribe("glimpselet:surface", listener),
    activity: (value) => ipcRenderer.send("glimpselet:activity", value),
    typing: (value) => ipcRenderer.send("glimpselet:typing", value),
    hold: (value) => ipcRenderer.send("glimpselet:hold", value),
    pin: (value) =>
      ipcRenderer.invoke("glimpselet:shell", { type: "pin", value }),
    close: () => ipcRenderer.invoke("glimpselet:shell", { type: "close-chat" }),
    openChat: (messageId) =>
      ipcRenderer.invoke("glimpselet:open-chat", messageId),
    openLink: (url) => ipcRenderer.invoke("glimpselet:open-link", url),
    bubbleRegions: (regions) =>
      ipcRenderer.send("glimpselet:bubble-regions", regions),
  }),
);
