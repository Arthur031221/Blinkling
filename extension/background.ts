const panelUrl = () => chrome.runtime.getURL("panel.html");
const readerUrl = () => chrome.runtime.getURL("reader.html");
type BrowserTab = { id?: number; url?: string; windowId?: number };
type MessageSender = { tab?: { id?: number; url?: string; windowId?: number } };
async function injectContent(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    /* restricted browser pages stay capture-only */
  }
}
async function openPanel(source?: BrowserTab): Promise<void> {
  const [existing] = await chrome.tabs.query({ url: `${panelUrl()}*` });
  if (existing?.id !== undefined) {
    if (source?.id !== undefined) await injectContent(source.id);
    if (existing.windowId !== undefined) {
      const owner = await chrome.windows
        .get(existing.windowId)
        .catch(() => undefined);
      if (owner?.state === "minimized")
        await chrome.windows.update(existing.windowId, {
          state: "normal",
          focused: true,
        });
    }
    await chrome.runtime
      .sendMessage({ type: "glimpselet:focus", sourceTab: source?.id })
      .catch(() => {});
    return;
  }
  const target = new URL(panelUrl());
  if (source?.id !== undefined) {
    target.searchParams.set("sourceTab", String(source.id));
    await injectContent(source.id);
  }
  await chrome.windows.create({
    url: target.toString(),
    type: "popup",
    width: 420,
    height: 620,
    focused: true,
  });
}
chrome.action.onClicked.addListener((tab: BrowserTab) => {
  void openPanel(tab);
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.tabs
    .query({ url: ["http://127.0.0.1/install*", "http://localhost/install*"] })
    .then((tabs: BrowserTab[]) => {
      for (const tab of tabs)
        if (tab.id !== undefined) void injectContent(tab.id);
    });
});
chrome.commands.onCommand.addListener(async (command: string) => {
  if (command === "open-glimpselet") {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    void openPanel(tab);
  }
  if (command === "crop-screen" || command === "crop-global") {
    chrome.runtime
      .sendMessage({ type: "glimpselet:command", command: "crop-screen" })
      .catch(() => {});
  }
  if (command === "pause-passive")
    chrome.runtime
      .sendMessage({ type: "glimpselet:command", command })
      .catch(() => {});
});

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; url?: string },
    sender: MessageSender,
    sendResponse: (value?: unknown) => void,
  ) => {
    if (message?.type === "glimpselet:open") {
      void openPanel().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (
      message?.type === "glimpselet:inject-content" &&
      sender.tab?.id !== undefined
    ) {
      void injectContent(sender.tab.id).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (
      message?.type === "glimpselet:open-reader" &&
      typeof message.url === "string"
    ) {
      const target = new URL(chrome.runtime.getURL("reader.html"));
      target.searchParams.set("url", message.url);
      void chrome.tabs.create({ url: target.toString() }).then(
        (tab) => sendResponse({ ok: true, tabId: tab.id }),
        () => sendResponse({ ok: false }),
      );
      return true;
    }
    if (
      message?.type === "glimpselet:reader-permission-handoff" &&
      sender.tab?.url?.split(/[?#]/, 1)[0] === readerUrl()
    ) {
      let interrupted = false;
      void (async () => {
        const panels = await chrome.tabs.query({ url: `${panelUrl()}*` });
        if (!panels.length) return false;
        // The panel owns any document PiP window. Require its acknowledgement
        // before reporting readiness, so the reader cannot open a prompt while
        // an unclosed PiP window may still cover Chromium's permission UI.
        const response = (await chrome.runtime
          .sendMessage({ type: "glimpselet:reader-permission-handoff" })
          .catch(() => undefined)) as
          | { ok?: boolean; interrupted?: boolean }
          | undefined;
        if (!response?.ok) throw new Error("reader_handoff_unconfirmed");
        interrupted = response.interrupted === true;
        const panel = panels.find(
          (tab: BrowserTab) => tab.windowId !== undefined,
        );
        if (panel?.windowId !== undefined) {
          const owner = await chrome.windows
            .get(panel.windowId)
            .catch(() => undefined);
          if (owner?.type === "popup" && owner.state !== "minimized") {
            await chrome.windows.update(panel.windowId, { state: "minimized" });
            interrupted = true;
          }
        }
        return interrupted;
      })()
        .then((interrupted) => sendResponse({ ok: true, interrupted }))
        .catch(() =>
          sendResponse(
            interrupted ? { ok: false, interrupted } : { ok: false },
          ),
        );
      return true;
    }
    if (message?.type === "glimpselet:pair" && sender.tab?.url) {
      let senderUrl: URL;
      try {
        senderUrl = new URL(sender.tab.url);
      } catch {
        sendResponse({ ok: false, error: "invalid_pair_request" });
        return false;
      }
      const port = Number((message as { port?: unknown }).port);
      const code = (message as { code?: unknown }).code;
      const validHost =
        (senderUrl.hostname === "localhost" ||
          senderUrl.hostname === "127.0.0.1") &&
        senderUrl.protocol === "http:" &&
        senderUrl.username === "" &&
        senderUrl.password === "";
      if (
        !validHost ||
        senderUrl.pathname !== "/install" ||
        port !== Number(senderUrl.port || 80) ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        typeof code !== "string" ||
        !/^[A-F0-9]{16}$/.test(code)
      ) {
        sendResponse({ ok: false, error: "invalid_pair_request" });
        return false;
      }
      const target = new URL(panelUrl());
      target.searchParams.set("pairPort", String(port));
      target.searchParams.set("pairCode", code);
      const locale = (message as { locale?: unknown }).locale;
      if (locale === "en" || locale === "zh-TW")
        target.searchParams.set("welcomeLocale", locale);
      void chrome.tabs
        .query({ url: `${panelUrl()}*` })
        .then(async ([existing]) => {
          if (existing?.id !== undefined) {
            await chrome.tabs.update(existing.id, {
              url: target.toString(),
              active: true,
            });
            if (existing.windowId !== undefined)
              await chrome.windows.update(existing.windowId, { focused: true });
          } else
            await chrome.windows.create({
              url: target.toString(),
              type: "popup",
              width: 420,
              height: 620,
              focused: true,
            });
          sendResponse({ ok: true });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  },
);
