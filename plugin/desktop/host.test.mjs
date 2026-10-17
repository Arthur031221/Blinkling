import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer, request as httpRequest } from "node:http";
import { startDesktopHost } from "./host.mjs";
import { discoverDesktop, DesktopClient } from "./client.mjs";
import { launchDesktop } from "./launcher.mjs";
import pinned from "./manifest.json" with { type: "json" };

test("authenticated discovery and repeated launch reach one instance without installing or stealing focus", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-host-"));
  const descriptor = join(directory, "desktop.json");
  let opens = 0;
  // The running build is the one the plugin pins, so it is reused, not replaced.
  const host = await startDesktopHost({
    directory,
    descriptor,
    version: pinned.version,
    onOpen: () => opens++,
  });
  try {
    const found = await discoverDesktop(descriptor);
    assert.equal(found.status.pid, process.pid);
    assert.equal(
      (await launchDesktop({ runtime: directory })).alreadyRunning,
      true,
    );
    await launchDesktop({ runtime: directory, background: true });
    const hook = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("./start.mjs", import.meta.url)), "--background"],
      { env: { ...process.env, BLINKLING_RUNTIME_DIR: directory } },
    );
    assert.equal(hook.stdout, "");
    assert.equal(hook.stderr, "");
    assert.equal(opens, 1);
    assert.equal(
      JSON.parse(await readFile(join(directory, "enabled.json"))).enabled,
      true,
    );
    const response = await fetch(host.address.url + "/status");
    assert.equal(response.status, 403);
    const evil = await fetch(host.address.url + "/rpc", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${host.address.token}`,
        Origin: "https://evil.test",
      },
      body: '{"method":"open"}',
    });
    assert.equal(evil.status, 403);
    assert.equal(opens, 1);
    await assert.rejects(
      new DesktopClient({ ...host.address, token: "a".repeat(64) }).status(),
      /Unauthorized/,
    );
    if (process.platform !== "win32") {
      await chmod(descriptor, 0o644);
      await assert.rejects(discoverDesktop(descriptor), /Unsafe/);
      await chmod(descriptor, 0o600);
    }
  } finally {
    await host.close();
    await rm(directory, { recursive: true });
  }
});

test("one SessionBridge receives the actual image, selection, streamed answer and stop with strict turn ownership", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-host-"));
  const descriptor = join(directory, "desktop.json");
  const listeners = new Set();
  let turn,
    selection,
    stopped = 0;
  const emit = (e) => {
    for (const l of listeners) l(e);
  };
  const session = {
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    send: async (t) => {
      turn = t;
      emit({ type: "message", id: t.id, role: "user", content: t.attachments });
      emit({ type: "delta", id: "reply", text: "Red." });
    },
    select: async (s) => {
      selection = s;
      return s;
    },
    stop: async () => stopped++,
  };
  const host = await startDesktopHost({ directory, descriptor, session });
  const client = (await discoverDesktop(descriptor)).client;
  const controller = new AbortController(),
    events = [];
  let ready;
  const connected = new Promise((r) => {
    ready = r;
  });
  const stream = client
    .events((frame) => events.push(frame.event), controller.signal, 0, ready)
    .catch((e) => {
      if (!controller.signal.aborted) throw e;
    });
  try {
    await connected;
    const image = {
      id: randomUUID(),
      name: "Screenshot.png",
      mediaType: "image/png",
      data: "aW1hZ2U=",
    };
    const id = randomUUID();
    await client.rpc("send", {
      turn: { id, text: "Color?", attachments: [image], source: "companion" },
    });
    assert.deepEqual(turn.attachments, [image]);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(events.at(-1).text, "Red.");
    await assert.rejects(
      client.rpc("send", {
        turn: {
          id: randomUUID(),
          text: "Other",
          attachments: [],
          source: "companion",
        },
      }),
      /answering/,
    );
    await client.rpc("stop", { turnId: randomUUID() });
    assert.equal(stopped, 0);
    await client.rpc("stop", { turnId: id });
    assert.equal(stopped, 1);
    emit({ type: "done", turnId: id });
    assert.deepEqual(
      await client.rpc("select", {
        selection: { model: "haiku", effort: "low" },
      }),
      { model: "haiku", effort: "low" },
    );
    assert.deepEqual(selection, { model: "haiku", effort: "low" });
    await assert.rejects(
      client.rpc("send", {
        turn: {
          id: randomUUID(),
          text: "Other",
          attachments: [],
          source: "composer",
        },
      }),
      /Invalid/,
    );
    await assert.rejects(
      client.rpc("companion", {
        url: "https://evil.test/capture",
        token: "a".repeat(64),
      }),
      /Invalid/,
    );
    await assert.rejects(client.rpc("stop"), /Invalid/);
    assert.equal(
      stopped,
      1,
      "a missing turn ID must not interrupt the shared session",
    );
    assert.deepEqual(await host.fullPage(), { companionRequired: true });
  } finally {
    controller.abort();
    await stream;
    await host.close();
    await rm(directory, { recursive: true });
  }
});

test("cancellation arriving before an uploaded turn finishes prevents admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-upload-cancel-"));
  let sent = 0,
    stopped = 0;
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    session: {
      subscribe: () => () => {},
      send: async () => {
        sent++;
      },
      stop: async () => {
        stopped++;
      },
    },
  });
  try {
    const client = (await discoverDesktop(join(directory, "desktop.json")))
      .client;
    const id = randomUUID();
    const data = JSON.stringify({
      method: "send",
      turn: {
        id,
        source: "companion",
        text: "Cancelled upload",
        attachments: [],
      },
    });
    let request;
    const response = new Promise((resolve, reject) => {
      request = httpRequest(
        host.address.url + "/rpc",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${host.address.token}` },
        },
        (result) => {
          const chunks = [];
          result.on("data", (chunk) => chunks.push(chunk));
          result.on("end", () =>
            resolve({
              status: result.statusCode,
              data: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      request.on("error", reject);
    });
    request.write(data.slice(0, 20));
    await client.rpc("stop", { turnId: id });
    request.end(data.slice(20));
    const result = await response;
    assert.equal(result.status, 400);
    assert.match(result.data, /stopped before sending/);
    assert.equal(sent, 0);
    assert.equal(
      stopped,
      0,
      "a not-yet-admitted turn must not interrupt another producer",
    );
  } finally {
    await host.close();
    await rm(directory, { recursive: true });
  }
});

