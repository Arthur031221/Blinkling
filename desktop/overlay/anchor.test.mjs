import test from "node:test";
import assert from "node:assert/strict";
import { createAnchor } from "./anchor.mjs";

const frame = (extra = {}) => ({
  screenX: 100,
  screenY: 50,
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  viewWidth: 800,
  viewHeight: 600,
  ...extra,
});
const rig = (start = frame(), options = {}) => {
  const state = { frame: start, url: "https://a.test/", scrolls: [] };
  const moves = [];
  const lost = [];
  const host = {
    elements: async () => ({ frame: state.frame, page: { url: state.url } }),
    scrollPage: async (arg) => {
      state.scrolls.push(arg);
      state.frame = { ...state.frame, scrollY: arg.y };
      return { ok: true };
    },
  };
  const anchor = createAnchor({
    host,
    onShift: (m) => moves.push(...m),
    onLost: (r) => lost.push(r),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
    ...options,
  });
  return { anchor, state, moves, lost };
};
const rects = [
  { n: 1, x: 200, y: 150, width: 100, height: 20 },
  { n: 2, x: 200, y: 900, width: 100, height: 20 },
];

test("a scrolled page moves each mark by the same distance, in page coordinates", async () => {
  const { anchor, state, moves } = rig();
  assert.equal(await anchor.attach(rects.slice(0, 1)), true);
  state.frame = frame({ scrollY: 40 });
  await anchor.tick();
  assert.deepEqual(moves, [{ n: 1, dx: 0, dy: -40, visible: true }]);
  await anchor.tick();
  assert.equal(moves.length, 1, "nothing changed, nothing is sent");
});

test("page zoom scales the move and a mark scrolled out of the window is not visible", async () => {
  const { anchor, state, moves } = rig(frame({ zoom: 2, viewHeight: 300 }));
  await anchor.attach(rects.slice(0, 1));
  state.frame = frame({ zoom: 2, viewHeight: 300, scrollY: 40 });
  await anchor.tick();
  assert.equal(moves.at(-1).dy, -80);
  state.frame = frame({ zoom: 2, viewHeight: 300, scrollY: 2000 });
  await anchor.tick();
  assert.equal(moves.at(-1).visible, false);
});

test("a window resize that moves the page origin carries the marks along", async () => {
  const { anchor, state, moves } = rig();
  await anchor.attach(rects.slice(0, 1));
  state.frame = frame({ screenX: 160, screenY: 70 });
  await anchor.tick();
  assert.deepEqual(moves, [{ n: 1, dx: 60, dy: 20, visible: true }]);
});

test("reveal scrolls the page so the step's mark is in the middle, like a link jump", async () => {
  const { anchor, state, moves } = rig(frame(), {});
  await anchor.attach([rects[0], { ...rects[1], y: 400 }]);
  assert.equal(await anchor.reveal(2), true);
  assert.equal(state.scrolls.length, 1);
  assert.equal(state.scrolls[0].y, 400 - 50 + 10 - 300);
  assert.equal(moves.at(-1).n, 2);
});

test("marks that lie outside the window are not anchored and a helper-less run says no", async () => {
  const none = rig(frame({ viewHeight: 100 }));
  assert.equal(await none.anchor.attach(rects.slice(1)), false);
  const off = createAnchor({
    host: null,
    onShift: () => assert.fail("no helper, no moves"),
  });
  assert.equal(await off.attach(rects), false);
  const away = createAnchor({
    host: { elements: async () => assert.fail("not asked") },
    available: async () => false,
    onShift: () => {},
  });
  assert.equal(await away.attach(rects), false);
  assert.equal(away.active, false);
});

test("another page in the tab ends the anchoring and says the content changed", async () => {
  const { anchor, state, lost } = rig();
  await anchor.attach(rects.slice(0, 1));
  state.url = "https://b.test/";
  await anchor.tick();
  assert.deepEqual(lost, ["content-changed"]);
  assert.equal(anchor.active, false);
});
