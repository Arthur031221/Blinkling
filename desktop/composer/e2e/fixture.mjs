import { app, BrowserWindow, ipcMain, screen } from "electron";
import { fileURLToPath } from "node:url";
import { keepAbove } from "../../main/x11-stacking.mjs";
import { attachmentContent } from "../attachments.mjs";
app.commandLine.appendSwitch("enable-transparent-visuals");
await app.whenReady();
const windows = [],
  turns = [],
  activities = [],
  controls = [],
  typing = [];
let selection = { model: "haiku", effort: "low" },
  active,
  streamTimer;
const emit = (event) =>
  windows.forEach((w) => w.webContents.send("glimpselet:event", event));
const live =
  process.env.GLIMPSELET_LIVE === "1"
    ? await (await import("./live-session.mjs")).liveSession(emit)
    : null;
if (live) selection = await live.select(selection);
ipcMain.handle("test:configuration", (event) => ({
  surface: event.sender === windows[1]?.webContents ? "bubbles" : "card",
  selection,
  quietMs: 850,
}));
ipcMain.handle("test:select", async (_event, value) => {
  controls.push(value);
  if (live) {
    selection = await live.select(value);
    emit({ type: "selection", applied: selection });
    return selection;
  }
  await new Promise((r) => setTimeout(r, 200));
  if (value.model === "opus") throw Error("Unsupported fixture model");
  selection = {
    model: value.model.startsWith("claude-")
      ? value.model
      : `claude-${value.model}-5-5`,
    effort: value.effort,
  };
  emit({ type: "selection", applied: selection });
  return selection;
});
ipcMain.handle("test:send", async (_event, turn) => {
  const content = attachmentContent(turn.attachments);
  turns.push({ ...turn, content });
  active = turn;
  emit({
    type: "message",
    id: turn.id,
    role: "user",
    content: [...content, { type: "text", text: turn.text }],
  });
  if (live) return live.send(turn);
  const chunks = [
    "這是 ",
    "**Glimpselet**。",
    "可以直接提問。\n\n",
    "- **重點**：保留畫面與問題\n",
    "- 下一步：繼續對話\n\n",
    "```js\nconst result = 'Blink';\n```",
  ];
  let i = 0;
  streamTimer = setInterval(() => {
    if (i < chunks.length)
      emit({ type: "delta", id: `answer:${turn.id}`, text: chunks[i++] });
    else {
      clearInterval(streamTimer);
      emit({ type: "done", turnId: turn.id });
      active = null;
    }
  }, 65);
});
ipcMain.handle("test:stop", () => {
  if (live) return live.stop();
  clearInterval(streamTimer);
  if (active) emit({ type: "done", turnId: active.id });
  active = null;
});
ipcMain.on("test:activity", (_event, value) => activities.push(value));
ipcMain.on("test:typing", (_event, value) => typing.push(value));
ipcMain.on("test:pin", (_event, value) => controls.push({ pin: value }));
ipcMain.on("test:open-chat", (_event, id) => {
  windows[1].hide();
  windows[0].show();
  windows[0].webContents.send("test:surface", { type: "open", messageId: id });
});
ipcMain.on("test:close", () => {});
const bounds = screen.getPrimaryDisplay().workArea;
for (const surface of ["card", "bubbles"]) {
  const w = new BrowserWindow({
    x: Math.max(bounds.x, bounds.x + bounds.width - 450),
    y: bounds.y + 30,
    width: 420,
    height: Math.min(680, bounds.height - 60),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    focusable: surface === "card",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  windows.push(w);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  await w.loadFile(fileURLToPath(new URL("../index.html", import.meta.url)));
}
// A real native window beneath both surfaces makes per-pixel transparency
// observable in desktopCapturer, rather than blending black with a black root.
const background = new BrowserWindow({
  ...screen.getPrimaryDisplay().bounds,
  frame: false,
  backgroundColor: "#203040",
  show: false,
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});
await background.loadURL(
  "data:text/html," +
    encodeURIComponent(
      '<body style="margin:0;background:#203040;color:#d4dee8;font:20px sans-serif;padding:60px"><h1>Desktop test window</h1><p>Blink conversation surfaces float above this native window.</p></body>',
    ),
);
background.showInactive();
windows[0].show();
const stopStacking = await keepAbove(() => windows);
emit({ type: "status", state: "connected" });
globalThis.conversationTest = {
  windows,
  turns,
  activities,
  controls,
  typing,
  emit,
  selection: () => selection,
  remoteUrl: live?.remoteUrl,
  capture: (capture) =>
    windows[0].webContents.send(
      "test:capture",
      capture.image ? capture : { image: capture },
    ),
  hover: (value) =>
    windows.forEach((w) =>
      w.webContents.send("test:surface", { type: "hover", value }),
    ),
  bubbles: () => {
    windows[0].hide();
    windows[1].showInactive();
  },
  card: () => {
    windows[1].hide();
    windows[0].show();
    windows[0].webContents.send("test:surface", { type: "open" });
  },
};
app.on("window-all-closed", () => app.quit());
let disposing = false;
app.on("before-quit", (event) => {
  if (live && !disposing) {
    event.preventDefault();
    disposing = true;
    void live.dispose().finally(() => app.quit());
  }
});
app.on("will-quit", () => {
  clearInterval(streamTimer);
  stopStacking();
});
