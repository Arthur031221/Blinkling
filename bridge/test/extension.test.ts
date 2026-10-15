// @vitest-environment node
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { PNG } from "pngjs";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionBridge, pageElements } from "../src/extension-bridge.js";
import { parseTranslation } from "../src/desktop-link.js";
import { installGuide } from "../src/extension-install.js";

const origin = `chrome-extension://${"a".repeat(32)}`;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
});

async function setup(
  options: ConstructorParameters<typeof ExtensionBridge>[2] = {},
) {
  const server: Server = createServer();
  let url = "";
  const bridge = new ExtensionBridge(server, () => url, options);
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
      for (let tries = 0; tries < 200; tries++) {
        const found = messages.findIndex((m) => m.type === type);
        if (found >= 0) return messages.splice(found, 1)[0]!;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`Missing ${type} event`);
    };
    return {
      socket,
      wait,
      send: (message: unknown) => socket.send(JSON.stringify(message)),
    };
  }
  async function paired() {
    const helper = await client();
    helper.send({ type: "pair", code: bridge.issueCode() });
    await helper.wait("paired");
    return helper;
  }
  return { bridge, client, paired, url };
}

const png = (width: number, height: number) =>
  PNG.sync.write(new PNG({ width, height })).toString("base64");

const element = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  kind: "paragraph",
  rect: { x: 0, y: 0, width: 10, height: 10 },
  role: "paragraph",
  name: "",
  text: "Hi",
  secure: false,
  ...over,
});
const snapshot = (elements: unknown[]) => ({
  page: { url: "https://a.test/", title: "A", tabId: 1, incognito: false },
  frame: { screenX: 0, screenY: 0, devicePixelRatio: 1, zoom: 1 },
  elements,
});

describe("browser helper pairing", () => {
  it("keeps installation status per code and never reuses or extends a code", async () => {
    let now = 1000;
    const app = await setup({ now: () => now });
    const first = app.bridge.issueCode();
    expect(first).toMatch(/^[A-F0-9]{16}$/);
    const a = await app.client();
    a.send({ type: "pair", code: first });
    const token = (await a.wait("paired")).token;
    expect(app.bridge.installStatus(first)).toBe(true);

    now += 1000;
    const second = app.bridge.issueCode();
    expect(second).not.toBe(first);
    expect(app.bridge.installStatus(second)).toBe(false);

    const replay = await app.client();
    replay.send({ type: "pair", code: first });
    expect((await replay.wait("error")).code).toBe("pairing_expired");

    const again = await app.client();
    again.send({ type: "pair", token });
    await again.wait("paired");
    expect(app.bridge.connected).toBe(true);

    now = 601_000;
    expect(app.bridge.installStatus(first)).toBeUndefined();
    expect(app.bridge.installStatus(second)).toBe(false);
    now = 602_000;
    expect(app.bridge.installStatus(second)).toBeUndefined();
  });

  it("rejects website origins and an expired code", async () => {
    let now = Date.now();
    const app = await setup({ now: () => now });
    const bad = new WebSocket(`${app.url.replace("http:", "ws:")}/extension`, {
      origin: "https://example.com",
    });
    await expect(once(bad, "open")).rejects.toThrow();
    const code = app.bridge.issueCode();
    now += 600_001;
    const a = await app.client();
    a.send({ type: "pair", code });
    expect((await a.wait("error")).code).toBe("pairing_expired");
  });

  it("moves a profile to its newest window and closes the older one", async () => {
    const app = await setup();
    const code = app.bridge.issueCode();
    const a = await app.client();
    a.send({ type: "pair", code });
    const token = (await a.wait("paired")).token;
    const closed = once(a.socket, "close");
    const b = await app.client();
    b.send({ type: "pair", token });
    await b.wait("paired");
    expect((await closed)[0]).toBe(4002);
  });
});

describe("requests to the browser helper", () => {
  it("returns the page structure, and validates it before Blink sees it", async () => {
    const app = await setup();
    const helper = await app.paired();
    const asked = app.bridge.requestElements({ x: 5, y: 6 });
    const request = await helper.wait("request");
    expect(request).toMatchObject({ op: "elements", point: { x: 5, y: 6 } });
    helper.send({
      type: "result",
      id: request.id,
      ok: true,
      elements: snapshot([element()]),
    });
    expect((await asked)?.elements[0]?.text).toBe("Hi");

    const bad = app.bridge.requestElements();
    const second = await helper.wait("request");
    helper.send({
      type: "result",
      id: second.id,
      ok: true,
      elements: snapshot([element({ kind: "script" })]),
    });
    expect(await bad).toBeNull();
  });

  it("answers null when no helper is paired or the helper reports a restricted page", async () => {
    const app = await setup();
    expect(await app.bridge.requestElements()).toBeNull();
    expect(await app.bridge.requestTranslate(true)).toBe(false);
    expect(await app.bridge.requestPdfReader()).toBe(false);
    const helper = await app.paired();
    const asked = app.bridge.requestElements();
    const request = await helper.wait("request");
    helper.send({ type: "result", id: request.id, ok: false });
    expect(await asked).toBeNull();
  });

  it("cancels the browser's work when Blink gives up", async () => {
    const app = await setup();
    const helper = await app.paired();
    const controller = new AbortController();
    const asked = app.bridge.requestTranslate(true, controller.signal);
    const request = await helper.wait("request");
    controller.abort();
    expect(await asked).toBe(false);
    expect(await helper.wait("cancel")).toMatchObject({ id: request.id });
  });

  it("collects a long page: progress first, then bounded tiles", async () => {
    const app = await setup();
    const helper = await app.paired();
    const progress: number[] = [];
    const asked = app.bridge.requestFullPage(5000, undefined, (done) =>
      progress.push(done),
    );
    const request = await helper.wait("request");
    expect(request.op).toBe("full-page");
    helper.send({ type: "progress", id: request.id, completed: 1, total: 2 });
    helper.send({ type: "progress", id: request.id, completed: 9, total: 2 });
    helper.send({
      type: "result",
      id: request.id,
      ok: true,
      images: [png(8, 8), png(8, 4)],
      truncated: true,
      page: { url: "https://a.test/", title: "A" },
    });
    const capture = await asked;
    expect(progress).toEqual([1]);
    expect(capture?.tiles.map((t) => [t.width, t.height])).toEqual([
      [8, 8],
      [8, 4],
    ]);
    expect(capture?.truncated).toBe(true);
  });

  it("takes only a result from the socket that was asked", async () => {
    const app = await setup();
    const helper = await app.paired();
    const intruder = await app.client();
    const asked = app.bridge.requestPdfReader();
    const request = await helper.wait("request");
    intruder.send({ type: "result", id: request.id, ok: true });
    helper.send({ type: "result", id: request.id, ok: true });
    expect(await asked).toBe(true);
  });
});

