import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  oneShotRequest,
  persistentRequest,
} from "./sources/helper-process.mjs";
import { createAxMacos } from "./sources/ax-macos.mjs";
import { createAxWindows } from "./sources/ax-windows.mjs";

// A stand-in child process: whatever the test writes to `out` is what the
// helper "printed", and `written` collects what was sent to its stdin.
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.written = [];
  child.stdin.on("data", (chunk) => child.written.push(String(chunk)));
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit("exit");
  };
  return child;
}
const spawner = () => {
  const spawned = [];
  const spawnFn = (command, args, options) => {
    const child = fakeChild();
    child.command = command;
    child.args = args;
    child.options = options;
    spawned.push(child);
    return child;
  };
  return { spawnFn, spawned };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("persistent: one process serves many requests, matched by id", async () => {
  const { spawnFn, spawned } = spawner();
  const request = persistentRequest({
    command: "py",
    args: ["-I", "x.py"],
    spawnFn,
  });
  const a = request("tree", { app: "a" });
  const b = request("focus");
  assert.equal(spawned.length, 1);
  const sent = spawned[0].written.join("").trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    sent.map((s) => [s.id, s.cmd]),
    [
      [1, "tree"],
      [2, "focus"],
    ],
  );
  // Answers may come back in any order, and split across chunks.
  spawned[0].stdout.write(
    '{"id":2,"ok":true,"result":{"secure":false}}\n{"id":1,"ok',
  );
  spawned[0].stdout.write('":true,"result":{"found":true}}\n');
  assert.deepEqual(await b, { secure: false });
  assert.deepEqual(await a, { found: true });
});

test("persistent: errors, noise and unknown ids are survived", async () => {
  const { spawnFn, spawned } = spawner();
  const request = persistentRequest({ command: "py", spawnFn });
  const bad = request("tree");
  spawned[0].stdout.write("not json\n");
  spawned[0].stdout.write('{"id":99,"ok":true,"result":1}\n');
  spawned[0].stdout.write('{"id":1,"ok":false,"error":"no bus"}\n');
  await assert.rejects(bad, /no bus/);
  const good = request("ping");
  spawned[0].stdout.write('{"id":2,"ok":true,"result":{"pong":true}}\n');
  assert.deepEqual(await good, { pong: true });
});

test("persistent: a request that is never answered times out", async () => {
  const { spawnFn } = spawner();
  const request = persistentRequest({ command: "py", spawnFn, timeout: 20 });
  await assert.rejects(request("tree"), /timed out/);
});

test("persistent: a helper that dies fails what waits and restarts for the next", async () => {
  const { spawnFn, spawned } = spawner();
  const request = persistentRequest({ command: "py", spawnFn });
  const lost = request("tree");
  spawned[0].emit("exit");
  await assert.rejects(lost, /exited/);
  const again = request("ping");
  assert.equal(spawned.length, 2, "a new process was started");
  spawned[1].stdout.write('{"id":2,"ok":true,"result":"up"}\n');
  assert.equal(await again, "up");
});

test("persistent: a helper that cannot start rejects instead of throwing", async () => {
  const request = persistentRequest({
    command: "missing",
    spawnFn: () => {
      throw new Error("ENOENT");
    },
  });
  await assert.rejects(request("tree"), /ENOENT/);
});

test("persistent: close stops the process and fails what waits", async () => {
  const { spawnFn, spawned } = spawner();
  const request = persistentRequest({ command: "py", spawnFn });
  const waiting = request("tree");
  request.close();
  await assert.rejects(waiting, /closed/);
  assert.equal(spawned[0].killed, true);
  await tick();
});

