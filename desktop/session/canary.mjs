/** Opt-in paid live check: run with the host's logged-in Claude, never in the unit suite.
 * A server transcript may be supplied by a test-only authenticated observer.
 * This module, like the production bridge, never reads account credentials.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { DesktopSessionBridge, OwnedSession } from "./index.mjs";
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAX0lEQVR4nO3PQQ0AIBDAMMC/50MEj4ZkVbDtWX87OuBVA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA9oFUoUBf3Xr7AgAAAAASUVORK5CYII=";
const sources = ["composer", "quick-ask", "guide", "auto-explain", "companion"];
export async function runCanary({ reportDir, holdMs = 0, observer }) {
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  const events = [];
  const turns = [];
  let bridge;
  const options = {
    userDataDir: join(reportDir, "canary-user-data"),
    cwd: reportDir,
    // The one final Remote Control check: a disposable "Glimpselet test"
    // session that Claude Code removes on exit.
    transportFactory: () => new OwnedSession({ remote: "test" }),
  };
  const record = (event) => events.push(event);
  const awaitEvent = async (predicate, timeout = 90000) => {
    const end = Date.now() + timeout;
    while (!events.some(predicate)) {
      if (Date.now() > end) throw new Error("Live Claude canary timed out");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return events.find(predicate);
  };
  try {
    bridge = new DesktopSessionBridge(options);
    bridge.subscribe(record);
    await bridge.connect();
    const identity = await awaitEvent((event) => event.type === "identity");
    await writeFile(
      join(reportDir, "live-identity.json"),
      JSON.stringify(identity, null, 2),
    );
    process.stdout.write(`Remote Control: ${identity.url}\n`);
    for (const source of sources) {
      const turn = {
        id: randomUUID(),
        source,
        text: "Name this color. One word.",
        attachments: [
          {
            id: randomUUID(),
            name: "red.png",
            mediaType: "image/png",
            data: image,
          },
        ],
      };
      turns.push(turn);
      await bridge.send(turn);
      await awaitEvent(
        (event) => event.type === "done" && event.turnId === turn.id,
      );
    }
    const chosen = await bridge.select({ model: "sonnet", effort: "medium" });
    assert.match(chosen.model, /sonnet/);
    assert.equal(chosen.effort, "medium");
    await bridge.select({ model: "haiku", effort: "low" });
    // Actual process loss, not a fabricated renderer connection event.
    const identityCount = events.filter(
      (event) => event.type === "identity",
    ).length;
    bridge.transport.child.kill("SIGTERM");
    await awaitEvent(
      () =>
        events.filter((event) => event.type === "identity").length >
        identityCount,
    );
    assert.deepEqual(
      events.filter((event) => event.type === "identity").at(-1),
      identity,
    );
    await bridge.dispose();
    bridge = new DesktopSessionBridge(options);
    bridge.subscribe(record);
    await bridge.connect();
    assert.deepEqual(
      events.filter((event) => event.type === "identity").at(-1),
      identity,
    );
    const resumed = {
      id: randomUUID(),
      source: "composer",
      text: "Reply OK.",
      attachments: [],
    };
    turns.push(resumed);
    await bridge.send(resumed);
    await awaitEvent(
      (event) => event.type === "done" && event.turnId === resumed.id,
    );
    if (holdMs) {
      process.stdout.write(
        `Waiting ${holdMs} ms for human browser/phone input.\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, holdMs));
    }
    const remoteEvidence = observer ? await observer(identity, turns) : null;
    if (remoteEvidence) assertServerTranscript(remoteEvidence, turns);
    const report = {
      version: "2.1.296",
      identity,
      selection: chosen,
      sources,
      turnIds: turns.map((turn) => turn.id),
      serverTranscriptVerified: Boolean(remoteEvidence),
      humanOriginMessages: events.filter(
        (event) =>
          event.type === "message" &&
          event.role === "user" &&
          !turns.some((turn) => turn.id === event.id),
      ),
      events,
    };
    await writeFile(
      join(reportDir, "live-canary.json"),
      JSON.stringify(report, null, 2),
    );
    return report;
  } finally {
    await bridge?.dispose();
    await writeFile(
      join(reportDir, "live-events.json"),
      JSON.stringify(events, null, 2),
    );
  }
}
export function assertServerTranscript(evidence, turns) {
  const payloads = evidence.data.map((event) => event.payload ?? event);
  for (const turn of turns) {
    const users = payloads.filter(
      (event) => event.type === "user" && event.uuid === turn.id,
    );
    assert.equal(
      users.length,
      1,
      `remote turn ${turn.id} must occur exactly once`,
    );
    for (const attachment of turn.attachments)
      assert.ok(
        users[0].message.content.some(
          (block) =>
            block.type === "image" && block.source?.data === attachment.data,
        ),
      );
  }
  assert.ok(
    payloads.filter((event) => event.type === "assistant").length >=
      turns.length,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const reportDir = resolve(process.argv[2] ?? "canary-report");
  const observer = process.argv[3]
    ? (await import(pathToFileURL(resolve(process.argv[3])).href)).observe
    : undefined;
  // Optional test observer receives identity only, never a credential or private configuration.
  await runCanary({ reportDir, observer });
}
export async function verifySavedServerEvidence(file, turns) {
  assertServerTranscript(JSON.parse(await readFile(file, "utf8")), turns);
}
