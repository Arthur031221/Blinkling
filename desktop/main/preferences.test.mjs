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
