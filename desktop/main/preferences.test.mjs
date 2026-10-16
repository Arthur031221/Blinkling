import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PositionStore } from "./preferences.mjs";
test("atomic serialized saves remember each display and restore last display", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blink-position-"));
  try {
    const path = join(dir, "positions.json");
    const store = await new PositionStore(path).load();
    await Promise.all([
      store.save(1, { edge: "left", ratio: 0.3 }),
      store.save(2, { edge: "bottom", ratio: 0.7 }),
    ]);
    const restored = await new PositionStore(path).load();
    assert.deepEqual(restored.positions, {
      1: { edge: "left", ratio: 0.3 },
      2: { edge: "bottom", ratio: 0.7 },
    });
    assert.equal(restored.lastDisplay, "2");
    assert.equal(JSON.parse(await readFile(path)).version, 1);
    await writeFile(path, "broken");
    assert.deepEqual((await new PositionStore(path).load()).positions, {});
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("nudges are remembered per surface and edge, and a nudge of nothing is forgotten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blink-nudge-"));
  try {
    const path = join(dir, "positions.json");
    const store = await new PositionStore(path).load();
    assert.deepEqual(store.nudge("card:right"), { x: 0, y: 0 });
    await store.saveNudge("card:right", { x: -40, y: 25 });
    await store.saveNudge("card:left", { x: 10, y: 0 });
    await store.save(1, { edge: "right", ratio: 0.5 });
    const restored = await new PositionStore(path).load();
    assert.deepEqual(restored.nudge("card:right"), { x: -40, y: 25 });
    assert.deepEqual(restored.nudge("card:left"), { x: 10, y: 0 });
    await restored.saveNudge("card:right", { x: 0, y: 0 });
    const again = await new PositionStore(path).load();
    assert.deepEqual(again.nudge("card:right"), { x: 0, y: 0 });
    assert.deepEqual(again.nudge("card:left"), { x: 10, y: 0 });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        positions: {},
        nudges: { a: { x: "no" }, b: 4 },
      }),
    );
    assert.deepEqual((await new PositionStore(path).load()).nudges, {});
  } finally {
    await rm(dir, { recursive: true });
  }
});
