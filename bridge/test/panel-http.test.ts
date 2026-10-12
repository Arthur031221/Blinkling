// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import { PNG } from "pngjs";
import WebSocket from "ws";
import { CaptureHistory } from "../src/history.js";
import { PanelServer } from "../src/panel.js";
import {
  contextPrompt,
  type ProviderRequest,
} from "../src/provider-request.js";

const png = (color: [number, number, number] = [30, 80, 140]) => {
  const image = new PNG({ width: 32, height: 24 });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = color[0];
    image.data[i + 1] = color[1];
    image.data[i + 2] = color[2];
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image).toString("base64");
};

const panels: PanelServer[] = [];
afterEach(async () => {
  await Promise.all(panels.splice(0).map((panel) => panel.close()));
});

async function setup(
  options: ConstructorParameters<typeof PanelServer>[1] = {},
) {
  process.env.GLIMPSELET_DISABLE_BROWSER_OPEN = "1";
  const history = new CaptureHistory();
  const panel = await new PanelServer(history, {
    panelDir: "/tmp/glimpselet-panel-tests",
    ...options,
  }).start();
  panels.push(panel);
  const url = await panel.openUrl();
  const token = /#([A-Za-z0-9_-]+)$/.exec(url)![1]!;
  return { panel, history, token };
}

