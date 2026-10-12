import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeClient, type AskInput } from "./api";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  sent: Array<Record<string, unknown>> = [];
  constructor(readonly url: string) {
    Socket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
const question: AskInput = {
  id: "question",
  question: "Where is Export?",
  kind: "ask",
  model: "sonnet",
  effort: "medium",
};

describe("paired browser bridge", () => {
  let client: BridgeClient;
  beforeEach(async () => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("chrome", {
      storage: { session: { get: async () => ({ bridgeToken: "token" }) } },
    });
    client = new BridgeClient();
    await client.load();
  });
  afterEach(() => {
    client.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("waits for pairing and renders every streaming chunk cumulatively", async () => {
    const socket = Socket.instances[0];
    const connected = vi.fn();
    client.addEventListener("connected", connected);
    socket.open();
    expect(connected).not.toHaveBeenCalled();
    socket.receive({
      type: "paired",
      sessionId: "live",
      liveAvailable: true,
      live: true,
    });
    expect(connected).toHaveBeenCalledOnce();
    expect(client.live).toBe(true);
    const delta = vi.fn();
    const answer = client.ask(question, delta);
    socket.receive({ type: "delta", id: question.id, text: "Export " });
    socket.receive({
      type: "delta",
      id: question.id,
      text: "is on the right.",
    });
    expect(delta.mock.calls.map(([text]) => text)).toEqual([
      "Export ",
      "Export is on the right.",
    ]);
    socket.receive({
      type: "done",
      id: question.id,
      answer: "Export is on the right.",
    });
    await expect(answer).resolves.toMatchObject({
      answer: "Export is on the right.",
    });
  });
  it("rejects interrupted requests and restores the live session identity on reconnect", async () => {
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({
      type: "paired",
      sessionId: "live",
      liveAvailable: true,
      live: true,
    });
    const answer = client.ask(question, () => {});
    const rejected = expect(answer).rejects.toThrow("bridge_disconnected");
    socket.close();
    await rejected;
    expect(client.liveAvailable).toBe(false);
    await expect(client.request("sessions")).rejects.toThrow(
      "bridge_disconnected",
    );
    await vi.advanceTimersByTimeAsync(500);
    const replacement = Socket.instances[1];
    replacement.open();
    expect(replacement.sent[0]).toEqual({ type: "pair", token: "token" });
    replacement.receive({
      type: "paired",
      sessionId: "live",
      liveAvailable: true,
      live: true,
    });
    expect(client.sessionId).toBe("live");
    expect(client.liveAvailable).toBe(true);
    expect(client.live).toBe(true);
  });
});
