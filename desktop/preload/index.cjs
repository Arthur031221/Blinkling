const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, listener) {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld(
  "blinkling",
  Object.freeze({
    action: (action) => ipcRenderer.invoke("blinkling:action", action),
    interactive: (regions) => ipcRenderer.send("blinkling:regions", regions),
    shell: (command) => ipcRenderer.invoke("blinkling:shell", command),
    onShell: (listener) => subscribe("blinkling:shell", listener),
    onEvent: (listener) => {
      const remove = subscribe("blinkling:event", listener);
      ipcRenderer.send("blinkling:subscribe");
      return remove;
    },
    configuration: () => ipcRenderer.invoke("blinkling:configuration"),
    sendTurn: (turn) => ipcRenderer.invoke("blinkling:send", turn),
    select: (selection) => ipcRenderer.invoke("blinkling:select", selection),
    stop: () => ipcRenderer.invoke("blinkling:stop"),
    onCapture: (listener) => {
      const remove = subscribe("blinkling:capture", listener);
      ipcRenderer.send("blinkling:composer-ready");
      return remove;
    },
    onSurface: (listener) => subscribe("blinkling:surface", listener),
    onCatch: (listener) => subscribe("blinkling:catch", listener),
    activity: (value) => ipcRenderer.send("blinkling:activity", value),
    typing: (value) => ipcRenderer.send("blinkling:typing", value),
    hold: (value) => ipcRenderer.send("blinkling:hold", value),
    pin: (value) =>
      ipcRenderer.invoke("blinkling:shell", { type: "pin", value }),
    close: () => ipcRenderer.invoke("blinkling:shell", { type: "close-chat" }),
    openChat: (messageId) =>
      ipcRenderer.invoke("blinkling:open-chat", messageId),
    openLink: (url) => ipcRenderer.invoke("blinkling:open-link", url),
    bubbleRegions: (regions) =>
      ipcRenderer.send("blinkling:bubble-regions", regions),
    bubbleHover: (value) => ipcRenderer.send("blinkling:bubble-hover", value),
    onMarkClick: (listener) => subscribe("blinkling:mark-click", listener),
  }),
);
