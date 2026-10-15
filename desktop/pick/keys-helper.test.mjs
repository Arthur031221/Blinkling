import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { createHelperKeySource, keytapPath } from "./keys-helper.mjs";

function fake() {
  const procs = [];
  const spawn = (command, args, options) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stdout.setEncoding = () => {};
    proc.stdin = {
      destroyed: false,
      destroy: () => (proc.stdin.destroyed = true),
    };
    proc.killed = [];
    proc.kill = (signal) => proc.killed.push(signal);
    proc.command = command;
    proc.options = options;
    procs.push(proc);
    return proc;
  };
  return { spawn, procs };
}

function make(overrides = {}) {
  const f = fake();
  const events = [];
  const errors = [];
  const source = createHelperKeySource({
    command: "/res/blinkling-keytap",
    spawn: f.spawn,
    handle: (e) => events.push(e),
    onError: (e) => errors.push(e),
    ...overrides,
  });
  return { f, events, errors, source };
}

test("lines from the helper become pick key events, even split across chunks", async () => {
  const { f, events, source } = make();
  const started = source.start();
  f.procs[0].stdout.emit("data", "ready lis");
  f.procs[0].stdout.emit("data", "ten\nkd 29\nku 2");
  f.procs[0].stdout.emit("data", "9\nmd 0\nwh 0\nkd 1001\n");
  assert.deepEqual(await started, { ok: true });
  assert.deepEqual(events, [
    { type: "keydown", code: 29 },
    { type: "keyup", code: 29 },
    { type: "mousedown", code: undefined },
    { type: "wheel", code: undefined },
    { type: "keydown", code: 1001 },
  ]);
  assert.equal(source.started(), true);
});

test("a refusal resolves not ok with the DENIED code and reaps the helper", async () => {
  const { f, errors, source } = make();
  const started = source.start();
  f.procs[0].stdout.emit("data", "denied\n");
  const result = await started;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DENIED");
  assert.deepEqual(f.procs[0].killed, ["SIGTERM"]);
  assert.equal(source.started(), false);
  assert.equal(errors.length, 1);
});

test("a helper that exits or stays silent before it is ready fails the start", async () => {
  const early = make();
  const a = early.source.start();
  early.f.procs[0].emit("exit", 3);
  assert.equal((await a).error.code, "EXIT");

  let fire;
  const silent = make({
    setTimer: (fn) => ((fire = fn), 1),
    clearTimer: () => {},
  });
  const b = silent.source.start();
  fire();
  assert.equal((await b).error.code, "TIMEOUT");
  assert.deepEqual(silent.f.procs[0].killed, ["SIGTERM"]);
});

test("a missing helper or a spawn that throws answers not ok without throwing", async () => {
  const none = make({ command: null });
  assert.equal((await none.source.start()).error.code, "MISSING");
  const boom = make({
    spawn: () => {
      throw new Error("EACCES");
    },
  });
  assert.equal((await boom.source.start()).ok, false);
});

test("a helper that dies later releases held keys and the next start spawns a fresh one", async () => {
  const { f, events, errors, source } = make();
  const first = source.start();
  f.procs[0].stdout.emit("data", "ready active\nkd 29\n");
  await first;
  f.procs[0].emit("exit", 1);
  assert.deepEqual(events.at(-1), { type: "keyup", code: 29 });
  assert.equal(errors.length, 1);
  assert.equal(source.started(), false);
  const second = source.start();
  f.procs[1].stdout.emit("data", "ready listen\n");
  assert.deepEqual(await second, { ok: true });
  assert.equal(f.procs.length, 2);
});

test("stop signals the helper without waiting for it and releases held keys", async () => {
  const { f, events, source } = make();
  const started = source.start();
  f.procs[0].stdout.emit("data", "ready listen\nkd 3613\n");
  await started;
  source.stop();
  assert.deepEqual(f.procs[0].killed, ["SIGTERM"]);
  assert.equal(f.procs[0].stdin.destroyed, true);
  assert.deepEqual(events.at(-1), { type: "keyup", code: 3613 });
  assert.equal(source.started(), false);
  // A late exit of the stopped helper changes nothing.
  f.procs[0].emit("exit", 0);
  assert.equal(events.length, 2);
});

test("a burst of events never holds the main thread", async () => {
  const { f, events, source } = make();
  const started = source.start();
  f.procs[0].stdout.emit("data", "ready listen\n");
  await started;
  let worst = 0;
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 5);
    last = now;
  }, 5);
  for (let burst = 0; burst < 50; burst++) {
    f.procs[0].stdout.emit("data", "wh 0\n".repeat(200));
    await new Promise((r) => setImmediate(r));
  }
  clearInterval(probe);
  assert.equal(events.length, 10000);
  assert.ok(worst < 50, `main thread stalled ${worst} ms`);
});

test("the helper is found in the app resources, then the build folder, else null", () => {
  const seen = new Set([join("/app/res", "blinkling-keytap")]);
  const exists = (p) => seen.has(p);
  assert.equal(
    keytapPath({ resourcesPath: "/app/res", appDir: "/src/desktop", exists }),
    join("/app/res", "blinkling-keytap"),
  );
  seen.clear();
  seen.add(join("/src/desktop", "pick", "native", "build", "blinkling-keytap"));
  assert.equal(
    keytapPath({ resourcesPath: "/app/res", appDir: "/src/desktop", exists }),
    join("/src/desktop", "pick", "native", "build", "blinkling-keytap"),
  );
  seen.clear();
  assert.equal(
    keytapPath({ resourcesPath: "/app/res", appDir: "/s", exists }),
    null,
  );
});
