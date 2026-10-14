// The one live Remote Control check: opt-in, paid, never run in CI or the unit suite.
// It uses the host's logged-in Claude and a single tiny prompt. The session is named
// "Glimpselet test" and is not kept on exit, so nothing is left in the account's list.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { DesktopSessionBridge } from "../index.mjs";

process.env.GLIMPSELET_REMOTE = "test";
const directory = await mkdtemp(join(tmpdir(), "glimpselet-remote-check-"));
const events = [];
const waitFor = async (predicate, timeout = 90000) => {
  const end = Date.now() + timeout;
  while (!events.some(predicate)) {
    if (Date.now() > end) throw new Error("Remote check timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return events.find(predicate);
};
const bridge = new DesktopSessionBridge({
  userDataDir: join(directory, "user-data"),
  cwd: directory,
});
try {
  bridge.subscribe((event) => events.push(event));
  await bridge.connect();
  const identity = await waitFor((event) => event.type === "identity");
  assert.match(identity.url, /^https:\/\/claude\.ai\/code\//);
  const turn = {
    id: randomUUID(),
    source: "composer",
    text: "Reply OK.",
    attachments: [],
  };
  await bridge.send(turn);
  await waitFor((event) => event.type === "done" && event.turnId === turn.id);
  process.stdout.write(`remote check passed: ${identity.url}\n`);
} finally {
  await bridge.dispose();
  await rm(directory, { recursive: true, force: true });
}