test("one-shot: the request goes in the arguments and the JSON comes back", async () => {
  const { spawnFn, spawned } = spawner();
  const request = oneShotRequest({
    command: "osascript",
    argsFor: (body) => ["-l", "JavaScript", "ax.js", body],
    spawnFn,
  });
  const answer = request("tree", { app: "Notes" });
  const child = spawned[0];
  assert.equal(child.command, "osascript");
  assert.deepEqual(JSON.parse(child.args[3]), {
    cmd: "tree",
    window: { app: "Notes" },
  });
  child.stdout.write('{"found":true,');
  child.stdout.write('"nodes":[]}');
  child.emit("close");
  assert.deepEqual(await answer, { found: true, nodes: [] });
});

test("one-shot: the body can go to stdin, and bad output rejects", async () => {
  const { spawnFn, spawned } = spawner();
  const request = oneShotRequest({
    command: "powershell.exe",
    argsFor: () => ["-File", "uia.ps1"],
    input: (body) => body,
    spawnFn,
  });
  const answer = request("focus");
  const child = spawned[0];
  await tick();
  assert.deepEqual(JSON.parse(child.written.join("")), {
    cmd: "focus",
    window: {},
  });
  child.stdout.write("Warning: not json");
  child.emit("close");
  await assert.rejects(answer, /no JSON/);
});

test("one-shot: a hung script is killed at the timeout", async () => {
  const { spawnFn, spawned } = spawner();
  const request = oneShotRequest({
    command: "osascript",
    argsFor: () => [],
    timeout: 20,
    spawnFn,
  });
  await assert.rejects(request("tree"), /timed out/);
  assert.equal(spawned[0].killed, true);
});

const mac = {
  id: "w1",
  app: "Notes",
  title: "Shopping",
  pid: 9,
  bounds: { x: 100, y: 50, width: 400, height: 300 },
};
const retina = [
  { id: 1, scaleFactor: 2, bounds: { x: 0, y: 0, width: 1440, height: 900 } },
];
const point = (i, p, role, x, y, width, height, over = {}) => ({
  i,
  p,
  role,
  secure: false,
  name: "",
  text: "",
  bounds: { x, y, width, height },
  ...over,
});

test("macOS: points are already DIP and are passed through unscaled", async () => {
  let asked;
  const source = createAxMacos({
    displays: () => retina,
    request: async (cmd, payload) => {
      asked = payload;
      return {
        found: true,
        nodes: [
          point(0, -1, "AXWindow", 100, 50, 400, 300, { name: "Shopping" }),
          point(1, 0, "AXTextArea", 110, 90, 380, 200, { text: "milk, eggs" }),
          point(2, 0, "AXTextField", 110, 300, 200, 20, {
            secure: true,
            text: "hunter2",
            name: "Password",
          }),
        ],
      };
    },
  });
  const loaded = await source.load(mac, { displays: retina });
  assert.deepEqual(asked.bounds, mac.bounds, "the window goes out in DIP");
  const area = loaded.elements.find((e) => e.role === "AXTextArea");
  assert.deepEqual(area.bounds, { x: 110, y: 90, width: 380, height: 200 });
  assert.equal(area.text, "milk, eggs");
  for (const e of loaded.elements) if (e.secure) assert.equal(e.text, "");
});

test("Windows: physical pixels are divided by the display scale", async () => {
  const hidpi = [
    {
      id: 1,
      scaleFactor: 1.5,
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
    },
  ];
  let asked;
  const source = createAxWindows({
    displays: () => hidpi,
    request: async (cmd, payload) => {
      asked = payload;
      return {
        found: true,
        nodes: [
          point(0, -1, "Window", 150, 75, 600, 450),
          point(1, 0, "Edit", 165, 150, 300, 30, { text: "hello" }),
        ],
      };
    },
  });
  const loaded = await source.load(
    { ...mac, bounds: { x: 100, y: 50, width: 400, height: 300 } },
    { displays: hidpi },
  );
  assert.deepEqual(asked.bounds, { x: 150, y: 75, width: 600, height: 450 });
  const edit = loaded.elements.find((e) => e.role === "Edit");
  assert.deepEqual(edit.bounds, { x: 110, y: 100, width: 200, height: 20 });
});
