// extension/connection.ts
var welcomeLocaleNames = {
  en: "English",
  "zh-TW": "\u7E41\u9AD4\u4E2D\u6587",
  "zh-CN": "\u7B80\u4F53\u4E2D\u6587",
  ja: "\u65E5\u672C\u8A9E",
  ko: "\uD55C\uAD6D\uC5B4",
  es: "Espa\xF1ol",
  fr: "Fran\xE7ais",
  de: "Deutsch",
  "pt-BR": "Portugu\xEAs"
};
var isWelcomeLocale = (value) => typeof value === "string" && Object.hasOwn(welcomeLocaleNames, value);
var pending = /* @__PURE__ */ new Map();
async function connectWelcome(port, code) {
  const url = `ws://127.0.0.1:${port}/extension`;
  const key = `${port}:${code}`;
  const stored = await chrome.storage.session.get([
    "bridgeSetup",
    "bridgeToken"
  ]);
  if (stored.bridgeSetup === key && typeof stored.bridgeToken === "string")
    return;
  const existing = pending.get(key);
  if (existing) return existing;
  const connection = new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("connection_timeout")),
      8e3
    );
    socket.onopen = () => socket.send(JSON.stringify({ type: "pair", code }));
    socket.onerror = () => finish(new Error("connection_failed"));
    socket.onclose = () => finish(new Error("connection_closed"));
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "error") finish(new Error("connection_failed"));
      if (message.type !== "paired" || !/^[a-f0-9]{64}$/.test(message.token || ""))
        return;
      void chrome.storage.session.set({
        bridgeToken: message.token,
        bridgeUrl: url,
        bridgeMode: message.mode === "tunnel" ? "tunnel" : "direct",
        bridgeSetup: key
      }).then(
        () => finish(),
        () => finish(new Error("connection_failed"))
      );
    };
  });
  pending.set(key, connection);
  try {
    await connection;
  } finally {
    pending.delete(key);
  }
}
async function saveWelcomeLocale(value) {
  if (!isWelcomeLocale(value)) return;
  const stored = await chrome.storage.local.get("locale");
  if (!isWelcomeLocale(stored.locale))
    await chrome.storage.local.set({ locale: value });
}

// extension/background.ts
var panelUrl = () => chrome.runtime.getURL("panel.html");
var readerUrl = () => chrome.runtime.getURL("reader.html");
async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch {
  }
}
async function openPanel(source) {
  const [existing] = await chrome.tabs.query({ url: `${panelUrl()}*` });
  if (existing?.id !== void 0) {
    if (source?.id !== void 0) await injectContent(source.id);
    if (existing.windowId !== void 0) {
      const owner = await chrome.windows.get(existing.windowId).catch(() => void 0);
      if (owner?.state === "minimized")
        await chrome.windows.update(existing.windowId, {
          state: "normal",
          focused: true
        });
    }
    await chrome.runtime.sendMessage({ type: "glimpselet:focus", sourceTab: source?.id }).catch(() => {
    });
    return;
  }
  const target = new URL(panelUrl());
  if (source?.id !== void 0) {
    target.searchParams.set("sourceTab", String(source.id));
    await injectContent(source.id);
  }
  await chrome.windows.create({
    url: target.toString(),
    type: "popup",
    width: 420,
    height: 620,
    focused: true
  });
}
chrome.action.onClicked.addListener((tab) => {
  void openPanel(tab);
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.tabs.query({ url: ["http://127.0.0.1/install*", "http://localhost/install*"] }).then((tabs) => {
    for (const tab of tabs)
      if (tab.id !== void 0) void injectContent(tab.id);
  });
});
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-glimpselet") {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    void openPanel(tab);
  }
  if (command === "crop-screen" || command === "crop-global") {
    chrome.runtime.sendMessage({ type: "glimpselet:command", command: "crop-screen" }).catch(() => {
    });
  }
  if (command === "pause-passive")
    chrome.runtime.sendMessage({ type: "glimpselet:command", command }).catch(() => {
    });
});
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message?.type === "glimpselet:open") {
      void openPanel().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "glimpselet:inject-content" && sender.tab?.id !== void 0) {
      void injectContent(sender.tab.id).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "glimpselet:open-reader" && typeof message.url === "string") {
      const target = new URL(chrome.runtime.getURL("reader.html"));
      target.searchParams.set("url", message.url);
      void chrome.tabs.create({ url: target.toString() }).then(
        (tab) => sendResponse({ ok: true, tabId: tab.id }),
        () => sendResponse({ ok: false })
      );
      return true;
    }
    if (message?.type === "glimpselet:reader-permission-handoff" && sender.tab?.url?.split(/[?#]/, 1)[0] === readerUrl()) {
      let interrupted = false;
      void (async () => {
        const panels = await chrome.tabs.query({ url: `${panelUrl()}*` });
        if (!panels.length) return false;
        const response = await chrome.runtime.sendMessage({ type: "glimpselet:reader-permission-handoff" }).catch(() => void 0);
        if (!response?.ok) throw new Error("reader_handoff_unconfirmed");
        interrupted = response.interrupted === true;
        const panel = panels.find(
          (tab) => tab.windowId !== void 0
        );
        if (panel?.windowId !== void 0) {
          const owner = await chrome.windows.get(panel.windowId).catch(() => void 0);
          if (owner?.type === "popup" && owner.state !== "minimized") {
            await chrome.windows.update(panel.windowId, { state: "minimized" });
            interrupted = true;
          }
        }
        return interrupted;
      })().then((interrupted2) => sendResponse({ ok: true, interrupted: interrupted2 })).catch(
        () => sendResponse(
          interrupted ? { ok: false, interrupted } : { ok: false }
        )
      );
      return true;
    }
    if (message?.type === "glimpselet:open-bubble" && sender.tab?.url) {
      let source;
      try {
        source = new URL(sender.tab.url);
      } catch {
        return false;
      }
      if (source.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(source.hostname) || source.username !== "" || source.password !== "" || source.pathname !== "/install")
        return false;
      void saveWelcomeLocale(message.locale).then(() => openPanel()).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message?.type === "glimpselet:pair" && sender.tab?.url) {
      let senderUrl;
      try {
        senderUrl = new URL(sender.tab.url);
      } catch {
        sendResponse({ ok: false, error: "invalid_pair_request" });
        return false;
      }
      const port = Number(message.port);
      const code = message.code;
      const validHost = (senderUrl.hostname === "localhost" || senderUrl.hostname === "127.0.0.1") && senderUrl.protocol === "http:" && senderUrl.username === "" && senderUrl.password === "";
      if (!validHost || senderUrl.pathname !== "/install" || port !== Number(senderUrl.port || 80) || !Number.isInteger(port) || port < 1 || port > 65535 || typeof code !== "string" || !/^[A-F0-9]{16}$/.test(code)) {
        sendResponse({ ok: false, error: "invalid_pair_request" });
        return false;
      }
      void connectWelcome(port, code).then(
        () => chrome.runtime.sendMessage({ type: "glimpselet:connection-updated" }).catch(() => {
        })
      ).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  }
);
