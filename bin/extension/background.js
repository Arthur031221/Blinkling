// extension/background.ts
var panelUrl = () => chrome.runtime.getURL("panel.html");
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
      void chrome.tabs.create({ url: target.toString() }).then(() => sendResponse({ ok: true }));
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
      const target = new URL(panelUrl());
      target.searchParams.set("pairPort", String(port));
      target.searchParams.set("pairCode", code);
      void chrome.tabs.query({ url: `${panelUrl()}*` }).then(async ([existing]) => {
        if (existing?.id !== void 0) {
          await chrome.tabs.update(existing.id, {
            url: target.toString(),
            active: true
          });
          if (existing.windowId !== void 0)
            await chrome.windows.update(existing.windowId, { focused: true });
        } else
          await chrome.windows.create({
            url: target.toString(),
            type: "popup",
            width: 420,
            height: 620,
            focused: true
          });
        sendResponse({ ok: true });
      }).catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  }
);
