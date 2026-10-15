import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bgraToRgba, cropOf, electronLocator } from "./electron.mjs";

describe("bgraToRgba", () => {
  it("swaps blue and red and keeps green and alpha", () => {
    const out = bgraToRgba(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    assert.deepEqual([...out], [3, 2, 1, 4, 7, 6, 5, 8]);
  });
});

describe("cropOf", () => {
  const display = {
    bounds: { x: 100, y: 50, width: 800, height: 600 },
    scaleFactor: 1.5,
  };

  it("maps a window into the display's pixels", () => {
    assert.deepEqual(
      cropOf({ x: 140, y: 90, width: 200, height: 100 }, display),
      {
        x: 60,
        y: 60,
        width: 300,
        height: 150,
      },
    );
  });

  it("clips a window that hangs off the display", () => {
    assert.deepEqual(
      cropOf({ x: 50, y: 40, width: 300, height: 100 }, display),
      {
        x: 0,
        y: 0,
        width: 375,
        height: 135,
      },
    );
  });

  it("is null when the window is not on the display", () => {
    assert.equal(
      cropOf({ x: 2000, y: 0, width: 10, height: 10 }, display),
      null,
    );
  });
});

describe("electronLocator", () => {
  const screen = {
    getAllDisplays: () => [
      {
        id: 7,
        scaleFactor: 2,
        bounds: { x: 0, y: 0, width: 400, height: 300 },
      },
    ],
    screenToDipPoint: (p) => ({ x: p.x / 2, y: p.y / 2 }),
    dipToScreenPoint: (p) => ({ x: p.x * 2, y: p.y * 2 }),
  };
  const make = (extra = {}) =>
    electronLocator({
      electron: { screen, BrowserWindow: { getAllWindows: () => [] } },
      companion: { elements: async () => null },
      platform: "linux",
      listWindows: async () => [],
      ...extra,
    });

  it("builds a locator with the interface", () => {
    const locator = make();
    for (const name of [
      "locate",
      "elements",
      "parent",
      "sentenceAt",
      "selectionAt",
      "textIn",
      "focus",
      "windowAt",
      "snap",
    ])
      assert.equal(typeof locator[name], "function", name);
  });

  it("lists windows without ours and converts them to DIP", async () => {
    const seen = [];
    const locator = make({
      electron: {
        screen,
        BrowserWindow: {
          getAllWindows: () => [
            {
              isDestroyed: () => false,
              getNativeWindowHandle: () => Buffer.from([9, 0, 0, 0]),
            },
          ],
        },
      },
      listWindows: async (options) => {
        seen.push(options);
        return [
          {
            id: 1,
            app: "gedit",
            title: "n",
            bounds: { x: 0, y: 0, width: 400, height: 200 },
          },
        ];
      },
    });
    const window = await locator.windowAt({ x: 10, y: 10 });
    assert.deepEqual(window.bounds, { x: 0, y: 0, width: 200, height: 100 });
    assert.equal(window.display.id, "7");
    assert.equal(window.display.scaleFactor, 2);
    assert.deepEqual([...seen[0].own.ids], [9]);
    assert.ok(seen[0].own.pids.has(process.pid));
  });

  it("does not convert on macOS, whose points are DIP", async () => {
    const locator = make({
      platform: "darwin",
      listWindows: async () => [
        {
          id: 1,
          app: "Notes",
          title: "n",
          bounds: { x: 0, y: 0, width: 200, height: 100 },
        },
      ],
    });
    assert.deepEqual((await locator.windowAt({ x: 10, y: 10 })).bounds, {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });
});
