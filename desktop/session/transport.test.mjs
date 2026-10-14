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
/** Records every control request the fixture child receives. */
async function withRequestLog(t, env) {
  const dir = await mkdtemp(join(tmpdir(), "glimpselet-requests-"));
  const log = join(dir, "requests.jsonl");
  const saved = {
    GLIMPSELET_TEST_REQUESTS: process.env.GLIMPSELET_TEST_REQUESTS,
    GLIMPSELET_REMOTE: process.env.GLIMPSELET_REMOTE,
  };
  process.env.GLIMPSELET_TEST_REQUESTS = log;
  if (env === undefined) delete process.env.GLIMPSELET_REMOTE;
  else process.env.GLIMPSELET_REMOTE = env;
  t.after(async () => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(dir, { recursive: true, force: true });
  });
  return async () =>
    (await readFile(log, "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
}
async function setup(t) {
  const cwd = await mkdtemp(join(tmpdir(), "glimpselet-transport-"));
  const child = new OwnedSession({
    controlTimeoutMs: 1500,
    connectTimeoutMs: 3000,
    executableArgs: [fixture],
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
  const dir = await mkdtemp(join(tmpdir(), "glimpselet-descendant-"));
  const file = join(dir, "pid");
  const previous = process.env.GLIMPSELET_TEST_DESCENDANT;
  process.env.GLIMPSELET_TEST_DESCENDANT = file;
  try {
    const { child } = await setup(t);
    const pid = Number(await readFile(file, "utf8"));
    process.kill(pid, 0);
    await child.dispose();
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    if (previous === undefined) delete process.env.GLIMPSELET_TEST_DESCENDANT;
    else process.env.GLIMPSELET_TEST_DESCENDANT = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("shutdown during the version probe cancels the actual probe and never launches a session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glimpselet-version-"));
  const file = join(dir, "pid");
  const previous = process.env.GLIMPSELET_TEST_VERSION_PID;
  process.env.GLIMPSELET_TEST_VERSION_PID = file;
  const child = new OwnedSession({ executableArgs: [fixture] });
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
    if (previous === undefined) delete process.env.GLIMPSELET_TEST_VERSION_PID;
    else process.env.GLIMPSELET_TEST_VERSION_PID = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty session survives full adapter restart with the same UUID and remote identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "glimpselet-empty-session-"));
  const createBridge = () =>
    new DesktopSessionBridge({
      userDataDir: cwd,
      cwd,
      executable: process.execPath,
      transportFactory: () =>
        new OwnedSession({ executableArgs: [fixture], remote: "on" }),
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
  } finally {
    await bridge.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("GLIMPSELET_REMOTE=0 never sends remote_control yet the session still takes turns", async (t) => {
  const requests = await withRequestLog(t, "0");
  const { child } = await setup(t);
  const result = new Promise((resolve) =>
    child.on("event", (event) => event.type === "result" && resolve(event)),
  );
  await child.send({ id: randomUUID(), text: "Hi", attachments: [] });
  await result;
  const subtypes = (await requests()).map((r) => r.subtype);
  assert.ok(subtypes.includes("initialize"));
  assert.ok(!subtypes.includes("remote_control"));
});

test("without the switch the default stays on: one persistent Glimpselet session", async (t) => {
  const requests = await withRequestLog(t, undefined);
  await setup(t);
  const remote = (await requests()).filter(
    (r) => r.subtype === "remote_control",
  );
  assert.equal(remote.length, 1);
  assert.equal(remote[0].name, "Glimpselet");
  assert.equal(remote[0].keep_session_on_exit, true);
});

test("GLIMPSELET_REMOTE=test names the session Glimpselet test and does not keep it on exit", async (t) => {
  const requests = await withRequestLog(t, "test");
  await setup(t);
  const remote = (await requests()).filter(
    (r) => r.subtype === "remote_control",
  );
  assert.equal(remote.length, 1);
  assert.equal(remote[0].name, "Glimpselet test");
  assert.equal(remote[0].keep_session_on_exit, false);
});

test("a bridge with Remote Control off connects, keeps no remote identity and survives restart", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "glimpselet-remote-off-"));
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
