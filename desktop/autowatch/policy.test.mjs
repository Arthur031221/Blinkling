import { test } from "node:test";
import assert from "node:assert/strict";
import { ChangePolicy, fingerprint, difference } from "./policy.mjs";
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
