import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { OwnedSession, DesktopSessionBridge } from "./index.mjs";
import { transcriptPath } from "./storage.mjs";
const fixture = fileURLToPath(
  new URL("./e2e/fake-claude.fixture.mjs", import.meta.url),
);
async function setup(t) {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-transport-"));
  const child = new OwnedSession({
    controlTimeoutMs: 1500,
    connectTimeoutMs: 3000,
    executableArgs: [fixture],
    remote: "on", // the fixture is a fake child; it can create nothing in an account
  });
  t.after(async () => {
    await child.dispose();
    await rm(cwd, { recursive: true, force: true });
  });
  await child.connect({
    cwd,
    executable: process.execPath,
    localId: randomUUID(),
    model: "haiku",
    effort: "low",
  });
  return { child, cwd };
}
test("actual child completes handshake, streams image turns, applies controls and is reaped", async (t) => {
  const { child } = await setup(t);
  const pid = child.child.pid;
  const frames = [];
  child.on("event", (e) => frames.push(e));
  const result = new Promise((resolve) =>
    child.on("event", (event) => {
      if (event.type === "result") resolve(event);
    }),
  );
  await child.send({
    id: randomUUID(),
    text: "Hi",
    attachments: [{ mediaType: "image/png", data: "aGVsbG8=" }],
  });
  await result;
  assert.ok(frames.some((e) => e.type === "stream_event"));
  assert.equal(
    frames.find((e) => e.type === "user").message.content[0].source.data,
    "aGVsbG8=",
  );
  assert.deepEqual(await child.select({ model: "sonnet", effort: "medium" }), {
    model: "sonnet",
    effort: "medium",
  });
  await child.dispose();
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
test(
  "actual child receives the composer PDF and text with the same session and turn IDs",
  { timeout: 5000 },
  async (t) => {
    const { child } = await setup(t);
    const id = randomUUID();
    const sessionId = randomUUID();
    const pdf = Buffer.from("%PDF-1.7\nfixture").toString("base64");
    const text = "日本語 notes";
    const replay = new Promise((resolve) => {
      child.on("event", (event) => {
        if (event.type === "user" && event.uuid === id) resolve(event);
      });
    });
    await child.send(
      {
        id,
        text: "Explain.",
        attachments: [
          {
            id: "pdf",
            name: "paper.pdf",
            mediaType: "application/pdf",
            data: pdf,
          },
          {
            id: "txt",
            name: "notes.txt",
            mediaType: "text/plain",
            data: Buffer.from(text).toString("base64"),
          },
        ],
      },
      sessionId,
    );
    const message = await replay;
    assert.equal(message.session_id, sessionId);
    assert.deepEqual(message.message.content, [
      {
        type: "document",
        title: "paper.pdf",
        source: { type: "base64", media_type: "application/pdf", data: pdf },
      },
      {
        type: "document",
        title: "notes.txt",
        source: { type: "text", media_type: "text/plain", data: text },
      },
      { type: "text", text: "Explain." },
    ]);
  },
);
test("invalid stream frames fault and teardown rejects pending controls", async (t) => {
  const { child } = await setup(t);
  const fault = new Promise((resolve) => child.once("fault", resolve));
  await child.send({ id: randomUUID(), text: "malformed", attachments: [] });
  assert.match((await fault).message, /Invalid Claude stream/);
  await assert.rejects(child.stop(), /closed/);
});

test("interrupt cancels an active turn in the actual child before it emits an answer", async (t) => {
  const { child } = await setup(t);
  const frames = [];
  child.on("event", (event) => frames.push(event));
  const result = new Promise((resolve) =>
    child.on("event", (event) => {
      if (event.type === "result") resolve(event);
    }),
  );
  await child.send({ id: randomUUID(), text: "Hi", attachments: [] });
  await child.stop();
  assert.equal((await result).subtype, "error_during_execution");
  assert.equal(frames.filter((event) => event.type === "assistant").length, 0);
});

test("only the owned child's nested marker is cleared, never the parent environment", async (t) => {
  const original = process.env.CLAUDECODE;
  process.env.CLAUDECODE = "parent-session";
  try {
    const { child } = await setup(t);
    assert.equal(child.initialized.nestedMarker, false);
    assert.equal(process.env.CLAUDECODE, "parent-session");
  } finally {
    if (original === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = original;
  }
});

test("shutdown terminates the actual owned process tree, including descendants", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "blinkling-descendant-"));
  const file = join(dir, "pid");
  const previous = process.env.BLINKLING_TEST_DESCENDANT;
  process.env.BLINKLING_TEST_DESCENDANT = file;
  try {
    const { child } = await setup(t);
    const pid = Number(await readFile(file, "utf8"));
    process.kill(pid, 0);
    await child.dispose();
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    if (previous === undefined) delete process.env.BLINKLING_TEST_DESCENDANT;
    else process.env.BLINKLING_TEST_DESCENDANT = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("shutdown during the version probe cancels the actual probe and never launches a session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-version-"));
  const file = join(dir, "pid");
  const previous = process.env.BLINKLING_TEST_VERSION_PID;
  process.env.BLINKLING_TEST_VERSION_PID = file;
  const child = new OwnedSession({ executableArgs: [fixture], remote: "on" });
  try {
    const connecting = child.connect({
      cwd: dir,
      executable: process.execPath,
      localId: randomUUID(),
    });
    const rejected = assert.rejects(connecting, /abort|closed/i);
    let pid;
    const deadline = Date.now() + 3000;
    while (!pid) {
      try {
        pid = Number(await readFile(file, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (Date.now() > deadline)
        throw new Error("Version probe did not launch");
      if (!pid) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await child.dispose();
    await rejected;
    assert.equal(child.child, undefined);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    await assert.rejects(child.connect({ cwd: dir }), /closed/);
  } finally {
    await child.dispose();
    if (previous === undefined) delete process.env.BLINKLING_TEST_VERSION_PID;
    else process.env.BLINKLING_TEST_VERSION_PID = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty session survives full adapter restart with the same UUID and remote identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-empty-session-"));
  const createBridge = (remote = "on") =>
    new DesktopSessionBridge({
      userDataDir: cwd,
      cwd,
      executable: process.execPath,
      transportFactory: () =>
        new OwnedSession({ executableArgs: [fixture], remote }),
      readTranscript: async (_, id) => {
        try {
          return (
            await readFile(
              transcriptPath(cwd, id, join(cwd, ".test-claude")),
              "utf8",
            )
          )
            .split("\n")
            .filter(Boolean)
            .map(JSON.parse);
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      },
    });
  let bridge = createBridge();
  try {
    await bridge.connect();
    const identity = bridge.identity();
    await bridge.dispose();
    bridge = createBridge();
    await bridge.connect();
    assert.equal(bridge.status.state, "connected");
    assert.deepEqual(bridge.identity(), identity);
    assert.ok(bridge.transport.child.spawnargs.includes("--session-id"));
    assert.ok(!bridge.transport.child.spawnargs.includes("--resume"));
    assert.equal(bridge.state.turns.length, 0);
    // A later local-only run (BLINKLING_REMOTE=0) leaves the stored identity alone.
    await bridge.dispose();
    bridge = createBridge("off");
    await bridge.connect();
    assert.equal(bridge.status.state, "connected");
    assert.deepEqual(bridge.identity(), identity);
  } finally {
    await bridge.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

async function requestsFor(t, mode, env = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-remote-mode-"));
  const log = join(cwd, "requests.jsonl");
  const saved = {
    log: process.env.BLINKLING_TEST_REQUESTS,
    remote: process.env.BLINKLING_REMOTE,
  };
  process.env.BLINKLING_TEST_REQUESTS = log;
  if (mode === undefined) delete process.env.BLINKLING_REMOTE;
  else process.env.BLINKLING_REMOTE = mode;
  const child = new OwnedSession({
    controlTimeoutMs: 1500,
    connectTimeoutMs: 3000,
    executableArgs: [fixture],
    ...env,
  });
  t.after(async () => {
    await child.dispose();
    for (const [key, value] of [
      ["BLINKLING_TEST_REQUESTS", saved.log],
      ["BLINKLING_REMOTE", saved.remote],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(cwd, { recursive: true, force: true });
  });
  const remote = await child.connect({
    cwd,
    executable: process.execPath,
    localId: randomUUID(),
    model: "haiku",
    effort: "low",
  });
  const requests = (await readFile(log, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  return { child, remote, requests };
}

test("BLINKLING_REMOTE=0 never sends remote_control yet the session still answers turns", async (t) => {
  const { child, remote, requests } = await requestsFor(t, "0");
  assert.ok(!requests.some((r) => r.subtype === "remote_control"));
  assert.equal(remote.session_url, null);
  assert.equal(remote.bridge_session_id, null);
  const done = new Promise((resolve) =>
    child.on("event", (e) => e.type === "result" && resolve(e)),
  );
  await child.send({ id: randomUUID(), text: "Hi", attachments: [] });
  await done;
});

test("the default keeps the named persistent Remote Control session for real users", async (t) => {
  const { requests } = await requestsFor(t, undefined);
  const remote = requests.filter((r) => r.subtype === "remote_control");
  assert.equal(remote.length, 1);
  assert.equal(remote[0].name, "Blinkling");
  assert.equal(remote[0].keep_session_on_exit, true);
});

test("BLINKLING_REMOTE=test makes one disposable session that disappears on exit", async (t) => {
  const { requests } = await requestsFor(t, "test");
  const remote = requests.filter((r) => r.subtype === "remote_control");
  assert.equal(remote.length, 1);
  assert.equal(remote[0].name, "Blinkling test");
  assert.equal(remote[0].keep_session_on_exit, false);
});

test("an explicit remote option overrides the environment", async (t) => {
  const { requests } = await requestsFor(t, "0", { remote: "on" });
  assert.equal(
    requests.filter((r) => r.subtype === "remote_control").length,
    1,
  );
});

test("a bridge with Remote Control off connects, keeps no remote identity and leaves no identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-remote-off-"));
  const bridge = new DesktopSessionBridge({
    userDataDir: cwd,
    cwd,
    executable: process.execPath,
    transportFactory: () =>
      new OwnedSession({ executableArgs: [fixture], remote: "off" }),
    readTranscript: async () => [],
  });
  try {
    await bridge.connect();
    assert.equal(bridge.status.state, "connected");
    assert.equal(bridge.state.remoteId, null);
    assert.equal(bridge.state.url, null);
  } finally {
    await bridge.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a bridge without Remote Control works and keeps any earlier remote identity untouched", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "blinkling-local-session-"));
  const create = (remote) =>
    new DesktopSessionBridge({
      userDataDir: cwd,
      cwd,
      executable: process.execPath,
      transportFactory: () =>
        new OwnedSession({ remote, executableArgs: [fixture] }),
      readTranscript: async () => [],
    });
  let bridge = create("test");
  try {
    await bridge.connect();
    const identity = bridge.identity();
    await bridge.dispose();
    bridge = create("off");
    await bridge.connect();
    assert.equal(bridge.status.state, "connected");
    assert.deepEqual(bridge.identity(), identity);
    const fresh = await mkdtemp(join(tmpdir(), "blinkling-local-fresh-"));
    await bridge.dispose();
    bridge = new DesktopSessionBridge({
      userDataDir: fresh,
      cwd: fresh,
      executable: process.execPath,
      transportFactory: () =>
        new OwnedSession({ remote: "off", executableArgs: [fixture] }),
      readTranscript: async () => [],
    });
    await bridge.connect();
    assert.equal(bridge.status.state, "connected");
    assert.equal(bridge.identity().remoteId, null);
    await bridge.dispose();
    await rm(fresh, { recursive: true, force: true });
  } finally {
    await bridge.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});
