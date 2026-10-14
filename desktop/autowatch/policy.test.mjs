import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ChangePolicy,
  COOLDOWN_MS,
  fingerprint,
  difference,
} from "./policy.mjs";
const frame = (value) => fingerprint(Buffer.alloc(32 * 18 * 4, value));
test("substantial changes require stability, idle typing, cooldown and no overlapping turn", () => {
  const p = new ChangePolicy({ cooldownMs: 45000, settleSamples: 2 });
  assert.equal(p.observe(frame(20), { now: 0, idleSeconds: 3 }), false);
  assert.equal(p.observe(frame(230), { now: 6000, idleSeconds: 0 }), false);
  assert.equal(
    p.observe(frame(230), { now: 12000, idleSeconds: 3, busy: true }),
    false,
  );
  assert.equal(p.observe(frame(230), { now: 18000, idleSeconds: 3 }), false);
  assert.equal(p.observe(frame(230), { now: 24000, idleSeconds: 3 }), true);
  p.sent(24000);
  assert.equal(p.observe(frame(50), { now: 30000, idleSeconds: 3 }), false);
  assert.equal(p.observe(frame(50), { now: 60000, idleSeconds: 3 }), false);
  assert.equal(p.observe(frame(50), { now: 70000, idleSeconds: 3 }), true);
});
test("small changes and a typing-held screen never chatter", () => {
  const p = new ChangePolicy();
  p.observe(frame(100), { now: 0, idleSeconds: 5 });
  assert.equal(p.observe(frame(110), { now: 100000, idleSeconds: 5 }), false);
  for (let now = 110000; now < 200000; now += 6000)
    assert.equal(p.observe(frame(220), { now, idleSeconds: 0 }), false);
  assert.equal(difference(frame(100), frame(110)).substantial, false);
  assert.equal(difference(frame(100), frame(220)).substantial, true);
});
test("opening an owned card does not count as a desktop content change", () => {
  const original = Buffer.alloc(32 * 18 * 4, 180),
    masked = Buffer.from(original);
  masked.fill(0, 0, Math.floor(32 * 18 * 0.6) * 4);
  assert.equal(
    difference(fingerprint(original), fingerprint(masked)).substantial,
    false,
  );
  const moved = Buffer.alloc(32 * 18 * 4, 40);
  assert.equal(
    difference(fingerprint(masked), fingerprint(moved)).substantial,
    true,
  );
});
const pages = JSON.parse(
  readFileSync(new URL("./fixtures/white-pages.json", import.meta.url), "utf8"),
);
const page = (name) => fingerprint(Buffer.from(pages[name], "base64"));
const INTERVAL = 6000;
test("A-1: a navigation between two mostly white pages is a substantial change", () => {
  for (const [a, b] of [
    ["article", "listing"],
    ["listing", "docs"],
    ["docs", "article"],
  ]) {
    assert.equal(difference(page(a), page(b)).substantial, true, `${a}→${b}`);
    assert.equal(difference(page(b), page(a)).substantial, true, `${b}→${a}`);
  }
});
test("A-1: cursor blink, caret movement, a scrolling clock and a small scroll stay quiet", () => {
  for (const noise of ["caretMoved", "caretOff", "clockTick"])
    assert.equal(
      difference(page("textPage"), page(noise)).substantial,
      false,
      noise,
    );
  assert.equal(
    difference(page("scrolledBefore"), page("scrolled")).substantial,
    false,
  );
});
test("A-1: ChangePolicy fires within one interval plus settle time after a white to white navigation", () => {
  const p = new ChangePolicy();
  const idle = { idleSeconds: 10 };
  let now = 0;
  assert.equal(p.observe(page("article"), { now, ...idle }), false);
  now += INTERVAL;
  assert.equal(p.observe(page("listing"), { now, ...idle }), false);
  now += INTERVAL;
  assert.equal(p.observe(page("listing"), { now, ...idle }), true);
  assert.ok(now <= 3 * INTERVAL);
});
test("A-1: a navigation soon after an explanation is not held back for 45 s", () => {
  const p = new ChangePolicy();
  const idle = { idleSeconds: 10 };
  p.observe(page("article"), { now: 0, ...idle });
  p.observe(page("listing"), { now: INTERVAL, ...idle });
  assert.equal(
    p.observe(page("listing"), { now: 2 * INTERVAL, ...idle }),
    true,
  );
  p.sent(2 * INTERVAL);
  p.observe(page("docs"), { now: 3 * INTERVAL, ...idle });
  assert.equal(
    p.observe(page("docs"), { now: 2 * INTERVAL + COOLDOWN_MS - 1, ...idle }),
    false,
  );
  assert.equal(
    p.observe(page("docs"), { now: 2 * INTERVAL + COOLDOWN_MS, ...idle }),
    true,
  );
});
test("A-1: the cooldown is one short constant that the default policy uses", () => {
  assert.ok(COOLDOWN_MS >= INTERVAL && COOLDOWN_MS <= 15000);
  assert.equal(new ChangePolicy().cooldownMs, COOLDOWN_MS);
});