test("selection acknowledgement serializes admission and cancellation before acknowledgement never sends a paid turn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-admission-"));
  let release,
    entered,
    sent = 0,
    stopped = 0;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const selected = new Promise((resolve) => {
    release = resolve;
  });
  let emit;
  const id = randomUUID();
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
    session: {
      subscribe: (listener) => {
        emit = listener;
        return () => {};
      },
      select: async (value) => {
        entered();
        await selected;
        return value;
      },
      send: async () => {
        sent++;
      },
      stop: async () => {
        stopped++;
        emit({ type: "done", turnId: id });
      },
    },
  });
  const client = (await discoverDesktop(join(directory, "desktop.json")))
    .client;
  try {
    const sending = client.rpc("send", {
      selection: { model: "haiku", effort: "low" },
      turn: { id, text: "Tiny prompt", source: "companion", attachments: [] },
    });
    const rejected = assert.rejects(sending, /stopped before sending/);
    await waiting;
    await assert.rejects(
      client.rpc("select", {
        selection: { model: "sonnet", effort: "medium" },
      }),
      /current answer/,
    );
    await client.rpc("stop", { turnId: id });
    await assert.rejects(
      client.rpc("send", {
        turn: {
          id: randomUUID(),
          text: "Second turn",
          source: "companion",
          attachments: [],
        },
      }),
      /answering/,
    );
    release();
    await rejected;
    assert.equal(sent, 0);
    assert.equal(stopped, 1);
  } finally {
    release();
    await host.close();
    await rm(directory, { recursive: true });
  }
});

async function withCompanion(handler, run) {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-host-elements-"));
  const descriptor = join(directory, "desktop.json");
  const token = "b".repeat(64);
  const calls = [];
  const companion = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "GET") {
      res.end(JSON.stringify({ companion: true }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    calls.push(message);
    res.end(JSON.stringify(handler(message)));
  });
  await new Promise((resolve) => companion.listen(0, "127.0.0.1", resolve));
  const host = await startDesktopHost({ directory, descriptor });
  try {
    const client = (await discoverDesktop(descriptor)).client;
    await client.rpc("companion", {
      url: `http://127.0.0.1:${companion.address().port}/desktop-companion`,
      token,
    });
    await run({ host, calls });
  } finally {
    await host.close();
    companion.closeAllConnections();
    await new Promise((resolve) => companion.close(resolve));
    await rm(directory, { recursive: true });
  }
}