async function post(
  panel: PanelServer,
  path: string,
  body: unknown,
  session?: string,
  overrides: Record<string, string> = {},
) {
  return fetch(`${panel.origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: panel.origin,
      ...(session ? { authorization: `Bearer ${session}` } : {}),
      ...overrides,
    },
    body: JSON.stringify(body),
  });
}

async function createSession(panel: PanelServer, token: string) {
  const response = await post(panel, "/api/session", { token });
  return {
    response,
    session: ((await response.json()) as { session: string }).session,
  };
}

async function postWithHost(panel: PanelServer, host: string, body: unknown) {
  const address = new URL(panel.origin);
  return new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: address.hostname,
        port: address.port,
        path: "/api/session",
        method: "POST",
        headers: {
          host,
          origin: panel.origin,
          "content-type": "application/json",
        },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.once("error", reject);
    req.end(JSON.stringify(body));
  });
}

function sseEvents(text: string) {
  return [...text.matchAll(/event: ([^\n]+)\ndata: ([^\n]+)/g)].map(
    (match) => ({ event: match[1], data: JSON.parse(match[2]!) }),
  );
}

describe("PanelServer HTTP integration", () => {
  it("enforces loopback host and origin and consumes a launch token once, including expiry", async () => {
    let now = 1_000;
    const { panel, token } = await setup({ now: () => now });
    const wrongOrigin = await fetch(`${panel.origin}/api/session`, {
      method: "POST",
      headers: {
        host: new URL(panel.origin).host,
        origin: "http://evil.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await postWithHost(panel, "localhost:1", { token })).toBe(403);
    const first = await createSession(panel, token);
    expect(first.response.status).toBe(200);
    expect((await post(panel, "/api/session", { token })).status).toBe(401);
    const expiredUrl = await panel.openUrl();
    now += 60_001;
    expect(
      (
        await post(panel, "/api/session", {
          token: /#([A-Za-z0-9_-]+)$/.exec(expiredUrl)![1],
        })
      ).status,
    ).toBe(401);
  });

  it("expires sessions and rejects oversized and invalid ask input", async () => {
    let now = 0;
    const { panel, token } = await setup({ now: () => now, sessionTtlMs: 100 });
    const { session } = await createSession(panel, token);
    const tooLarge = await fetch(`${panel.origin}/api/ask`, {
      method: "POST",
      headers: {
        host: new URL(panel.origin).host,
        origin: panel.origin,
        authorization: `Bearer ${session}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: "x".repeat(11_500_000) }),
    });
    expect(tooLarge.status).toBe(413);
    const invalid = await post(
      panel,
      "/api/ask",
      { question: "x".repeat(2001), image: png() },
      session,
    );
    expect(invalid.status).toBe(400);
    now = 101;
    const expired = await post(panel, "/api/history", {}, session);
    expect(expired.status).toBe(401);
  });

  it("rejects competing asks while one is running", async () => {
    let finish!: (result: { answer: string }) => void;
    const provider = () =>
      new Promise<{ answer: string }>((resolve) => {
        finish = resolve;
      });
    const { panel, token } = await setup({ provider });
    const { session } = await createSession(panel, token);
    const first = post(
      panel,
      "/api/ask",
      { question: "First?", image: png() },
      session,
    );
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
    const busy = await post(
      panel,
      "/api/ask",
      { question: "Second?", image: png() },
      session,
    );
    expect(busy.status).toBe(429);
    finish({ answer: "First answer" });
    expect(sseEvents(await (await first).text()).at(-1)?.event).toBe("done");
  });

  it("cancels and clears a running answer without allowing late history writes", async () => {
    let finish!: (result: { answer: string }) => void;
    let signal!: AbortSignal;
    const provider = (request: { signal: AbortSignal }) => {
      signal = request.signal;
      return new Promise<{ answer: string }>((resolve) => {
        finish = resolve;
      });
    };
    const { panel, history, token } = await setup({ provider });
    const { session } = await createSession(panel, token);
    const answer = post(
      panel,
      "/api/ask",
      { question: "Explain this", image: png() },
      session,
    );
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
    const clear = post(panel, "/api/clear", {}, session);
    while (!signal.aborted)
      await new Promise((resolve) => setTimeout(resolve, 1));
    finish({ answer: "Must not be retained" });
    await clear;
    expect(
      sseEvents(await (await answer).text()).some(
        (event) => event.event === "done",
      ),
    ).toBe(false);
    expect(history.all()).toHaveLength(0);
    expect(
      (
        (await (await post(panel, "/api/history", {}, session)).json()) as {
          entries: unknown[];
        }
      ).entries,
    ).toHaveLength(0);
  });

  it("pauses a passive request and discards the provider's late answer", async () => {
    let finish!: (result: { answer: string }) => void;
    let signal!: AbortSignal;
    const provider = (request: { signal: AbortSignal }) => {
      signal = request.signal;
      return new Promise<{ answer: string }>((resolve) => {
        finish = resolve;
      });
    };
    const { panel, history, token } = await setup({ provider });
    const { session } = await createSession(panel, token);
    const answer = post(
      panel,
      "/api/ask",
      { mode: "passive", question: "Observe", image: png() },
      session,
    );
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
    const pause = post(panel, "/api/pause", {}, session);
    while (!signal.aborted)
      await new Promise((resolve) => setTimeout(resolve, 1));
    finish({ answer: "Late note" });
    await pause;
    expect(
      sseEvents(await (await answer).text()).some(
        (event) => event.event === "done",
      ),
    ).toBe(false);
    expect(history.all()).toHaveLength(0);
  });

  it("requires changed passive frames and keeps the six per-minute cap across clear", async () => {
    let now = 10_000;
    const { panel, token } = await setup({
      now: () => now,
      provider: async () => ({ answer: "Noted" }),
    });
    const { session } = await createSession(panel, token);
    const ask = async (image: string) =>
      post(
        panel,
        "/api/ask",
        { mode: "passive", question: "Observe", image },
        session,
      );
    expect((await ask(png([0, 0, 0]))).status).toBe(200);
    expect((await ask(png([0, 0, 0]))).status).toBe(409);
    for (let i = 1; i < 6; i++)
      expect((await ask(png([i * 35, i * 35, i * 35]))).status).toBe(200);
    await post(panel, "/api/clear", {}, session);
    expect((await ask(png([250, 250, 250]))).status).toBe(429);
    now += 60_001;
    expect((await ask(png([250, 250, 250]))).status).toBe(200);
  });

  it("sends bounded recent followup context and summarizes only ten-minute passive notes", async () => {
    const requests: {
      question: string;
      kind: string;
      image?: Buffer;
      context: { kind: string; question: string; answer: string; at: number }[];
    }[] = [];
    const { panel, token } = await setup({
      provider: async (request) => {
        requests.push(request as (typeof requests)[number]);
        return { answer: "Reply" };
      },
    });
    const { session } = await createSession(panel, token);
    for (let i = 0; i < 10; i++)
      await post(
        panel,
        "/api/ask",
        { question: `Q${i}`, image: png() },
        session,
      );
    expect(requests.at(-1)!.context).toHaveLength(9);
    await post(
      panel,
      "/api/ask",
      { mode: "passive", question: "Note", image: png([200, 20, 80]) },
      session,
    );
    await post(
      panel,
      "/api/ask",
      { mode: "summary", question: "Summarize" },
      session,
    );
    expect(requests.at(-1)!.kind).toBe("summary");
    expect(requests.at(-1)!.image).toBeUndefined();
    expect(requests.at(-1)!.context).toContainEqual(
      expect.objectContaining({ kind: "passive", question: "Note" }),
    );
    expect(requests.at(-1)!.context).toContainEqual(
      expect.objectContaining({ kind: "ask", question: "Q0" }),
    );
    const prompt = contextPrompt(requests.at(-1)! as ProviderRequest);
    const quoted = JSON.parse(
      prompt.slice(
        prompt.indexOf("Quoted prior context: ") +
          "Quoted prior context: ".length,
      ),
    ) as { question: string }[];
    expect(quoted).toHaveLength(1);
    expect(quoted[0]!.question).toBe("Note");
  });

  it("allows retrying the same passive frame after a provider failure", async () => {
    let attempts = 0;
    const { panel, token } = await setup({
      provider: async () => {
        if (attempts++ === 0) throw new Error("temporary failure");
        return { answer: "Noted" };
      },
    });
    const { session } = await createSession(panel, token);
    const frame = png([15, 75, 135]);
    const ask = () =>
      post(
        panel,
        "/api/ask",
        { mode: "passive", question: "Observe", image: frame },
        session,
      );

    const failed = await ask();
    expect(failed.status).toBe(200);
    expect(sseEvents(await failed.text()).at(-1)).toMatchObject({
      event: "error",
      data: { code: "provider_error" },
    });
    const retried = await ask();
    expect(retried.status).toBe(200);
    expect(sseEvents(await retried.text()).at(-1)?.event).toBe("done");
    expect((await ask()).status).toBe(409);
  });
});

