import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDesktopHost } from "./host.mjs";
import { discoverDesktop } from "./client.mjs";
import { joinSession } from "./sessions.mjs";
import { notice, QUIT_NOTICE } from "./notice.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, ms = 5000) => {
  for (let t = 0; t < ms; t += 25) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error("Timed out waiting");
};

test("closing Blink tells a channel session by event and a plain session at its next prompt, once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-quit-"));
  const descriptor = join(directory, "desktop.json");
  const host = await startDesktopHost({ directory, descriptor });
  try {
    await joinSession(directory, "flag");
    await joinSession(directory, "plain");
    const { client } = await discoverDesktop(descriptor);
    const frames = [];
    const stop = new AbortController();
    void client
      .link(
        { session: "flag", pid: 1, cwd: "/work/a", channel: 1 },
        (frame) => frames.push(frame),
        stop.signal,
      )
      .catch(() => {});
    void client
      .link(
        { session: "plain", pid: 2, cwd: "/work/b", channel: 0 },
        () => {},
        stop.signal,
      )
      .catch(() => {});
    await until(() => host.links().length === 2);
    assert.equal(await host.announceQuit(), 1);
    await until(() => frames.some((f) => f.type === "notice"));
    assert.match(
      frames.find((f) => f.type === "notice").text,
      /Blink was closed/,
    );
    stop.abort();
    await host.close();

    // The flag session was told by event; only the other one is marked.
    const list = JSON.parse(
      await readFile(join(directory, "sessions.json"), "utf8"),
    );
    assert.equal(list.find((e) => e.id === "flag").quit, undefined);
    assert.ok(list.find((e) => e.id === "plain").quit);

    assert.equal(await notice({ session_id: "flag" }, directory), undefined);
    assert.deepEqual(await notice({ session_id: "plain" }, directory), {
      systemMessage: QUIT_NOTICE,
    });
    assert.equal(
      await notice({ session_id: "plain" }, directory),
      undefined,
      "told once",
    );
    assert.equal(await notice({}, directory), undefined);
    assert.equal(await notice(undefined, directory), undefined);
  } finally {
    await host.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("a session that finds Blink running again is not told it was closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-quit-"));
  const descriptor = join(directory, "desktop.json");
  const host = await startDesktopHost({ directory, descriptor });
  try {
    await joinSession(directory, "plain");
    await host.announceQuit();
    // Blink is up again (this host stands in for the new one).
    assert.equal(await notice({ session_id: "plain" }, directory), undefined);
    assert.equal(
      JSON.parse(await readFile(join(directory, "sessions.json"), "utf8"))[0]
        .quit,
      undefined,
      "the mark is cleared either way",
    );
  } finally {
    await host.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
