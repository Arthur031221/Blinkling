import type { Credentials } from "./link";

/** What pairing needs from the link, so it can be tested without a socket. */
export type Pairing = {
  open(credentials: Credentials): Promise<void>;
};

const CODE = /^[A-F0-9]{16}$/;
const pending = new Map<string, Promise<void>>();

export const bridgeUrl = (port: number) => `ws://127.0.0.1:${port}/extension`;

export async function storedCredentials(): Promise<Credentials | undefined> {
  const stored = await chrome.storage.session.get(["bridgeToken", "bridgeUrl"]);
  return typeof stored.bridgeToken === "string" &&
    /^[a-f0-9]{64}$/.test(stored.bridgeToken) &&
    typeof stored.bridgeUrl === "string"
    ? { url: stored.bridgeUrl, token: stored.bridgeToken }
    : undefined;
}

export async function saveToken(url: string, token: string, setup?: string) {
  await chrome.storage.session.set({
    bridgeToken: token,
    bridgeUrl: url,
    ...(setup ? { bridgeSetup: setup } : {}),
  });
}

/** Pairs with the one-time code the local install page hands over; the user never sees it. */
export async function connectWelcome(
  link: Pairing,
  port: number,
  code: string,
): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !CODE.test(code))
    throw new Error("connection_failed");
  const url = bridgeUrl(port);
  const key = `${port}:${code}`;
  const stored = await chrome.storage.session.get(["bridgeSetup"]);
  if (stored.bridgeSetup === key) return;
  const existing = pending.get(key);
  if (existing) return existing;
  const connection = link
    .open({ url, code })
    .then(() => chrome.storage.session.set({ bridgeSetup: key }));
  pending.set(key, connection);
  try {
    await connection;
  } finally {
    pending.delete(key);
  }
}