describe("PanelServer WebSocket capture ownership", () => {
  async function connected(panel: PanelServer, token: string) {
    const { session } = await createSession(panel, token);
    const socket = new WebSocket(
      `${panel.origin.replace("http", "ws")}/api/stream`,
      ["glimpselet", session],
      { headers: { Origin: panel.origin } },
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return { session, socket };
  }

  it("binds replies to the requesting socket and ignores duplicate replies", async () => {
    const { panel, history, token } = await setup();
    const one = await connected(panel, token);
    const two = await connected(
      panel,
      await panel
        .openUrl()
        .then((value) => /#([A-Za-z0-9_-]+)$/.exec(value)![1]!),
    );
    one.socket.send(JSON.stringify({ type: "share", active: true }));
    two.socket.send(JSON.stringify({ type: "share", active: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const pending = panel.requestCapture();
    const message = JSON.parse(
      await new Promise<string>((resolve) =>
        two.socket.once("message", (data) => resolve(data.toString())),
      ),
    );
    const image = png();
    one.socket.send(JSON.stringify({ type: "capture", id: message.id, image }));
    two.socket.send(JSON.stringify({ type: "capture", id: message.id, image }));
    const capture = await pending;
    two.socket.send(JSON.stringify({ type: "capture", id: message.id, image }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(capture?.source).toBe("shared browser surface");
    expect(history.all()).toHaveLength(0);
    one.socket.close();
    two.socket.close();
  });

  it("rejects a failed shared capture and closes sockets after session expiry", async () => {
    let now = 100;
    const { panel, token } = await setup({ now: () => now, sessionTtlMs: 50 });
    const { socket } = await connected(panel, token);
    socket.send(JSON.stringify({ type: "share", active: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(panel.isSharing).toBe(true);
    const pending = panel.requestCapture();
    const request = JSON.parse(
      await new Promise<string>((resolve) =>
        socket.once("message", (data) => resolve(data.toString())),
      ),
    );
    socket.send(
      JSON.stringify({ type: "capture", id: request.id, error: "gone" }),
    );
    await expect(pending).rejects.toMatchObject({
      code: "capture_unavailable",
    });
    now = 151;
    // The next socket message checks the expired owner session and closes the connection.
    socket.send(JSON.stringify({ type: "share", active: false }));
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(panel.isSharing).toBe(false);
  });

  it("clears sharing intent when the session is explicitly cleared", async () => {
    const { panel, token } = await setup();
    const { session, socket } = await connected(panel, token);
    socket.send(JSON.stringify({ type: "share", active: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(panel.isSharing).toBe(true);

    expect((await post(panel, "/api/clear", {}, session)).status).toBe(200);
    expect(panel.isSharing).toBe(false);
    socket.close();
  });
});