describe("requests from the browser helper", () => {
  it("wakes Blink and reports whether the desktop is present", async () => {
    let woke = 0;
    const app = await setup({
      wake: async () => {
        woke++;
        return true;
      },
    });
    const helper = await app.paired();
    helper.send({ type: "wake", id: "w1" });
    expect(await helper.wait("wake")).toMatchObject({ id: "w1", ok: true });
    expect(woke).toBe(1);
    helper.send({ type: "status", id: "s1" });
    expect(await helper.wait("status")).toMatchObject({ id: "s1" });
  });

  it("translates a batch through Blink, cancellable, and rejects oversized batches", async () => {
    const app = await setup({
      translate: async (texts, target, signal) => {
        if (target === "slow")
          await new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new Error("The translation stopped.")),
            ),
          );
        return texts.map((t) => `${target}:${t}`);
      },
    });
    const helper = await app.paired();
    helper.send({
      type: "translate-batch",
      id: "t1",
      target: "fr",
      texts: ["a", "b"],
    });
    expect(await helper.wait("translate-batch")).toMatchObject({
      id: "t1",
      texts: ["fr:a", "fr:b"],
    });
    helper.send({
      type: "translate-batch",
      id: "t2",
      target: "slow",
      texts: ["a"],
    });
    helper.send({ type: "translate-cancel", id: "t2" });
    expect((await helper.wait("error")).id).toBe("t2");
    helper.send({
      type: "translate-batch",
      id: "t3",
      target: "fr",
      texts: Array.from({ length: 61 }, () => "x"),
    });
    expect((await helper.wait("error")).id).toBe("t3");
  });
});

describe("page structure contract", () => {
  it("returns a secure field with no text, name or content", () => {
    const page = pageElements(
      snapshot([
        element(),
        element({
          id: "e2",
          kind: "input",
          role: "textbox",
          name: "Password",
          text: "hunter2",
          secure: true,
          parentId: "e1",
          content: { markdown: "hunter2" },
        }),
      ]),
    );
    expect(page?.elements[1]).toEqual({
      id: "e2",
      kind: "input",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      role: "textbox",
      name: "",
      text: "",
      parentId: "e1",
      secure: true,
    });
  });

  it("keeps content for tables, code and formulas, and rejects broken trees", () => {
    const page = pageElements(
      snapshot([
        element({
          id: "t",
          kind: "table",
          content: { markdown: "| a |\n| - |\n| 1 |" },
        }),
        element({
          id: "c",
          kind: "code",
          content: { code: "x = 1", language: "python" },
        }),
        element({
          id: "f",
          kind: "formula",
          content: { latex: "E=mc^2", mathml: "<math/>" },
        }),
      ]),
    );
    expect(page?.elements.map((e) => e.content)).toEqual([
      { markdown: "| a |\n| - |\n| 1 |" },
      { code: "x = 1", language: "python" },
      { latex: "E=mc^2", mathml: "<math/>" },
    ]);
    expect(() =>
      pageElements(snapshot([element(), element({ id: "e1" })])),
    ).toThrow();
    expect(() =>
      pageElements(snapshot([element({ parentId: "nope" })])),
    ).toThrow();
    expect(() =>
      pageElements(
        snapshot([
          element({ rect: { x: 0, y: 0, width: Infinity, height: 1 } }),
        ]),
      ),
    ).toThrow();
    expect(() =>
      pageElements(
        snapshot(
          Array.from({ length: 601 }, (_, i) => element({ id: `n${i}` })),
        ),
      ),
    ).toThrow();
    expect(pageElements(null)).toBeNull();
  });
});

describe("translation replies", () => {
  it("accepts a JSON array of the same length, even inside prose", () => {
    expect(parseTranslation('Sure: ["a","b"]', 2)).toEqual(["a", "b"]);
  });
  it("rejects wrong lengths, non-strings and prose", () => {
    expect(() => parseTranslation('["a"]', 2)).toThrow(/incomplete/);
    expect(() => parseTranslation("[1,2]", 2)).toThrow(/incomplete/);
    expect(() => parseTranslation("no", 1)).toThrow(/not understood/);
  });
});

describe("install guide", () => {
  it("escapes local install paths and keeps codes in the fragment", () => {
    const guide = installGuide('/tmp/<script>"&');
    expect(guide).toContain("&lt;script&gt;&quot;&amp;");
    expect(guide).not.toContain('/tmp/<script>"&');
    expect(guide).toContain("/install-guide.js");
  });
});
