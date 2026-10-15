import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelperLink } from "./link";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen?: () => void;
  onclose?: (e: { code: number }) => void;
  onerror?: () => void;
  onmessage?: (e: { data: string }) => void;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const TOKEN = "a".repeat(64);
const make = (handler = vi.fn(async () => ({})), save = vi.fn()) => ({
  link: new HelperLink(
    handler,
    save,
    FakeSocket as unknown as typeof WebSocket,
  ),
  handler,
  save,
});
async function pair(link: HelperLink) {
  const opened = link.open({
    url: "ws://127.0.0.1:1/extension",
    code: "A".repeat(16),
  });
  const socket = FakeSocket.all.at(-1)!;
  socket.open();
  socket.say({ type: "paired", token: TOKEN });
  await opened;
  return socket;
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("HelperLink", () => {
  it("pairs with the code, saves the token and answers pings from then on", async () => {
    const { link, save } = make();
    const socket = await pair(link);
    expect(socket.sent[0]).toEqual({ type: "pair", code: "A".repeat(16) });
    expect(save).toHaveBeenCalledWith(TOKEN);
    expect(link.connected).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(socket.sent.at(-1)).toEqual({ type: "ping" });
  });

  it("reconnects with the stored token instead of a code", async () => {
    const { link } = make();
    const opened = link.open({ url: "ws://x", token: TOKEN });
    const socket = FakeSocket.all.at(-1)!;
    socket.open();
    expect(socket.sent[0]).toEqual({ type: "pair", token: TOKEN });
    socket.say({ type: "paired", token: TOKEN });
    await opened;
  });

  it("rejects when the bridge refuses the pairing or never answers", async () => {
    const { link } = make();
    const refused = link.open({ url: "ws://x", code: "A".repeat(16) });
    const socket = FakeSocket.all.at(-1)!;
    socket.open();
    socket.say({ type: "error", code: "pairing_expired" });
    await expect(refused).rejects.toThrow("connection_failed");
    const silent = link.open({ url: "ws://x", code: "A".repeat(16) });
    const caught = expect(silent).rejects.toThrow("connection_timeout");
    await vi.advanceTimersByTimeAsync(8000);
    await caught;
  });

  it("runs a request and sends back one result, with progress on the way", async () => {
    const handler = vi.fn(async (_r, context) => {
      context.progress(1, 2);
      return { elements: [] };
    });
    const { link } = make(handler);
    const socket = await pair(link);
    socket.say({ type: "request", id: "r1", op: "elements" });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sent.slice(-2)).toEqual([
      { type: "progress", id: "r1", completed: 1, total: 2 },
      { type: "result", id: "r1", ok: true, elements: [] },
    ]);
  });

  it("reports ok:false when a request fails", async () => {
    const { link } = make(
      vi.fn(async () => Promise.reject(new Error("restricted"))),
    );
    const socket = await pair(link);
    socket.say({ type: "request", id: "r2", op: "full-page" });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sent.at(-1)).toEqual({ type: "result", id: "r2", ok: false });
  });

  it("aborts a cancelled request and sends no result for it", async () => {
    let seen: AbortSignal | undefined;
    const handler = vi.fn(
      (_r, context) =>
        new Promise<Record<string, unknown>>((resolve) => {
          seen = context.signal;
          context.signal.addEventListener("abort", () => resolve({}));
        }),
    );
    const { link } = make(handler);
    const socket = await pair(link);
    socket.say({ type: "request", id: "r3", op: "full-page" });
    socket.say({ type: "cancel", id: "r3" });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen?.aborted).toBe(true);
    expect(socket.sent.some((m) => m.type === "result")).toBe(false);
  });

  it("matches a call to its reply by id and rejects on an error reply", async () => {
    const { link } = make();
    const socket = await pair(link);
    const wake = link.call({ type: "wake" });
    const sent = socket.sent.at(-1)!;
    socket.say({ type: "wake", id: sent.id, ok: true });
    await expect(wake).resolves.toMatchObject({ ok: true });
    const bad = link.call({ type: "translate-batch" });
    socket.say({ type: "error", id: socket.sent.at(-1)!.id, message: "nope" });
    await expect(bad).rejects.toThrow("nope");
  });

  it("times a call out and refuses calls when not connected", async () => {
    const { link } = make();
    await expect(link.call({ type: "status" })).rejects.toThrow(
      "not_connected",
    );
    await pair(link);
    const slow = link.call({ type: "status" }, 1000);
    const caught = expect(slow).rejects.toThrow("call_timeout");
    await vi.advanceTimersByTimeAsync(1000);
    await caught;
  });

  it("reconnects with backoff after a drop, but not after being replaced", async () => {
    const { link } = make();
    const first = await pair(link);
    first.readyState = 3;
    first.onclose?.({ code: 1006 });
    expect(link.connected).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[1]!.url).toBe(first.url);
    const second = FakeSocket.all[1]!;
    second.open();
    expect(second.sent[0]).toEqual({ type: "pair", token: TOKEN });
    second.say({ type: "paired", token: TOKEN });
    second.readyState = 3;
    second.onclose?.({ code: 4002 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stops reconnecting once closed on purpose", async () => {
    const { link } = make();
    await pair(link);
    link.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
