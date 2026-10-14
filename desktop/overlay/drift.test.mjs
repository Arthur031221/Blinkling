import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { DriftDetector } from "./drift.mjs";
import { contentMoved, maskBitmap } from "./change.mjs";
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
  { x: 700, y: 520, width: 300, height: 120 },
];
// Outline masks as renderer.mjs publishes them: padded border-only boxes.
const outlineMasks = rects.map((r) => ({
  x: r.x - 4,
  y: r.y - 4,
  width: r.width + 8,
  height: r.height + 8,
  borderOnly: true,
}));
const bubble = (h) => ({ x: 1200, y: 100, width: 320, height: h });
const screen = desktop();
const reference = sample(screen);
function live(state = screen, bubbleHeight = 80, overlay = rects) {
  return sample(withBubble(withOverlay(state, overlay), bubble(bubbleHeight)));
}
const masksFor = (h) => [...outlineMasks, bubble(h)];
test("a static screen with the overlay's own drawing and streaming bubbles stays for 60 s of ticks", () => {
  const d = new DriftDetector({ display, reference });
  // 50 ticks of 1.2 s: the answer bubble grows, the guide never moves.
  for (let tick = 0; tick < 50; tick++) {
    const h = 80 + tick * 8;
    assert.equal(
      d.observe(live(screen, h), masksFor(h), rects),
      null,
      `tick ${tick}`,
    );
  }
});
test("comparing the overlay-free reference with a frame that shows the overlay is not a content change", () => {
  const d = new DriftDetector({ display, reference });
  assert.equal(d.observe(live(), masksFor(80), rects), null);
});
test("moving the target window after the guide appeared dismisses it", () => {
  const d = new DriftDetector({ display, reference });
  assert.equal(d.observe(live(), masksFor(80), rects), null);
  assert.equal(d.observe(live(), masksFor(120), rects), null);
  const moved = desktop({
    window: { x: 330, y: 160, width: 900, height: 600 },
  });
  assert.equal(d.observe(live(moved), masksFor(120), rects), "content-changed");
});
test("a small control changing inside a drawn region dismisses the guide", () => {
  const d = new DriftDetector({ display, reference });
  d.observe(live(), masksFor(80), rects);
  const changed = Buffer.from(screen);
  for (let y = 512; y < 650; y++)
    for (let x = 730; x < 960; x++)
      changed.fill(120, (y * 1600 + x) * 4, (y * 1600 + x) * 4 + 3);
  assert.equal(
    d.observe(live(changed), masksFor(80), rects),
    "content-changed",
  );
});
test("a window that moved before the overlay appeared is caught on the first live frame", () => {
  const d = new DriftDetector({ display, reference });
  const moved = desktop({
    window: { x: 330, y: 160, width: 900, height: 600 },
  });
  assert.equal(d.observe(live(moved), masksFor(80), rects), "content-changed");
});
test("selecting another step adopts the new overlay drawing instead of reporting it", () => {
  const d = new DriftDetector({ display, reference });
  d.observe(live(screen, 80, rects), masksFor(80), rects);
  d.rebaseline();
  assert.equal(d.ready, false);
  // Step 2 shows only the third outline.
  assert.equal(
    d.observe(live(screen, 80, [rects[2]]), masksFor(80), rects),
    null,
  );
  assert.equal(
    d.observe(live(screen, 100, [rects[2]]), masksFor(100), rects),
    null,
  );
  const moved = desktop({
    window: { x: 330, y: 160, width: 900, height: 600 },
  });
  assert.equal(
    d.observe(live(moved, 100, [rects[2]]), masksFor(100), rects),
    "content-changed",
  );
});
const recorded = JSON.parse(
  readFileSync(new URL("./recorded/static-guide.json", import.meta.url)),
);
const unpack = (s) => inflateSync(Buffer.from(s, "base64"));
test("recorded Xvfb frames (overlay drawing included) stay put through the whole recording", () => {
  const d = new DriftDetector({
    display: recorded.display,
    reference: unpack(recorded.reference),
  });
  for (const tick of recorded.ticks)
    assert.equal(
      d.observe(unpack(tick.frame), tick.masks, recorded.regions),
      null,
      `recorded tick ${tick.n}`,
    );
});
test("regression G-1: the old overlay-free reference comparison flags the same recorded frames", () => {
  const [first] = recorded.ticks;
  const masks = first.masks;
  assert.equal(
    contentMoved(
      maskBitmap(unpack(recorded.reference), 160, 90, recorded.display, masks),
      maskBitmap(unpack(first.frame), 160, 90, recorded.display, masks),
      160,
      90,
      recorded.display,
      recorded.regions,
    ),
    true,
  );
});
test("recorded frames: a changed target region is still reported", () => {
  const d = new DriftDetector({
    display: recorded.display,
    reference: unpack(recorded.reference),
  });
  const [first, , , , , last] = recorded.ticks;
  assert.equal(
    d.observe(unpack(first.frame), first.masks, recorded.regions),
    null,
  );
  const changed = Buffer.from(unpack(last.frame));
  // The 160x100 target region at (240,160): repaint its sampled interior.
  for (let y = 17; y < 25; y++)
    for (let x = 25; x < 38; x++)
      changed.fill(
        255 - changed[(y * 160 + x) * 4],
        (y * 160 + x) * 4,
        (y * 160 + x) * 4 + 3,
      );
  assert.equal(
    d.observe(changed, last.masks, recorded.regions),
    "content-changed",
  );
});
