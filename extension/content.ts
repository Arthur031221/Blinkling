/** Runs only on Blink's own local install page. It carries two things between
 * that page and the extension's worker: the one-time setup link, which the
 * user never sees, and the "Wake Blink" click. */
const onInstallPage =
  location.protocol === "http:" &&
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  location.pathname === "/install";

if (onInstallPage) {
  const send = (message: unknown) =>
    chrome.runtime.sendMessage(message).catch(() => undefined);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const value = event.data;
    if (value?.type === "blinkling:hello") {
      window.postMessage(
        { type: "blinkling:extension-ready" },
        location.origin,
      );
      return;
    }
    if (value?.type === "blinkling:wake") {
      void send({ type: "blinkling:wake" });
      return;
    }
    if (
      value?.type !== "blinkling:pair" ||
      typeof value.code !== "string" ||
      !/^[A-F0-9]{16}$/.test(value.code) ||
      Number(value.port) !== Number(location.port || 80)
    )
      return;
    void send({
      type: "blinkling:pair",
      port: Number(value.port),
      code: value.code,
    }).then((result) =>
      window.postMessage(
        {
          type: result?.ok ? "blinkling:paired" : "blinkling:connection-failed",
        },
        location.origin,
      ),
    );
  });
  window.postMessage({ type: "blinkling:extension-ready" }, location.origin);
}
