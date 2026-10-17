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
    interactive: (regions, parts) =>
      ipcRenderer.send("blinkling:regions", regions, parts),
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
    switchChat: (key) => ipcRenderer.invoke("blinkling:chat-switch", key),
    onCapture: (listener) => {
      const remove = subscribe("blinkling:capture", listener);
      ipcRenderer.send("blinkling:composer-ready");
      return remove;
    },
    onSurface: (listener) => subscribe("blinkling:surface", listener),
    dropFiles: (attachments) =>
      ipcRenderer.invoke("blinkling:drop-files", attachments),
    typing: (value) => ipcRenderer.send("blinkling:typing", value),
    engage: (value) => ipcRenderer.send("blinkling:engage", value),
    cardSize: (height) => ipcRenderer.send("blinkling:card-size", { height }),
    replay: () => ipcRenderer.send("blinkling:subscribe"),
    hold: (value) => ipcRenderer.send("blinkling:hold", value),
    quick: (value) => ipcRenderer.send("blinkling:quick", value),
    nudge: (value) => ipcRenderer.send("blinkling:nudge", value),
    cardResize: (value) => ipcRenderer.send("blinkling:card-resize", value),
    pin: (value) =>
      ipcRenderer.invoke("blinkling:shell", { type: "pin", value }),
    close: () => ipcRenderer.invoke("blinkling:shell", { type: "close-chat" }),
    openChat: (messageId) =>
      ipcRenderer.invoke("blinkling:open-chat", messageId),
    viewImage: (image) => ipcRenderer.send("blinkling:view-image", image),
    openLink: (url) => ipcRenderer.invoke("blinkling:open-link", url),
    referenceHover: (value) =>
      ipcRenderer.send("blinkling:reference-hover", value),
    onMarkClick: (listener) => subscribe("blinkling:mark-click", listener),
  }),
);
