import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlacementStore } from "./preferences.mjs";
test("atomic display positions survive restart, keep disconnected displays, reject corrupt input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blink-positions-"));
  try {
    const file = join(dir, "placements.json");
    const store = new PlacementStore(file);
    await store.load();
    await Promise.all([
      store.set("left-monitor", { edge: "left", fraction: 0.3 }),
      store.set("right-monitor", { edge: "bottom", fraction: 0.8 }),
    ]);
    const again = new PlacementStore(file);
    await again.load();
    assert.deepEqual(again.get("left-monitor"), {
      edge: "left",
      fraction: 0.3,
    });
    assert.deepEqual(again.get("right-monitor"), {
      edge: "bottom",
      fraction: 0.8,
    });
    await assert.rejects(again.set("oops", { edge: "middle", fraction: NaN }));
    assert.equal(JSON.parse(await readFile(file, "utf8")).version, 1);
    await writeFile(
      file,
      '{"version":1,"positions":{"bad":{"edge":"right","fraction":5}}}',
    );
    await again.load();
    assert.equal(again.get("bad"), undefined);
    for (const corrupt of [
      "null",
      "{not-json",
      '{"version":2,"positions":{}}',
    ]) {
      await writeFile(file, corrupt);
      await again.load();
      assert.equal(again.get("left-monitor"), undefined);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