test("elements, translatePage and openPdfReader are null or not-ok without a companion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-host-nocompanion-"));
  const host = await startDesktopHost({
    directory,
    descriptor: join(directory, "desktop.json"),
  });
  try {
    assert.equal(await host.elements({ point: { x: 10, y: 10 } }), null);
    assert.deepEqual(await host.translatePage({ on: true }), { ok: false });
    assert.deepEqual(await host.openPdfReader(), { ok: false });
  } finally {
    await host.close();
    await rm(directory, { recursive: true });
  }
});

test("elements asks the companion for the structure under a screen point and passes it through", async () => {
  const structure = {
    page: {
      url: "https://example.test/",
      title: "Form",
      tabId: 4,
      incognito: false,
    },
    frame: { screenX: 100, screenY: 80, devicePixelRatio: 2, zoom: 1.25 },
    elements: [
      {
        id: "e1",
        kind: "heading",
        rect: { x: 8, y: 8, width: 200, height: 30 },
        role: "heading",
        name: "Sign in",
        text: "Sign in",
        parentId: null,
        secure: false,
      },
      {
        id: "e2",
        kind: "input",
        rect: { x: 8, y: 50, width: 200, height: 30 },
        role: "textbox",
        name: "",
        text: "",
        parentId: "e1",
        secure: true,
      },
    ],
  };
  await withCompanion(
    (message) => (message.method === "elements" ? { result: structure } : {}),
    async ({ host, calls }) => {
      const result = await host.elements({ point: { x: 320, y: 240 } });
      assert.deepEqual(result, structure);
      assert.deepEqual(calls, [
        { method: "elements", point: { x: 320, y: 240 } },
      ]);
      assert.equal(result.elements[1].secure, true);
      assert.equal(result.elements[1].text, "");
    },
  );
});

test("elements passes fresh through so a click is never answered from a cache", async () => {
  await withCompanion(
    (message) => (message.method === "elements" ? { result: null } : {}),
    async ({ host, calls }) => {
      await host.elements({ point: { x: 1, y: 2 }, fresh: true });
      await host.elements({ point: { x: 1, y: 2 } });
      assert.deepEqual(calls, [
        { method: "elements", point: { x: 1, y: 2 }, fresh: true },
        { method: "elements", point: { x: 1, y: 2 } },
      ]);
    },
  );
});

test("elements is null for a restricted page or a window the helper does not own", async () => {
  await withCompanion(
    () => ({ result: null }),
    async ({ host }) => {
      assert.equal(await host.elements({ point: { x: 1, y: 1 } }), null);
    },
  );
});

test("translatePage and openPdfReader return the helper's answer", async () => {
  await withCompanion(
    (message) => ({ ok: message.method === "open-pdf-reader" || message.on }),
    async ({ host, calls }) => {
      assert.deepEqual(await host.translatePage({ on: true }), { ok: true });
      assert.deepEqual(await host.translatePage({ on: false }), { ok: false });
      assert.deepEqual(await host.openPdfReader(), { ok: true });
      assert.deepEqual(
        calls.map((call) => [call.method, call.on]),
        [
          ["translate-page", true],
          ["translate-page", false],
          ["open-pdf-reader", undefined],
        ],
      );
    },
  );
});

test("a vanished companion is forgotten and its calls fall back quietly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-host-gone-"));
  const descriptor = join(directory, "desktop.json");
  const token = "c".repeat(64);
  const companion = createServer((req, res) =>
    res.end(JSON.stringify({ companion: true })),
  );
  await new Promise((resolve) => companion.listen(0, "127.0.0.1", resolve));
  const host = await startDesktopHost({ directory, descriptor });
  try {
    const client = (await discoverDesktop(descriptor)).client;
    await client.rpc("companion", {
      url: `http://127.0.0.1:${companion.address().port}/desktop-companion`,
      token,
    });
    companion.closeAllConnections();
    await new Promise((resolve) => companion.close(resolve));
    assert.equal(await host.elements({ point: { x: 1, y: 1 } }), null);
    assert.deepEqual(await host.fullPage(), { companionRequired: true });
  } finally {
    await host.close();
    await rm(directory, { recursive: true });
  }
});
