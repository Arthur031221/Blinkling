import { LiveChannel } from "../src/live-channel.js";
// @vitest-environment node
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionBridge } from "../src/extension-bridge.js";
import {
  ExtensionSessions,
  ExtensionThread,
} from "../src/extension-sessions.js";
import type { ProviderRequest } from "../src/provider-request.js";
import { installGuide, tunnelCommand } from "../src/extension-install.js";

const origin = `chrome-extension://${"a".repeat(32)}`;
const sourceId = "a88b5348-a13b-42fd-9685-000000000001";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
});

async function setup(
  provider: (
    r: ProviderRequest,
  ) => Promise<{ answer: string; sessionId?: string }>,
  now = Date.now,
  persisted?: (id: string, project: string) => Promise<boolean>,
) {
  const server: Server = createServer();
  let url = "";
  const sessions = new ExtensionSessions(
    "/fixture/project",
    async () => [],
    persisted,
  );
  const bridge = new ExtensionBridge(server, () => url, {
    provider,
    sessions,
    now,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  url = `http://127.0.0.1:${address.port}`;
  cleanup.push(async () => {
    await bridge.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function client(clientOrigin = origin) {
    const socket = new WebSocket(`${url.replace("http:", "ws:")}/extension`, {
      origin: clientOrigin,
    });
    const messages: Array<Record<string, unknown>> = [];
    socket.on("message", (raw) => {
      messages.push(JSON.parse(raw.toString()));
    });
    await once(socket, "open");
    cleanup.push(async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.terminate();
      await closed;
    });
    const wait = async (type: string) => {
      for (let tries = 0; tries < 100; tries++) {
        const found = messages.findIndex((m) => m.type === type);
        if (found >= 0) return messages.splice(found, 1)[0]!;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`Missing ${type} event`);
    };
    return {
      socket,
      messages,
      wait,
      send: (message: unknown) => socket.send(JSON.stringify(message)),
    };
  }
  return { bridge, client, url, sessions };
}
const ask = {
  type: "ask",
  id: "q1",
  question: "Where is export?",
  kind: "ask",
  model: "sonnet",
  effort: "high",
};

describe("extension pairing and answers", () => {
  it("keeps installation status isolated between browser profiles without reusing or extending codes", async () => {
    let now = 1000;
    const app = await setup(
      async () => ({ answer: "unused" }),
      () => now,
    );
    const ordinaryCode = app.bridge.issueCode();
    const ordinary = await app.client();
    ordinary.send({ type: "pair", code: ordinaryCode });
    await ordinary.wait("paired");
    expect(app.bridge.installStatus(ordinaryCode)).toBe(true);

    now += 1000;
    const trialCode = app.bridge.issueCode();
    expect(trialCode).not.toBe(ordinaryCode);
    expect(app.bridge.installStatus(trialCode)).toBe(false);
    const trial = await app.client();
    trial.send({ type: "pair", code: trialCode });
    const trialPair = await trial.wait("paired");
    expect(app.bridge.installStatus(trialCode)).toBe(true);
    expect(app.bridge.installStatus(ordinaryCode)).toBe(true);

    const duplicate = await app.client();
    duplicate.send({ type: "pair", code: trialCode });
    expect((await duplicate.wait("error")).code).toBe("pairing_expired");
    expect(app.bridge.installStatus(trialCode)).toBe(true);
    const trialClosed = once(trial.socket, "close");
    trial.socket.close();
    await trialClosed;
    expect(app.bridge.installStatus(trialCode)).toBe(true);
    expect(app.bridge.installStatus(ordinaryCode)).toBe(true);
    const reconnected = await app.client();
    reconnected.send({ type: "pair", token: trialPair.token });
    await reconnected.wait("paired");
    expect(app.bridge.installStatus(trialCode)).toBe(true);

    now = 601000;
    expect(app.bridge.installStatus(ordinaryCode)).toBeUndefined();
    expect(app.bridge.installStatus(trialCode)).toBe(true);
    now = 602000;
    expect(app.bridge.installStatus(trialCode)).toBeUndefined();
  });

  function serverSocket(app: Awaited<ReturnType<typeof setup>>) {
    const clients = (
      app.bridge as unknown as { sockets: { clients: Set<WebSocket> } }
    ).sockets.clients;
    return [...clients][0]!;
  }

  it("ignores the retired server socket's delayed close and cancellation", async () => {
    const requests: ProviderRequest[] = [];
    let complete!: () => void;
    const app = await setup(async (request) => {
      requests.push(request);
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      return { answer: "Completed normally" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    const paired = await a.wait("paired");
    const retired = serverSocket(app);
    const delayedClose = vi
      .spyOn(retired, "close")
      .mockImplementation(() => {});
    try {
      const b = await app.client();
      b.send({ type: "pair", token: paired.token });
      await b.wait("paired");
      b.send(ask);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      retired.emit("close", 4002, Buffer.from("Opened in another window"));
      expect(requests[0]!.signal.aborted).toBe(false);
      retired.emit(
        "message",
        Buffer.from(JSON.stringify({ type: "cancel", id: ask.id })),
        false,
      );
      expect(requests[0]!.signal.aborted).toBe(false);
      complete();
      expect((await b.wait("done")).answer).toBe("Completed normally");
    } finally {
      complete?.();
      delayedClose.mockRestore();
      retired.terminate();
    }
  });

  it("aborts the previous owned job during replacement and waits for cleanup before new work", async () => {
    const requests: ProviderRequest[] = [];
    let cleanupOld!: () => void;
    const app = await setup(async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          cleanupOld = resolve;
        });
        return { answer: "Old answer" };
      }
      return { answer: "New answer" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    const paired = await a.wait("paired");
    a.send(ask);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const retired = serverSocket(app);
    const delayedClose = vi
      .spyOn(retired, "close")
      .mockImplementation(() => {});
    try {
      const b = await app.client();
      b.send({ type: "pair", token: paired.token });
      await b.wait("paired");
      expect(requests[0]!.signal.aborted).toBe(true);
      b.send({ ...ask, id: "too-early" });
      await b.wait("error");
      expect(requests).toHaveLength(1);
      cleanupOld();
      await a.wait("error");
      b.send({ ...ask, id: "new-question" });
      expect((await b.wait("done")).answer).toBe("New answer");
      expect(requests).toHaveLength(2);
    } finally {
      cleanupOld?.();
      delayedClose.mockRestore();
      retired.terminate();
    }
  });

  it("rejects sharing, session changes and new questions from a retired server client", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Current client answer" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    const paired = await a.wait("paired");
    const retired = serverSocket(app);
    const delayedClose = vi
      .spyOn(retired, "close")
      .mockImplementation(() => {});
    try {
      const b = await app.client();
      b.send({ type: "pair", token: paired.token });
      await b.wait("paired");
      for (const message of [
        { type: "share", active: true },
        { type: "session", id: "retired-session", sessionId: sourceId },
        { ...ask, id: "retired-question" },
      ])
        retired.emit("message", Buffer.from(JSON.stringify(message)), false);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(app.bridge.isSharing).toBe(false);
      expect(requests).toHaveLength(0);
      b.send(ask);
      await b.wait("done");
      expect(requests[0]!.cliSession?.id).toBe(paired.sessionId);
    } finally {
      delayedClose.mockRestore();
      retired.terminate();
    }
  });

  it("ignores a retired client's conversation lookup that completes after replacement", async () => {
    let finishLookup!: (thread: ExtensionThread) => void;
    const lookup = vi
      .spyOn(ExtensionSessions.prototype, "resume")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLookup = resolve;
          }),
      );
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Original paired conversation" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    const paired = await a.wait("paired");
    a.send({ type: "session", id: "pending-selection", sessionId: sourceId });
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce());
    const retired = serverSocket(app);
    const delayedClose = vi
      .spyOn(retired, "close")
      .mockImplementation(() => {});
    try {
      const b = await app.client();
      b.send({ type: "pair", token: paired.token });
      expect((await b.wait("paired")).sessionId).toBe(paired.sessionId);
      b.send({ ...ask, id: "before-retired-lookup" });
      await b.wait("done");
      expect(requests[0]!.cliSession?.id).toBe(paired.sessionId);
      finishLookup(new ExtensionThread("/fixture/project", sourceId));
      await new Promise<void>((resolve) => setImmediate(resolve));
      b.send(ask);
      await b.wait("done");
      expect(requests[1]!.cliSession?.id).toBe(paired.sessionId);
    } finally {
      finishLookup?.(new ExtensionThread("/fixture/project", sourceId));
      lookup.mockRestore();
      delayedClose.mockRestore();
      retired.terminate();
    }
  });

  it("clearing cancels an outstanding session selection and keeps the fresh conversation", async () => {
    let finishLookup!: (thread: ExtensionThread) => void;
    const lookup = vi
      .spyOn(ExtensionSessions.prototype, "resume")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLookup = resolve;
          }),
      );
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Fresh conversation" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ type: "session", id: "obsolete-selection", sessionId: sourceId });
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce());
    try {
      await app.bridge.clear();
      expect(await a.wait("error")).toMatchObject({
        id: "obsolete-selection",
        code: "cancelled",
      });
      a.send(ask);
      await a.wait("done");
      const freshId = requests[0]!.cliSession!.id;
      expect(freshId).not.toBe(sourceId);
      finishLookup(new ExtensionThread("/fixture/project", sourceId));
      await new Promise<void>((resolve) => setImmediate(resolve));
      a.send({ ...ask, id: "after-obsolete-lookup" });
      await a.wait("done");
      expect(requests[1]!.cliSession?.id).toBe(freshId);
      expect(a.messages).not.toContainEqual(
        expect.objectContaining({ type: "session", id: "obsolete-selection" }),
      );
    } finally {
      finishLookup?.(new ExtensionThread("/fixture/project", sourceId));
      lookup.mockRestore();
    }
  });

  it("an obsolete selection cannot release the lock held by a newer selection", async () => {
    const finish: Array<(thread: ExtensionThread) => void> = [];
    const lookup = vi
      .spyOn(ExtensionSessions.prototype, "resume")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish.push(resolve);
          }),
      );
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Selected conversation" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ type: "session", id: "old-selection", sessionId: sourceId });
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    const nextId = "a88b5348-a13b-42fd-9685-000000000002";
    try {
      await app.bridge.clear();
      await a.wait("error");
      a.send({ type: "session", id: "new-selection", sessionId: nextId });
      await vi.waitFor(() => expect(finish).toHaveLength(2));
      finish[0]!(new ExtensionThread("/fixture/project", sourceId));
      await new Promise<void>((resolve) => setImmediate(resolve));
      a.send({ ...ask, id: "while-current-selection" });
      expect(await a.wait("error")).toMatchObject({
        id: "while-current-selection",
      });
      expect(requests).toHaveLength(0);
      finish[1]!(new ExtensionThread("/fixture/project", nextId));
      expect(await a.wait("session")).toMatchObject({
        id: "new-selection",
        sessionId: nextId,
      });
      a.send(ask);
      await a.wait("done");
      expect(requests[0]!.cliSession?.id).toBe(nextId);
    } finally {
      for (const resolve of finish)
        resolve(new ExtensionThread("/fixture/project", sourceId));
      lookup.mockRestore();
    }
  });

  for (const transcriptCreated of [true, false]) {
    it(`continues after a cancelled first turn when transcript creation is ${transcriptCreated}`, async () => {
      const persisted = new Set<string>();
      const requests: ProviderRequest[] = [];
      const inspect = vi.fn(async (id: string, project: string) => {
        expect(project).toBe("/fixture/project");
        return persisted.has(id);
      });
      const app = await setup(
        async (request) => {
          requests.push(request);
          const session = request.cliSession!;
          if (requests.length === 1) {
            if (transcriptCreated) persisted.add(session.id);
            request.onText("Partial first answer");
            await new Promise<void>((resolve) =>
              request.signal.addEventListener("abort", () => resolve(), {
                once: true,
              }),
            );
            throw new Error("The answer stopped");
          }
          if (session.resume !== persisted.has(session.id))
            throw new Error(
              "Session launch mode does not match its transcript",
            );
          return { answer: "Followup accepted", sessionId: session.id };
        },
        Date.now,
        inspect,
      );
      const a = await app.client();
      a.send({ type: "pair", code: app.bridge.issueCode() });
      const paired = await a.wait("paired");
      a.send(ask);
      await a.wait("delta");
      a.send({ type: "cancel", id: "stop-first", jobId: ask.id });
      await a.wait("cancelled");
      a.send({ ...ask, id: "retry-first", question: "Continue this answer" });
      expect((await a.wait("done")).answer).toBe("Followup accepted");
      expect(requests[1].cliSession).toMatchObject({
        id: paired.sessionId,
        resume: transcriptCreated,
      });
    });
  }

  it("does not pin a cancelled automatic lookup and resolves the latest session on retry", async () => {
    let finishLookup!: (thread: ExtensionThread) => void;
    const lookup = vi
      .spyOn(ExtensionSessions.prototype, "latest")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLookup = resolve;
          }),
      )
      .mockResolvedValueOnce(new ExtensionThread("/fixture/project", sourceId));
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Latest session", sessionId: request.cliSession!.id };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    try {
      a.send(ask);
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce());
      a.send({ type: "cancel", id: "stop-lookup", jobId: ask.id });
      await new Promise((resolve) => setTimeout(resolve, 20));
      finishLookup(
        new ExtensionThread(
          "/fixture/project",
          "00000000-0000-4000-8000-000000000001",
        ),
      );
      await a.wait("cancelled");
      expect(requests).toHaveLength(0);
      a.send({ ...ask, id: "retry-lookup" });
      expect((await a.wait("done")).sessionId).toBe(sourceId);
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(requests[0]!.cliSession).toMatchObject({
        id: sourceId,
        resume: true,
        fork: false,
      });
    } finally {
      finishLookup?.(new ExtensionThread("/fixture/project", sourceId));
      lookup.mockRestore();
    }
  });

  it("holds session ownership while reconciling and stops before provider launch", async () => {
    let finishLookup: ((persisted: boolean) => void) | undefined;
    const inspect = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishLookup = resolve;
        }),
    );
    const provider = vi.fn(async () => ({ answer: "Unexpected launch" }));
    const app = await setup(provider, Date.now, inspect);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send(ask);
    await vi.waitFor(() => expect(finishLookup).toBeDefined());
    a.send({ ...ask, id: "concurrent-reconcile" });
    expect((await a.wait("error")).message).toContain("current answer");
    a.send({ type: "session", id: "select-reconcile", sessionId: "new" });
    expect((await a.wait("error")).message).toContain("current answer");
    a.send({ type: "cancel", id: "stop-reconcile", jobId: ask.id });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(a.messages.some((message) => message.type === "cancelled")).toBe(
      false,
    );
    finishLookup!(false);
    expect((await a.wait("cancelled")).id).toBe("stop-reconcile");
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not reconcile a conversation for automatic page questions", async () => {
    const inspect = vi.fn(async () => false);
    const provider = vi.fn(async (request: ProviderRequest) => ({
      answer: request.question,
    }));
    const app = await setup(provider, Date.now, inspect);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ ...ask, kind: "suggest" });
    await a.wait("done");
    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0][0].cliSession).toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("automatically resumes the latest current-project session and keeps subsequent turns anchored", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Continued", sessionId: request.cliSession!.id };
    });
    const latest = vi
      .spyOn(app.sessions, "recent")
      .mockResolvedValue([
        { id: sourceId, title: "Current terminal", updatedAt: 2 },
      ]);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send(ask);
    expect((await a.wait("done")).sessionId).toBe(sourceId);
    latest.mockResolvedValue([
      {
        id: "a88b5348-a13b-42fd-9685-000000000002",
        title: "Another terminal",
        updatedAt: 3,
      },
    ]);
    a.send({ ...ask, id: "followup" });
    expect((await a.wait("done")).sessionId).toBe(sourceId);
    expect(latest).toHaveBeenCalledOnce();
    expect(requests.map((r) => r.cliSession)).toEqual(
      [0, 1].map(() => ({
        id: sourceId,
        project: "/fixture/project",
        resume: true,
        fork: false,
      })),
    );
  });

  it("automatically prefers a late live channel and falls back after it disconnects", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Fallback", sessionId: request.cliSession!.id };
    });
    vi.spyOn(app.sessions, "recent").mockResolvedValue([
      { id: sourceId, title: "Terminal", updatedAt: 2 },
    ]);
    const pushed: Parameters<
      ConstructorParameters<typeof LiveChannel>[0]
    >[0][] = [];
    const channel = new LiveChannel(async (event) => {
      pushed.push(event);
    });
    app.bridge.attachChannel(channel);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    await channel.probe();
    channel.confirm(pushed[0].params.meta.nonce!);
    expect(await a.wait("channel-status")).toMatchObject({
      live: true,
      sessionId: "live",
    });
    a.send(ask);
    await vi.waitFor(() => expect(pushed).toHaveLength(2));
    channel.reply(pushed[1].params.meta.request_id!, "Live reply", true);
    expect((await a.wait("done")).sessionId).toBe("live");
    expect(requests).toHaveLength(0);
    channel.close();
    a.send({ ...ask, id: "fallback" });
    expect((await a.wait("done")).sessionId).toBe(sourceId);
    expect(requests[0].cliSession?.resume).toBe(true);
  });

  it("honors an explicit new conversation even when automatic live sync becomes available", async () => {
    const app = await setup(async (request) => ({
      answer: "Chosen new conversation",
      sessionId: request.cliSession!.id,
    }));
    let nonce = "";
    const channel = new LiveChannel(async (event) => {
      nonce = event.params.meta.nonce || "";
    });
    app.bridge.attachChannel(channel);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ type: "session", id: "new" });
    const selected = await a.wait("session");
    await channel.probe();
    channel.confirm(nonce);
    a.send(ask);
    expect((await a.wait("done")).sessionId).toBe(selected.sessionId);
    channel.close();
  });

  it("routes live chat into the connected MCP channel and keeps replies paired", async () => {
    const provider = vi.fn(async () => ({ answer: "wrong provider" }));
    const inspect = vi.fn(async () => false);
    const app = await setup(provider, Date.now, inspect);
    const pushed: Array<{ params: { meta: Record<string, string> } }> = [];
    const channel = new LiveChannel(async (event) => {
      pushed.push(event);
    });
    app.bridge.attachChannel(channel);
    await channel.probe();
    channel.confirm(pushed[0]!.params.meta.nonce!);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ type: "session", id: "live-select", sessionId: "live" });
    expect((await a.wait("session")).live).toBe(true);
    a.send({
      type: "session",
      id: "bad-session",
      sessionId: "not-in-this-project",
    });
    expect((await a.wait("error")).id).toBe("bad-session");
    a.send(ask);
    await new Promise((resolve) => setTimeout(resolve, 20));
    channel.reply(
      pushed[1]!.params.meta.request_id!,
      "From your terminal",
      true,
    );
    expect((await a.wait("delta")).text).toBe("From your terminal");
    expect((await a.wait("done")).answer).toBe("From your terminal");
    expect(provider).not.toHaveBeenCalled();
    channel.close();
    expect(inspect).not.toHaveBeenCalled();
  });
  it("consumes a pairing code, streams answers, keeps dedicated follow-ups and binds reconnect tokens to the extension", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      request.onText("Export is ");
      request.onText("next to Save.");
      return { answer: "Export is next to Save." };
    });
    const a = await app.client();
    const code = app.bridge.issueCode();
    a.send({ type: "pair", code });
    const paired = await a.wait("paired");
    expect(paired.mode).toBe(process.env.SSH_CONNECTION ? "tunnel" : "direct");
    expect(paired.token).toMatch(/^[a-f0-9]{64}$/);
    a.send(ask);
    expect((await a.wait("delta")).text).toBe("Export is ");
    await a.wait("done");
    a.send({ ...ask, id: "q2", question: "What happens next?" });
    await a.wait("done");
    expect(requests[0]!.cliSession?.resume).toBe(false);
    expect(requests[1]!.cliSession).toMatchObject({
      id: paired.sessionId,
      resume: true,
      fork: false,
    });
    expect(requests[1]!.context).toHaveLength(1);
    expect(requests[1]!.effort).toBe("high");
    const b = await app.client();
    b.send({ type: "pair", code });
    expect((await b.wait("error")).code).toBe("pairing_expired");
    const c = await app.client(`chrome-extension://${"b".repeat(32)}`);
    c.send({ type: "pair", token: paired.token });
    expect((await c.wait("error")).code).toBe("pairing_expired");
    const d = await app.client();
    d.send({ type: "pair", token: paired.token });
    expect((await d.wait("paired")).sessionId).toBe(paired.sessionId);
    const oldClosed =
      a.socket.readyState === WebSocket.CLOSED ? null : once(a.socket, "close");
    await oldClosed;
  });

  it("acknowledges cancellation after cleanup before admitting a reader action", async () => {
    let cleaned = false;
    const app = await setup(async (request) => {
      if (request.question === "Background suggestion") {
        await new Promise<void>((resolve) =>
          request.signal!.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
        cleaned = true;
        throw new Error("cancelled");
      }
      expect(cleaned).toBe(true);
      return { answer: "Reader guide" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ ...ask, question: "Background suggestion", kind: "suggest" });
    a.send({ type: "cancel", id: "cancel-ack", jobId: ask.id });
    expect((await a.wait("cancelled")).id).toBe("cancel-ack");
    expect(cleaned).toBe(true);
    a.send({ ...ask, id: "reader-action", kind: "guide" });
    expect((await a.wait("done")).answer).toBe("Reader guide");
  });

  it("rejects website origins and an expired code", async () => {
    let now = Date.now();
    const app = await setup(
      async () => ({ answer: "unused" }),
      () => now,
    );
    const bad = new WebSocket(`${app.url.replace("http:", "ws:")}/extension`, {
      origin: "https://example.com",
    });
    await expect(once(bad, "open")).rejects.toThrow();
    const code = app.bridge.issueCode();
    now += 600001;
    const a = await app.client();
    a.send({ type: "pair", code });
    expect((await a.wait("error")).code).toBe("pairing_expired");
  });

  it("lists project sessions and continues the exact selected session", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (request) => {
      requests.push(request);
      return { answer: "Continued", sessionId: sourceId };
    });
    vi.spyOn(app.sessions, "recent").mockResolvedValue([
      { id: sourceId, title: "Export preferences", updatedAt: 1700000000000 },
    ]);
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({ type: "sessions", id: "list" });
    expect((await a.wait("sessions")).sessions).toEqual([
      { id: sourceId, title: "Export preferences", updatedAt: 1700000000000 },
    ]);
    a.send({ type: "session", id: "select", sessionId: sourceId });
    await a.wait("session");
    a.send(ask);
    expect((await a.wait("done")).sessionId).toBe(sourceId);
    a.send({ ...ask, id: "q2" });
    await a.wait("done");
    expect(requests[0]!.cliSession).toMatchObject({
      id: sourceId,
      resume: true,
      fork: false,
    });
    expect(requests[1]!.cliSession).toMatchObject({
      id: sourceId,
      resume: true,
      fork: false,
    });
    a.send({ type: "session", id: "invalid", sessionId: "../../secrets" });
    expect((await a.wait("error")).message).toContain(
      "no longer in this project",
    );
  });

  it("refuses passive requests on password pages before calling the provider", async () => {
    let calls = 0;
    const app = await setup(async () => {
      calls++;
      return { answer: "unused" };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    a.send({
      ...ask,
      kind: "passive",
      page: {
        url: "https://example.com/login",
        title: "Login",
        text: "",
        elements: [],
        hasPassword: true,
      },
    });
    expect((await a.wait("error")).message).toContain("password");
    expect(calls).toBe(0);
  });

  it("caps automatic requests and keeps their JSON instructions out of session history", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(async (r) => {
      requests.push(r);
      return { answer: '{"what":"settings","points":[],"questions":[]}' };
    });
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    await a.wait("paired");
    for (let i = 0; i < 6; i++) {
      a.send({ ...ask, id: `p${i}`, kind: "passive" });
      await a.wait("done");
    }
    a.send({ ...ask, id: "p7", kind: "passive" });
    expect((await a.wait("error")).message).toContain("rate limit");
    expect(requests.every((r) => !r.cliSession && !r.context.length)).toBe(
      true,
    );
  });

  it("aborts on stop and disconnect, excludes incomplete turns, and preserves failed-closed sharing intent", async () => {
    const requests: ProviderRequest[] = [];
    const app = await setup(
      (r) =>
        new Promise((resolve, reject) => {
          requests.push(r);
          if (r.question === "completed") {
            resolve({ answer: "Complete." });
            return;
          }
          r.onText("Partial");
          r.signal.addEventListener(
            "abort",
            () => reject(new Error("Answer stopped")),
            { once: true },
          );
        }),
    );
    const a = await app.client();
    a.send({ type: "pair", code: app.bridge.issueCode() });
    const paired = await a.wait("paired");
    a.send(ask);
    await a.wait("delta");
    a.send({ ...ask, id: "concurrent" });
    expect((await a.wait("error")).message).toContain("current answer");
    a.send({ type: "cancel", id: "q1" });
    await a.wait("error");
    expect(requests[0]!.signal.aborted).toBe(true);
    a.send({ ...ask, id: "q2", question: "completed" });
    await a.wait("done");
    expect(requests[1]!.context).toHaveLength(0);
    a.send({ type: "share", active: true });
    a.send({ ...ask, id: "q3" });
    await a.wait("delta");
    const closed = once(a.socket, "close");
    a.socket.close();
    await closed;
    expect(requests[2]!.signal.aborted).toBe(true);
    expect(app.bridge.isSharing).toBe(true);
    expect(await app.bridge.requestCapture(50)).toBeUndefined();
    const b = await app.client();
    b.send({ type: "pair", token: paired.token });
    await b.wait("paired");
    await app.bridge.clear();
    expect(app.bridge.isSharing).toBe(false);
  });
});

