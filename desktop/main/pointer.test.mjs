import test from "node:test";
import assert from "node:assert/strict";
import { createPointerSource } from "./pointer.mjs";
const stale = { x: 1, y: 1 };
const never = () => new Promise(() => {});
test("on X11 the queried pointer wins over Electron's stale point", async () => {
  const source = createPointerSource({
    query: async () => ({ x: 300, y: 400 }),
    fallback: () => stale,
  });
  assert.deepEqual(await source.read(), { x: 300, y: 400 });
  assert.equal(source.source, "x11");
  assert.deepEqual(source.last, { x: 300, y: 400 });
});
test("the queried pixel point is converted to DIP", async () => {
  const source = createPointerSource({
    query: async () => ({ x: 300, y: 600 }),
    fallback: () => stale,
    toDip: (p) => ({ x: p.x / 1.5, y: p.y / 1.5 }),
  });
  assert.deepEqual(await source.read(), { x: 200, y: 400 });
});
test("without an X11 client, Electron's point is used", async () => {
  const source = createPointerSource({ fallback: () => ({ x: 9, y: 8 }) });
  assert.deepEqual(await source.read(), { x: 9, y: 8 });
  assert.equal(source.source, "electron");
});
test("a failing, hanging or garbage query falls back and recovers on the next read", async () => {
  let mode = "reject";
  const source = createPointerSource({
    query: () =>
      mode === "reject"
        ? Promise.reject(Error("closed"))
        : mode === "hang"
          ? never()
          : mode === "nan"
            ? Promise.resolve({ x: NaN, y: 2 })
            : Promise.resolve({ x: 5, y: 6 }),
    fallback: () => ({ x: 70, y: 80 }),
    timeout: 20,
  });
  for (const m of ["reject", "hang", "nan"]) {
    mode = m;
    assert.deepEqual(await source.read(), { x: 70, y: 80 }, m);
    assert.equal(source.source, "electron");
  }
  mode = "ok";
  assert.deepEqual(await source.read(), { x: 5, y: 6 });
  assert.equal(source.source, "x11");
});
