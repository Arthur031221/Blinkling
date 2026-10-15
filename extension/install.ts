/**
 * Runs only on the bridge's own setup page (see manifest). The page receives the
 * trust secret from the bridge and hands it here; this script passes it on to
 * the background worker. Nobody ever sees or types it.
 */
const onInstallPage =
  location.protocol === "http:" &&
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  location.pathname === "/install";

if (onInstallPage) {
  const send = (message: Record<string, unknown>) =>
    chrome.runtime.sendMessage(message).catch(() => undefined);
  const tell = (type: string) => window.postMessage({ type }, location.origin);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const value = event.data;
    if (value?.type === "blinkling:hello") {
      tell("blinkling:extension-ready");
      return;
    }
    if (
      value?.type !== "blinkling:trust" ||
      typeof value.secret !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.secret) ||
      Number(value.port) !== Number(location.port || 80)
    )
      return;
    void send({
      type: "blinkling:trust",
      secret: value.secret,
      port: Number(value.port),
    }).then((result) =>
      tell(result?.ok ? "blinkling:trusted" : "blinkling:trust-failed"),
    );
  });
  // The page may have asked before this script was listening.
  tell("blinkling:extension-ready");
}
