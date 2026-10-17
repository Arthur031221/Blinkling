import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  joinSession,
  leaveSession,
  hookSessionId,
  stopWithSession,
  SESSION_TTL_MS,
} from "./sessions.mjs";

const folder = () => mkdtemp(join(tmpdir(), "blinkling-sessions-"));
const ids = async (directory) =>
  JSON.parse(await readFile(join(directory, "sessions.json"), "utf8")).map(
    (e) => e.id,
  );

test("sessions join once, leave one by one, and stale ones stop counting", async () => {
  const directory = await folder();
  await joinSession(directory, "a", 1000);
  await joinSession(directory, "b", 1000);
  await joinSession(directory, "a", 2000);
  assert.deepEqual(await ids(directory), ["b", "a"]);
  assert.equal((await leaveSession(directory, "b", 3000)).length, 1);
  const later = 3000 + SESSION_TTL_MS;
  assert.equal((await leaveSession(directory, "nobody", later)).length, 0);
});

test("the hook payload gives the session id, and anything else gives none", async () => {
  assert.equal(
    await hookSessionId(Readable.from(['{"session_id":"s1","x":1}'])),
    "s1",
  );
  assert.equal(await hookSessionId(Readable.from(["nope"])), "");
  assert.equal(await hookSessionId(Readable.from(['{"session_id":7}'])), "");
});

async function fakeBlink(directory) {
  const token = "a".repeat(64);
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, version: "3.2.4" }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    join(directory, "desktop.json"),
    JSON.stringify({
      url,
      host: url,
      token,
      pid: process.pid,
      version: "3.2.4",
    }),
    { mode: 0o600 },
  );
  return { calls, close: () => server.close() };
}

test("the last session to end quits Blink and keeps the restart marker; others leave it running", async () => {
  const directory = await folder();
  const blink = await fakeBlink(directory);
  try {
    await joinSession(directory, "a");
    await joinSession(directory, "b");
    const first = await stopWithSession({ directory, id: "a" });
    assert.deepEqual(first, { stopped: false, remaining: 1 });
    assert.equal(
      blink.calls.some((c) => c.includes("shutdown")),
      false,
    );
    const last = await stopWithSession({ directory, id: "b" });
    assert.equal(last.stopped, true);
    assert.equal(
      blink.calls.some((c) => c.includes("shutdown")),
      true,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, "enabled.json"), "utf8")),
      { enabled: true },
    );
  } finally {
    blink.close();
  }
});

test("a session end without an id leaves Blink alone", async () => {
  const directory = await folder();
  const blink = await fakeBlink(directory);
  try {
    assert.equal((await stopWithSession({ directory, id: "" })).stopped, false);
    assert.equal(blink.calls.length, 0);
  } finally {
    blink.close();
  }
});
