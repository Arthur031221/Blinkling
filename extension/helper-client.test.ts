import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELPER_FIRST_PORT,
  HelperClient,
  inHelperRange,
  proof,
  storedSecret,
  storeSecret,
} from "./helper-client";

const SECRET = "ab".repeat(32);
const CHALLENGE = "cd".repeat(16);

type Sent = { type: string; nonce: string; [key: string]: unknown };

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  sent: Sent[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

let store: Record<string, unknown>;
beforeEach(() => {
  store = {};
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (values: Record<string, unknown>) =>
          Object.assign(store, values),
        ),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const until = (check: () => unknown) =>
  vi.waitFor(() => expect(check()).toBeTruthy());

async function connect(secret = SECRET, serverSecret = SECRET) {
  await storeSecret(secret);
  const handle = vi.fn(async () => ({ ok: true }));
  const client = new HelperClient({ handle });
  const waking = client.wake();
  await until(() => FakeSocket.instances[0]);
  const socket = FakeSocket.instances[0]!;
  socket.receive({ type: "challenge", nonce: CHALLENGE });
  await until(() => socket.sent[0]);
  const hello = socket.sent[0];
  expect(hello.type).toBe("hello");
  expect(hello.proof).toBe(
    await proof(secret, "client", CHALLENGE, hello.nonce),
  );
  socket.receive({
    type: "ready",
    proof: await proof(serverSecret, "server", hello.nonce, CHALLENGE),
  });
  return { client, socket, handle, waking };
}

describe("helper link", () => {
  it("only talks to the bridge's port range", () => {
    expect(inHelperRange(HELPER_FIRST_PORT)).toBe(true);
    expect(inHelperRange(HELPER_FIRST_PORT + 9)).toBe(true);
    expect(inHelperRange(HELPER_FIRST_PORT + 10)).toBe(false);
    expect(inHelperRange(80)).toBe(false);
  });

  it("stores only a well-formed secret", async () => {
    expect(await storedSecret()).toBeUndefined();
    await storeSecret("short");
    expect(await storedSecret()).toBeUndefined();
    await storeSecret(SECRET);
    expect(await storedSecret()).toBe(SECRET);
  });

  it("does nothing without a secret", async () => {
    const client = new HelperClient({ handle: vi.fn() });
    await client.wake();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(client.connected).toBe(false);
  });

  it("connects after the mutual proof and answers a request with its result", async () => {
    const { client, socket, handle, waking } = await connect();
    await waking;
    expect(client.connected).toBe(true);
    expect(socket.url).toBe(`ws://127.0.0.1:${HELPER_FIRST_PORT}/extension`);
    socket.receive({ type: "elements", id: "r1" });
    await until(() => socket.sent.some((m) => m.type === "elements-result"));
    expect(handle).toHaveBeenCalled();
    expect(socket.sent.at(-1)).toEqual({
      type: "elements-result",
      id: "r1",
      ok: true,
    });
    client.stop();
  });

  it("refuses a bridge that does not hold the secret", async () => {
    await storeSecret(SECRET);
    const client = new HelperClient({ handle: vi.fn() });
    void client.wake();
    await until(() => FakeSocket.instances[0]);
    const socket = FakeSocket.instances[0]!;
    socket.receive({ type: "challenge", nonce: CHALLENGE });
    await until(() => socket.sent[0]);
    socket.receive({
      type: "ready",
      proof: await proof(
        "00".repeat(32),
        "server",
        socket.sent[0].nonce,
        CHALLENGE,
      ),
    });
    await until(() => socket.readyState === 3);
    expect(client.connected).toBe(false);
    client.stop();
  });

  it("aborts a running request when the bridge cancels it and reports failures", async () => {
    await storeSecret(SECRET);
    let signal!: AbortSignal;
    const handle = vi.fn(async (_r: unknown, c: { signal: AbortSignal }) => {
      signal = c.signal;
      await new Promise((resolve) =>
        c.signal.addEventListener("abort", resolve),
      );
      return { ok: true };
    });
    const client = new HelperClient({ handle });
    void client.wake();
    await until(() => FakeSocket.instances[0]);
    const socket = FakeSocket.instances[0]!;
    socket.receive({ type: "challenge", nonce: CHALLENGE });
    await until(() => socket.sent[0]);
    socket.receive({
      type: "ready",
      proof: await proof(SECRET, "server", socket.sent[0].nonce, CHALLENGE),
    });
    await until(() => client.connected);
    socket.receive({ type: "full-page", id: "f1" });
    await until(() => handle.mock.calls.length);
    socket.receive({ type: "full-page-cancel", id: "f1" });
    await until(() => signal.aborted);
    // A cancelled request sends no result.
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.sent.some((m) => m.type === "full-page-result")).toBe(false);
    client.stop();
  });

  it("matches a call to its result by id", async () => {
    const { client, socket, waking } = await connect();
    await waking;
    const call = client.call({ type: "wake" });
    await until(() => socket.sent.some((m) => m.type === "wake"));
    const sent = socket.sent.find((m) => m.type === "wake");
    socket.receive({ type: "wake-result", id: sent.id, ok: true });
    expect(await call).toMatchObject({ ok: true });
    client.stop();
  });
});
