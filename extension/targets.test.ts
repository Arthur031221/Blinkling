import { afterEach, describe, expect, it, vi } from "vitest";
import { readablePage, targetTab, viewportFrame } from "./targets";

const win = (id: number, left: number, over: object = {}) => ({
  id,
  left,
  top: 0,
  width: 1000,
  height: 800,
  focused: false,
  state: "normal",
  tabs: [
    { id: id * 10, windowId: id, active: true, url: `https://e.test/${id}` },
  ],
  ...over,
});
function windows(list: object[], lastFocused = 1) {
  vi.stubGlobal("chrome", {
    windows: {
      getAll: vi.fn(async () => list),
      getLastFocused: vi.fn(async () => ({ id: lastFocused })),
    },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("which page a request is about", () => {
  it("picks the window under the point, then its active tab", async () => {
    windows([win(1, 0), win(2, 1200)]);
    expect((await targetTab({ x: 1500, y: 100 }))?.tab.id).toBe(20);
    expect((await targetTab({ x: 100, y: 100 }))?.tab.id).toBe(10);
  });
  it("finds nothing where no browser window is", async () => {
    windows([win(1, 0)]);
    expect(await targetTab({ x: 2500, y: 100 })).toBeUndefined();
  });
  it("prefers the focused window where windows overlap, and skips minimized ones", async () => {
    windows(
      [
        win(1, 0),
        win(2, 100, { focused: true }),
        win(3, 0, { state: "minimized" }),
      ],
      1,
    );
    expect((await targetTab({ x: 300, y: 100 }))?.tab.id).toBe(20);
  });
  it("without a point uses the last focused window", async () => {
    windows([win(1, 0), win(2, 1200)], 2);
    expect((await targetTab())?.tab.id).toBe(20);
  });
});

describe("readable pages", () => {
  it("excludes browser pages, the PDF viewer extension and the web store", () => {
    expect(readablePage("https://example.com/a")).toBe(true);
    expect(readablePage("chrome://extensions")).toBe(false);
    expect(readablePage("chrome-extension://abc/index.html")).toBe(false);
    expect(readablePage("https://chromewebstore.google.com/detail/x")).toBe(
      false,
    );
    expect(readablePage("about:blank")).toBe(false);
    expect(readablePage(undefined)).toBe(false);
  });
});

describe("viewport frame", () => {
  it("puts the viewport below the browser chrome at the zoomed scale", () => {
    const frame = viewportFrame(
      { left: 100, top: 50, width: 1000, height: 800 } as chrome.windows.Window,
      { innerWidth: 984, innerHeight: 700, devicePixelRatio: 2 },
      1,
    );
    expect(frame).toEqual({
      screenX: 108,
      screenY: 50 + (800 - 700 - 8),
      devicePixelRatio: 2,
      zoom: 1,
    });
  });
  it("accounts for page zoom", () => {
    const frame = viewportFrame(
      { left: 0, top: 0, width: 1000, height: 800 } as chrome.windows.Window,
      { innerWidth: 800, innerHeight: 560, devicePixelRatio: 1.25 },
      1.25,
    );
    expect(frame.zoom).toBe(1.25);
    expect(frame.screenX).toBe(0);
    expect(frame.screenY).toBe(800 - 700);
  });
});
