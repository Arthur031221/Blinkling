import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectWelcome,
  saveWelcomeLocale,
  welcomeLocaleNames,
} from "./connection";
class Socket {
  static instances: Socket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  sent: string[] = [];
  constructor(readonly url: string) {
    Socket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}
let session: Record<string, unknown>, local: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  session = {};
  local = {};
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: vi.fn(async () => session),
        set: vi.fn(async (value) => {
          session = value;
        }),
      },
      local: {
        get: vi.fn(async () => local),
        set: vi.fn(async (value) => {
          local = value;
        }),
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("worker welcome handshake", () => {
  it("deduplicates concurrent handshakes and saves credentials only after authentication", async () => {
    const first = connectWelcome(37115, "ABCDEF0123456789");
    const second = connectWelcome(37115, "ABCDEF0123456789");
    await Promise.resolve();
    await Promise.resolve();
    expect(Socket.instances).toHaveLength(1);
    const socket = Socket.instances[0];
    socket.onopen?.();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "pair",
      code: "ABCDEF0123456789",
    });
    socket.onmessage?.({
      data: JSON.stringify({ type: "paired", token: "bad" }),
    });
    expect(session).toEqual({});
    socket.onmessage?.({
      data: JSON.stringify({
        type: "paired",
        token: "a".repeat(64),
        mode: "tunnel",
      }),
    });
    await Promise.all([first, second]);
    expect(session).toEqual({
      bridgeSetup: "37115:ABCDEF0123456789",
      bridgeUrl: "ws://127.0.0.1:37115/extension",
      bridgeToken: "a".repeat(64),
      bridgeMode: "tunnel",
    });
    await connectWelcome(37115, "ABCDEF0123456789");
    expect(Socket.instances).toHaveLength(1);
  });
  it("expires an unanswered handshake without saving a token, and can retry", async () => {
    const first = connectWelcome(37115, "ABCDEF0123456789");
    const rejection = expect(first).rejects.toThrow("connection_timeout");
    await vi.advanceTimersByTimeAsync(8000);
    await rejection;
    expect(session).toEqual({});
    const second = connectWelcome(37115, "ABCDEF0123456789");
    const retryRejection = expect(second).rejects.toThrow("connection_failed");
    await Promise.resolve();
    Socket.instances[1].onerror?.();
    await retryRejection;
  });
  it.each(Object.keys(welcomeLocaleNames))(
    "saves %s only when no valid preference exists",
    async (locale) => {
      await saveWelcomeLocale(locale);
      expect(local.locale).toBe(locale);
      await saveWelcomeLocale(locale === "en" ? "ja" : "en");
      expect(local.locale).toBe(locale);
      local.locale = "invalid";
      await saveWelcomeLocale(locale);
      expect(local.locale).toBe(locale);
    },
  );
  it.each(["constructor", "zh", "", undefined, {}])(
    "ignores unsupported locale %j",
    async (locale) => {
      await saveWelcomeLocale(locale);
      expect(local).toEqual({});
    },
  );
});