describe("session and installation contracts", () => {
  it("rejects a different session returned during an exact continuation", () => {
    const thread = new ExtensionThread("/fixture/project", sourceId);
    expect(() =>
      thread.complete({
        answer: "Reply",
        sessionId: "a88b5348-a13b-42fd-9685-000000000002",
      }),
    ).toThrow("different session");
    expect(thread.options).toMatchObject({
      id: sourceId,
      resume: true,
      fork: false,
    });
    thread.complete({ answer: "Reply", sessionId: sourceId });
    expect(thread.id).toBe(sourceId);
  });
  it("does not resume the original if a fork was not confirmed", () => {
    const thread = new ExtensionThread("/project", sourceId, true);
    expect(() => thread.complete({ answer: "missing session id" })).toThrow(
      "not confirmed",
    );
    expect(thread.options).toMatchObject({ id: sourceId, fork: true });
  });
  it("prints one SSH command with explicit local binding and supports configured reachable hostnames", () => {
    expect(tunnelCommand(37115, {})).toBeUndefined();
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "1 2 10.0.0.3 22",
        GLIMPSELET_SSH_USER: "reader",
      }),
    ).toBe("ssh -N -L 37115:127.0.0.1:37115 reader@10.0.0.3");
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "1 2 ::1 22",
        GLIMPSELET_SSH_USER: "reader",
      }),
    ).toContain("reader@[::1]");
    expect(
      tunnelCommand(37115, {
        SSH_CONNECTION: "1 2 3 22",
        GLIMPSELET_SSH_HOST: "bad host",
      }),
    ).toBeUndefined();
  });
  it("escapes local install paths and keeps codes in the fragment", () => {
    const guide = installGuide('/tmp/<script>"&');
    expect(guide).toContain("&lt;script&gt;&quot;&amp;");
    expect(guide).not.toContain('/tmp/<script>"&');
    expect(guide).toContain("/install-guide.js");
  });
});
