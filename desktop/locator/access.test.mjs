import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureAccess } from "./access.mjs";

const left = {
  id: 1,
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 100, height: 80 },
};
const right = {
  id: 2,
  scaleFactor: 2,
  bounds: { x: 100, y: 0, width: 100, height: 80 },
};
const screen = { getAllDisplays: () => [left, right] };
const win = (id, x, y, width, height, over = {}) => ({
  id,
  pid: 7,
  app: "app",
  title: `t${id}`,
  bounds: { x, y, width, height },
  ...over,
});

test("displays are copied with string ids and a scale", () => {
  const access = createCaptureAccess({
    screen,
    windowsOn: async () => [],
    grab: null,
  });
  assert.deepEqual(access.displays(), [
    { id: "1", scaleFactor: 1, bounds: left.bounds },
    { id: "2", scaleFactor: 2, bounds: right.bounds },
  ]);
});

test("windows are made absolute and a window on two displays is joined", async () => {
  const lists = new Map([
    [1, [win("a", 60, 10, 40, 30), win("b", 0, 0, 20, 20)]],
    [2, [win("a", 0, 10, 30, 30)]],
  ]);
  const access = createCaptureAccess({
    screen,
    windowsOn: async (display) => lists.get(display.id),
    grab: null,
  });
  const found = await access.windows();
  assert.deepEqual(
    found.map((w) => [w.id, w.bounds]),
    [
      ["a", { x: 60, y: 10, width: 70, height: 30 }],
      ["b", { x: 0, y: 0, width: 20, height: 20 }],
    ],
  );
  assert.equal(found[0].private, false);
});

test("a display whose list fails does not take the others with it", async () => {
  const access = createCaptureAccess({
    screen,
    windowsOn: async (display) => {
      if (display.id === 1) throw new Error("no list");
      return [win("z", 5, 5, 40, 40)];
    },
    grab: null,
  });
  const found = await access.windows();
  assert.deepEqual(
    found.map((w) => w.bounds.x),
    [105],
  );
});

test("image crops the display holding the region, in capture pixels", async () => {
  const crops = [];
  const grab = async (display) => ({
    getSize: () => ({
      width: display.bounds.width * display.scaleFactor,
      height: display.bounds.height * display.scaleFactor,
    }),
    crop(rect) {
      crops.push(rect);
      return {
        getSize: () => ({ width: rect.width, height: rect.height }),
        toBitmap: () => Buffer.alloc(rect.width * rect.height * 4),
      };
    },
  });
  const access = createCaptureAccess({
    screen,
    windowsOn: async () => [],
    grab,
  });
  const picture = await access.image({ x: 110, y: 10, width: 30, height: 20 });
  assert.deepEqual(crops, [{ x: 20, y: 20, width: 60, height: 40 }]);
  assert.equal(picture.scale, 2);
  assert.equal(picture.width, 60);
  assert.equal(picture.data.length, 60 * 40 * 4);
  assert.equal(
    await access.image({ x: 900, y: 900, width: 5, height: 5 }),
    null,
  );
});
