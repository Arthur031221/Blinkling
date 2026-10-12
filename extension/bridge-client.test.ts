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
      storage: {
        session: {
          get: async () => ({ bridgeToken: "token" }),
          set: vi.fn(async () => {}),
        },
      },
    });
    client = new BridgeClient();
    await client.load();
  });
  afterEach(() => {
    client.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("preserves a bridge error code and readable message for localized recovery", async () => {
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({ type: "paired", token: "token" });
    const pending = client.ask(question, () => {});
    const rejected = expect(pending).rejects.toMatchObject({
      code: "session_initialization",
      message: "Choose New session to try again.",
    });
    socket.receive({
      type: "error",
      id: question.id,
      code: "session_initialization",
      message: "Choose New session to try again.",
    });
    await rejected;
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

  async function pairReplacement(url = "ws://127.0.0.1:41002/extension") {
    const paired = client.pair("BBBBBBBBBBBBBBBB", url);
    const socket = Socket.instances.at(-1)!;
    socket.open();
    socket.receive({
      type: "paired",
      token: "new-token",
      project: "/project/NEW",
      sessionId: "new-session",
      liveAvailable: true,
      live: true,
    });
    await paired;
    return socket;
  }

  for (const url of [
    "ws://127.0.0.1:41002/extension",
    "ws://127.0.0.1:37115/extension",
  ]) {
    it(`routes re-paired questions only through the authenticated replacement at ${url}`, async () => {
      const old = Socket.instances[0];
      old.open();
      old.receive({
        type: "paired",
        project: "/project/OLD",
        sessionId: "old-session",
      });
      const replacement = await pairReplacement(url);
      const answer = client.ask(question, () => {});
      const rejected = expect(answer).rejects.toThrow("cancelled");
      void rejected.catch(() => {});
      expect(replacement.sent.at(-1)).toMatchObject({
        type: "ask",
        question: question.question,
      });
      expect(old.sent.some((message) => message.type === "ask")).toBe(false);
      expect(old.readyState).toBe(3);
      expect(client.project).toBe("/project/NEW");
      expect(client.sessionId).toBe("new-session");
      client.cancel(question.id);
      await rejected;
    });
  }

  it("retires old requests and ignores delayed events from the old socket", async () => {
    const old = Socket.instances[0];
    old.open();
    old.receive({
      type: "paired",
      project: "/project/OLD",
      sessionId: "old-session",
    });
    const oldClose = old.onclose!;
    const oldMessage = old.onmessage!;
    const oldError = old.onerror!;
    const interrupted = client.ask(
      { ...question, id: "old-question" },
      () => {},
    );
    const rejected = expect(interrupted).rejects.toThrow("bridge_disconnected");
    void rejected.catch(() => {});
    const replacement = await pairReplacement();
    await rejected;
    const disconnected = vi.fn();
    client.addEventListener("disconnected", disconnected);
    const answer = client.ask(question, () => {});
    oldMessage({
      data: JSON.stringify({
        type: "paired",
        project: "/project/OLD",
        sessionId: "old-session",
      }),
    });
    oldClose();
    oldError();
    replacement.receive({
      type: "done",
      id: question.id,
      answer: "New conversation",
    });
    await expect(answer).resolves.toMatchObject({ answer: "New conversation" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.project).toBe("/project/NEW");
    expect(client.sessionId).toBe("new-session");
    expect(client.liveAvailable).toBe(true);
    expect(disconnected).not.toHaveBeenCalled();
    expect(Socket.instances).toHaveLength(2);
  });

  it("keeps the previous connection and reconnect destination when pairing fails", async () => {
    const old = Socket.instances[0];
    old.open();
    old.receive({
      type: "paired",
      project: "/project/OLD",
      sessionId: "old-session",
    });
    const paired = client.pair(
      "BBBBBBBBBBBBBBBB",
      "ws://127.0.0.1:41002/extension",
    );
    const rejected = expect(paired).rejects.toThrow("pair_timeout");
    await vi.advanceTimersByTimeAsync(8000);
    await rejected;
    expect(old.readyState).toBe(Socket.OPEN);
    expect(client.project).toBe("/project/OLD");
    expect(client.sessionId).toBe("old-session");
    old.close();
    await vi.advanceTimersByTimeAsync(500);
    const replacement = Socket.instances.at(-1)!;
    expect(replacement.url).toBe("ws://127.0.0.1:37115/extension");
    replacement.open();
    expect(replacement.sent[0]).toEqual({ type: "pair", token: "token" });
  });

  it("clears an old reconnect timer when re-pairing succeeds", async () => {
    const old = Socket.instances[0];
    old.open();
    old.receive({ type: "paired" });
    old.close();
    const replacement = await pairReplacement();
    await vi.advanceTimersByTimeAsync(1000);
    expect(Socket.instances).toHaveLength(2);
    expect(replacement.readyState).toBe(Socket.OPEN);
    expect(client.sessionId).toBe("new-session");
  });

  it("closes a pending pairing handshake without reopening a closed client", async () => {
    const paired = client.pair("BBBBBBBBBBBBBBBB");
    const rejected = expect(paired).rejects.toThrow("bridge_disconnected");
    const handshake = Socket.instances.at(-1)!;
    client.close();
    await rejected;
    expect(handshake.readyState).toBe(3);
    handshake.receive({
      type: "paired",
      token: "late-token",
      project: "/project/LATE",
    });
    expect(client.project).not.toBe("/project/LATE");
    await vi.advanceTimersByTimeAsync(8000);
    expect(Socket.instances).toHaveLength(2);
  });

  it("cancels an older pairing attempt before accepting the latest one", async () => {
    const earlier = client.pair(
      "AAAAAAAAAAAAAAAA",
      "ws://127.0.0.1:41001/extension",
    );
    const rejected = expect(earlier).rejects.toThrow("bridge_disconnected");
    const retired = Socket.instances.at(-1)!;
    const replacement = await pairReplacement();
    await rejected;
    retired.receive({
      type: "paired",
      token: "old-token",
      project: "/project/OLD",
    });
    expect(retired.readyState).toBe(3);
    expect(replacement.readyState).toBe(Socket.OPEN);
    expect(client.project).toBe("/project/NEW");
    expect(chrome.storage.session.set).toHaveBeenLastCalledWith({
      bridgeToken: "new-token",
      bridgeMode: "direct",
      bridgeUrl: replacement.url,
    });
  });

  it("persists accepted pairings in order while the earlier storage write is delayed", async () => {
    let release!: () => void;
    vi.mocked(chrome.storage.session.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = pairReplacement("ws://127.0.0.1:41001/extension");
    await Promise.resolve();
    await Promise.resolve();
    const second = pairReplacement("ws://127.0.0.1:41002/extension");
    await Promise.resolve();
    expect(chrome.storage.session.set).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(chrome.storage.session.set).toHaveBeenCalledTimes(2);
    expect(chrome.storage.session.set).toHaveBeenLastCalledWith({
      bridgeToken: "new-token",
      bridgeMode: "direct",
      bridgeUrl: "ws://127.0.0.1:41002/extension",
    });
    expect(Socket.instances.at(-1)!.readyState).toBe(Socket.OPEN);
  });

  it("does not report pairing success after shutdown during persistence", async () => {
    let release!: () => void;
    vi.mocked(chrome.storage.session.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const paired = pairReplacement();
    const rejected = expect(paired).rejects.toThrow("bridge_disconnected");
    await Promise.resolve();
    await Promise.resolve();
    client.close();
    release();
    await rejected;
    expect(Socket.instances.at(-1)!.readyState).toBe(3);
  });
});
