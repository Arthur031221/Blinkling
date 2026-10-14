import { test } from "node:test";
import assert from "node:assert/strict";
import { contentMoved, maskBitmap } from "./change.mjs";
test("a small guide target moving invalidates its drawing despite a mostly unchanged desktop", () => {
  const d = { bounds: { width: 1600, height: 900 } };
  const a = Buffer.alloc(160 * 90 * 4, 40),
    b = Buffer.from(a);
  for (let y = 30; y < 35; y++)
    for (let x = 20; x < 25; x++)
      b.fill(230, (y * 160 + x) * 4, (y * 160 + x) * 4 + 3);
  assert.equal(contentMoved(a, b, 160, 90, d), false);
  assert.equal(
    contentMoved(a, b, 160, 90, d, [
      { x: 200, y: 300, width: 120, height: 100 },
    ]),
    true,
  );
  const masks = [{ x: 200, y: 300, width: 120, height: 100 }];
  assert.equal(
    contentMoved(
      maskBitmap(a, 160, 90, d, masks),
      maskBitmap(b, 160, 90, d, masks),
      160,
      90,
      d,
      masks,
    ),
    false,
  );
});
test("border masks preserve interior pixels and window masks clamp on negative-origin displays", () => {
  const d = { bounds: { x: -1600, y: -900, width: 1600, height: 900 } };
  const image = Buffer.alloc(160 * 90 * 4, 120);
  const masked = maskBitmap(image, 160, 90, d, [
    { x: 100, y: 100, width: 200, height: 200, borderOnly: true },
    { x: -100, y: -100, width: 120, height: 120 },
  ]);
  assert.equal(masked[(10 * 160 + 10) * 4 + 3], 0);
  assert.equal(masked[(20 * 160 + 20) * 4 + 3], 120);
  assert.equal(masked[3], 0);
  assert.equal(image[3], 120);
});
