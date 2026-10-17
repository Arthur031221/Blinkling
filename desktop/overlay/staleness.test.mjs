import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OverlayService } from "./service.mjs";
import { StalenessWatch } from "./staleness.mjs";
import {
  display,
  desktop,
  withOverlay,
  withBubble,
  sample,
} from "./frames.fixture.mjs";
const rects = [
  { x: 240, y: 160, width: 160, height: 100 },
  { x: 500, y: 300, width: 40, height: 24 },
];
const masks = rects.map((r) => ({
  x: r.x - 4,
  y: r.y - 4,
  width: r.width + 8,
  height: r.height + 8,
  borderOnly: true,
}));
const capture = { display, scaleFactor: 1, image: { data: "ref" } };
function rig({ frames, onError, windowMasks } = {}) {
  const logs = [],
    reasons = [],
    shortcuts = new Map();
  const displays = Object.assign(new EventEmitter(), {
    getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: display.bounds }],
  });
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    close() {},
    webContents: {
      executeJavaScript: async () => masks,
      send() {},
    },
  });
  const overlay = new OverlayService({
    create: async () => window,
    escape: {
      register: (key, fn) => shortcuts.set(key, fn),
      unregister: (key) => shortcuts.delete(key),
    },
    displays,
    log: (line) => logs.push(line),
    onDismiss: (reason) => reasons.push(reason),
    masks: () => [],
  });
  const grabbed = [];
  const watch = new StalenessWatch({
    overlay,
    masks:
      windowMasks ?? (() => [{ x: 1200, y: 100, width: 320, height: 200 }]),
    intervalMs: 1_000_000,
    decode: () => sample(desktop()),
    grab: async () => {
      const next = frames.shift();
      grabbed.push(next);
      if (next instanceof Error) throw next;
      return next;
    },
    onError: onError ?? (() => overlay.dismiss("capture-unavailable")),
  });
  return { overlay, watch, logs, reasons, shortcuts, window };
}
const still = () =>
  sample(
    withBubble(withOverlay(desktop(), rects), {
      x: 1200,
      y: 100,
      width: 320,
      height: 80,
    }),
  );
const show = (r) =>
  r.overlay.show(
    { ...capture, display: { ...display, id: "1" } },
    rects.map((rect) => ({ rect })),
  );
test("a static screen survives many ticks and Esc logs 'user'", async () => {
  const r = rig({ frames: Array.from({ length: 60 }, still) });
  await show(r);
  for (let i = 0; i < 60; i++) await r.watch.tick();
  assert.ok(r.overlay.capture, "still visible after 60 ticks");
  assert.deepEqual(r.logs, []);
  r.shortcuts.get("Escape")();
  assert.deepEqual(r.reasons, ["user"]);
  assert.deepEqual(r.logs, ["[blinkling] guide dismissed: user"]);
  r.watch.dispose();
});
test("the target window moving dismisses once with 'content-changed'", async () => {
  const moved = sample(
    withOverlay(
      desktop({ window: { x: 330, y: 160, width: 900, height: 600 } }),
      rects,
    ),
  );
  const r = rig({ frames: [still(), still(), moved, moved] });
  await show(r);
  for (let i = 0; i < 4; i++) await r.watch.tick();
  assert.deepEqual(r.reasons, ["content-changed"]);
  assert.deepEqual(r.logs, ["[blinkling] guide dismissed: content-changed"]);
  r.watch.dispose();
});
test("one or two failed screenshots keep the guide; three in a row dismiss with 'capture-unavailable'", async () => {
  const fail = () => Error("screenshot failed");
  const r = rig({
    frames: [still(), fail(), fail(), still(), fail(), fail(), fail()],
  });
  await show(r);
  for (let i = 0; i < 6; i++) await r.watch.tick();
  assert.deepEqual(r.reasons, []);
  await r.watch.tick();
  assert.deepEqual(r.reasons, ["capture-unavailable"]);
  assert.deepEqual(r.logs, [
    "[blinkling] guide dismissed: capture-unavailable",
  ]);
  r.watch.dispose();
});
test("choosing a step adopts the redrawn overlay without dismissing", async () => {
  const stepTwo = () =>
    sample(
      withBubble(withOverlay(desktop(), [rects[1]]), {
        x: 1200,
        y: 100,
        width: 320,
        height: 80,
      }),
    );
  const r = rig({ frames: [still(), stepTwo(), stepTwo(), stepTwo()] });
  await show(r);
  await r.watch.tick();
  r.overlay.step(0);
  await r.watch.tick();
  await r.watch.tick();
  await r.watch.tick();
  assert.deepEqual(r.reasons, []);
  assert.ok(r.overlay.capture);
  r.watch.dispose();
});
test("closing the guide window and replacing a guide each log their own reason", async () => {
  const r = rig({ frames: [] });
  await show(r);
  r.window.emit("closed");
  assert.deepEqual(r.reasons, ["closed"]);
  await show(r);
  await show(r);
  assert.deepEqual(r.reasons, ["closed", "replaced"]);
  assert.equal(r.logs.length, 2);
  r.watch.dispose();
});
test("Blink's windows are read before and after the screenshot, and both places are masked", async () => {
  const seen = [];
  const reads = [
    [{ x: 1200, y: 100, width: 320, height: 200 }],
    [{ x: 900, y: 500, width: 320, height: 200 }],
  ];
  let read = 0;
  const r = rig({
    frames: [still()],
    windowMasks: () => (seen.push(read), reads[read++ % 2]),
  });
  await show(r);
  r.watch.detector = {
    observe: (_, masks) => (seen.push(masks.map((m) => m.x)), null),
  };
  seen.length = 0;
  read = 0;
  await r.watch.tick();
  assert.deepEqual(seen.slice(0, 2), [0, 1], "read on both sides of the grab");
  assert.ok(
    seen[2].includes(1200) && seen[2].includes(900),
    "masked where it was and where it went",
  );
  r.watch.dispose();
});
test("a frame taken after Blink's windows moved since the last tick is skipped, but never for long", async () => {
  let y = 230;
  const r = rig({
    frames: [still(), still(), still(), still(), still(), still()],
    windowMasks: () => [{ x: 128, y, width: 440, height: 306 }],
  });
  await show(r);
  let looked = 0;
  r.watch.detector = { observe: () => (looked++, null) };
  await r.watch.tick();
  assert.equal(looked, 1, "a window that stood still is judged");
  y = 480;
  await r.watch.tick();
  assert.equal(looked, 1, "it moved since the last tick: the frame is skipped");
  await r.watch.tick();
  assert.equal(looked, 2, "it stood still since: the frame is judged again");
  for (let moving = 1; moving <= 2; moving++) {
    y += 100;
    await r.watch.tick();
    assert.equal(looked, 2, `moving again, skipped (${moving})`);
  }
  y += 100;
  await r.watch.tick();
  assert.equal(looked, 3, "a window that never stops does not hide a change");
  r.watch.dispose();
});
