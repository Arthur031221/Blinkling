export const welcomeLocaleNames = {
  en: "English",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português",
};
export const isWelcomeLocale = (
  value: unknown,
): value is keyof typeof welcomeLocaleNames =>
  typeof value === "string" && Object.hasOwn(welcomeLocaleNames, value);

const pending = new Map<string, Promise<void>>();
/** Authenticate only with a capability issued by the local welcome page. */
export async function connectWelcome(
  port: number,
  code: string,
): Promise<void> {
  const url = `ws://127.0.0.1:${port}/extension`;
  const key = `${port}:${code}`;
  const stored = await chrome.storage.session.get([
    "bridgeSetup",
    "bridgeToken",
  ]);
  if (stored.bridgeSetup === key && typeof stored.bridgeToken === "string")
    return;
  const existing = pending.get(key);
  if (existing) return existing;
  const connection = new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("connection_timeout")),
      8000,
    );
    socket.onopen = () => socket.send(JSON.stringify({ type: "pair", code }));
    socket.onerror = () => finish(new Error("connection_failed"));
    socket.onclose = () => finish(new Error("connection_closed"));
    socket.onmessage = (event) => {
      let message: { type?: string; token?: string; mode?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "error") finish(new Error("connection_failed"));
      if (
        message.type !== "paired" ||
        !/^[a-f0-9]{64}$/.test(message.token || "")
      )
        return;
      void chrome.storage.session
        .set({
          bridgeToken: message.token,
          bridgeUrl: url,
          bridgeMode: message.mode === "tunnel" ? "tunnel" : "direct",
          bridgeSetup: key,
        })
        .then(
          () => finish(),
          () => finish(new Error("connection_failed")),
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

export async function saveWelcomeLocale(value: unknown): Promise<void> {
  if (!isWelcomeLocale(value)) return;
  const stored = await chrome.storage.local.get("locale");
  if (!isWelcomeLocale(stored.locale))
    await chrome.storage.local.set({ locale: value });
}
