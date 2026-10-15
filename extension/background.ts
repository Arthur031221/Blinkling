import { createHandlers } from "./handlers";
import { HelperClient, storedSecret, storeSecret } from "./helper-client";
import { readablePage, targetTab } from "./targets";
import { trustSender } from "./trust";

/**
 * The companion's service worker. It keeps one authenticated link to the
 * Blinkling bridge, answers the bridge's requests about the page the user is
 * looking at and tells the popup what is connected.
 */
const handlers = createHandlers({
  call: (message, timeoutMs) => client.call(message, timeoutMs),
});
const client: HelperClient = new HelperClient(handlers);

const SECRET = /^[0-9a-f]{64}$/;
const SELF = chrome.runtime.getURL("");

async function status() {
  const target = await targetTab().catch(() => undefined);
  const connected = client.connected;
  return {
    trusted: Boolean(await storedSecret()),
    connected,
    blink: connected ? await client.blinkRunning() : undefined,
    pageReadable: Boolean(target && readablePage(target.tab.url)),
  };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "blinkling:trust") {
    if (
      typeof message.secret !== "string" ||
      !SECRET.test(message.secret) ||
      !trustSender(sender, Number(message.port), chrome.runtime.id)
    ) {
      respond({ ok: false });
      return;
    }
    void storeSecret(message.secret)
      .then(() => client.reconnect())
      .then(() => respond({ ok: client.connected }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  // The popup is the only page of ours that asks for these.
  if (!sender.url?.startsWith(SELF)) return;
  if (message?.type === "blinkling:status") {
    void status().then(respond);
    return true;
  }
  if (message?.type === "blinkling:wake") {
    void client
      .call({ type: "wake" }, 15_000)
      .then((reply) => respond({ ok: reply?.ok === true }));
    return true;
  }
});

// The service worker is stopped when idle; these bring the link back.
const wake = () => void client.wake();
chrome.runtime.onStartup.addListener(wake);
chrome.runtime.onInstalled.addListener(wake);
chrome.alarms.create("blinkling:link", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "blinkling:link") wake();
});

// Tell the bridge when the page under Blink may have changed.
let lastNotice = 0;
const changed = () => {
  const now = Date.now();
  if (now - lastNotice < 400) return;
  lastNotice = now;
  client.post({ type: "page-changed" });
};
chrome.tabs.onActivated.addListener(changed);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "complete" || info.url) changed();
});
chrome.windows.onFocusChanged.addListener(changed);
chrome.windows.onBoundsChanged?.addListener(changed);

wake();
