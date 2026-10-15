import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DesktopSessionBridge, OwnedSession } from "../session/index.mjs";
import { transcriptPath } from "../session/storage.mjs";
import { AutoWatch } from "../autowatch/index.mjs";
import { installPrivacy } from "./index.mjs";
import { say } from "./strings.mjs";

const fixture = fileURLToPath(
  new URL("../session/e2e/fake-claude.fixture.mjs", import.meta.url),
);
const pages = JSON.parse(
  await readFile(
    new URL("../autowatch/fixtures/white-pages.json", import.meta.url),
    "utf8",
  ),
);
const waitFor = async (check, ms = 8000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
};

test("PV-3: through a real Claude child the limit is one bubble and one event, auto explain waits and then returns, and nothing looks like an error", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "blinkling-limit-"));
  const resetsAt = 4_000_000_000;
  process.env.BLINKLING_TEST_LIMIT_RESET = String(resetsAt);
  const bridge = new DesktopSessionBridge({
    userDataDir: dir,
    cwd: dir,
    executable: process.execPath,
    transportFactory: () =>
      new OwnedSession({ executableArgs: [fixture], remote: "off" }),
    readTranscript: async (cwd, id) => {
      try {
        return (
          await readFile(transcriptPath(cwd, id, cwd + "/.test-claude"), "utf8")
        )
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    },
    retry: { minMs: 10, maxMs: 30 },
  });
  t.after(() => bridge.dispose());
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seen = [];
  bridge.subscribe((e) => seen.push(e), { visible: true });
  const sent = [];
  const clock = { now: 1_000 };
  const states = [];
  const capture = {
    busy: false,
    screen: async () => ({
      image: { id: "i", name: "i.png", mediaType: "image/png", data: "eA==" },
    }),
  };
  const auto = new AutoWatch({
    session: bridge,
    capture,
    displayId: () => "1",
    sample: async () =>
      Buffer.from(pages[clock.page ?? "docSection1"], "base64"),
    idleSeconds: () => 10,
    now: () => clock.now,
    onState: (s) => states.push(s),
  });
  t.after(() => auto.dispose());
  const privacy = installPrivacy({
    session: bridge,
    features: { capture, auto },
    locator: { focus: () => ({ secure: false, window: null }) },
    send: (e) => sent.push(e),
    languages: ["fr-FR"],
    now: () => clock.now,
  });
  t.after(() => privacy.dispose());

  await bridge.connect();
  await waitFor(() => bridge.status.state === "connected");
  auto.enable();
  await auto.tick();
  await bridge.send({
    id: "11111111-1111-4111-8111-111111111111",
    text: "limit-me",
    source: "composer",
    attachments: [],
  });
  await waitFor(() => sent.some((e) => e.type === "blink-say"));
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(seen.filter((e) => e.type === "usage-limit").length, 1);
  assert.equal(
    seen.find((e) => e.type === "usage-limit").resetAt,
    resetsAt * 1000,
  );
  const says = sent.filter((e) => e.type === "blink-say");
  assert.equal(says.length, 1, "exactly one bubble");
  assert.doesNotMatch(says[0].text, /\{time\}/);
  assert.notEqual(says[0].text, say("en")("usageLimitUnknown"));
  assert.ok(
    !seen.some(
      (e) => e.type === "status" && ["blocked", "retrying"].includes(e.state),
    ),
    "no error or reconnect state",
  );
  assert.ok(
    !seen.some(
      (e) => e.type === "message" && /hit your limit/i.test(JSON.stringify(e)),
    ),
  );
  assert.deepEqual(states.at(-1), {
    enabled: true,
    state: "paused",
    until: resetsAt * 1000,
  });

  clock.page = "docSection2";
  clock.now = 60_000;
  await auto.tick();
  await auto.tick();
  assert.equal(
    bridge.state.turns.filter((x) => x.turn.source === "auto-explain").length,
    0,
  );

  clock.now = resetsAt * 1000;
  await auto.tick();
  assert.equal(states.at(-1).state, "watching");
  await auto.tick();
  await auto.tick();
  assert.equal(
    bridge.state.turns.filter((x) => x.turn.source === "auto-explain").length,
    1,
  );
  assert.equal(sent.filter((e) => e.type === "blink-say").length, 1);
});
