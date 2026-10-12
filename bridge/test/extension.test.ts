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
) {
  const server: Server = createServer();
  let url = "";
  const sessions = new ExtensionSessions("/fixture/project", async () => [
    {
      sessionId: sourceId,
      summary: "Export preferences",
      lastModified: 1700000000000,
    },
  ]);
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
  return { bridge, client, url };
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
  it("routes live chat into the connected MCP channel and keeps replies paired", async () => {
    const provider = vi.fn(async () => ({ answer: "wrong provider" }));
    const app = await setup(provider);
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
