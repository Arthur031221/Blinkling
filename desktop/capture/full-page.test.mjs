import test from "node:test";
import assert from "node:assert/strict";
import { captureNotice, fullPageText, runFullPage } from "./full-page.mjs";

const tile = (n) => ({ id: `tile-${n}`, image: { id: `image-${n}` } });
function harness(fullPage) {
  const events = [];
  const attached = [];
  let required = 0;
  const started = Date.now();
  return {
    events,
    attached,
    required: () => required,
    run: () =>
      runFullPage({
        host: { fullPage },
        status: (event) => events.push({ ...event, at: Date.now() - started }),
        attach: async (capture) => attached.push(capture.id),
        companionRequired: () => required++,
      }),
  };
}
const notice = (events) =>
  events.reduce((current, event) => {
    const change = captureNotice({ type: "capture-status", ...event });
    return change ? (change.hidden ? undefined : change.text) : current;
  }, undefined);

test("shows progress within a second and replaces the pending message with the result", async () => {
  let release;
  const h = harness(
    (_signal, onProgress) =>
      new Promise((resolve) => {
        // The browser needs seconds to scroll a long page.
        release = () => {
          onProgress({ completed: 3, total: 30 });
          const tiles = [tile(1), tile(2)];
          resolve({ ...tiles[0], tiles, truncated: false });
        };
      }),
  );
  const running = h.run();
  assert.equal(
    h.events.length,
    1,
    "feedback exists before the browser answers",
  );
  assert.ok(h.events[0].at < 1000);
  assert.equal(h.events[0].message, fullPageText.starting);
  assert.equal(notice(h.events), fullPageText.starting);
  release();
  assert.deepEqual(await running, { ok: true });
  assert.equal(h.events[1].message, fullPageText.progress(3, 30));
  assert.deepEqual(h.attached, ["tile-1", "tile-2"]);
  assert.equal(h.events.at(-1).state, "done");
  assert.equal(notice(h.events), undefined, "no stale pending bubble remains");
});

test("replaces the pending message with an error when the capture fails", async () => {
  const h = harness(async () => {
    throw new Error("socket closed");
  });
  await assert.rejects(h.run(), /socket closed/);
  assert.equal(notice(h.events), fullPageText.failed);
  assert.equal(h.events.at(-1).state, "failed");
  assert.deepEqual(h.attached, []);
});

test("a failure while attaching a tile also replaces the pending message", async () => {
  const events = [];
  await assert.rejects(
    runFullPage({
      host: { fullPage: async () => ({ ...tile(1), tiles: [tile(1)] }) },
      status: (event) => events.push(event),
      attach: async () => {
        throw new Error("composer closed");
      },
      companionRequired() {},
    }),
    /composer closed/,
  );
  assert.equal(notice(events), fullPageText.failed);
});

test("clears the pending message when the companion is required", async () => {
  const h = harness(async () => ({ companionRequired: true }));
  await h.run();
  assert.equal(h.required(), 1);
  assert.equal(notice(h.events), undefined);
});

test("tells the user when a very long page was cut short", async () => {
  const h = harness(async () => ({
    ...tile(1),
    tiles: [tile(1)],
    truncated: true,
  }));
  await h.run();
  assert.equal(notice(h.events), fullPageText.truncated);
});

test("a capture without tiles still attaches the single image", async () => {
  const h = harness(async () => tile(1));
  await h.run();
  assert.deepEqual(h.attached, ["tile-1"]);
});

test("status events without a message do not touch an unrelated notice", () => {
  assert.equal(
    captureNotice({ type: "capture-status", state: "retrying" }),
    undefined,
  );
  assert.equal(captureNotice({ type: "capture", capture: {} }), undefined);
});
