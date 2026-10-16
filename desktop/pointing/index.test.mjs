import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPointing } from "./index.mjs";
import {
  DISPLAY,
  WINDOW,
  createPointingLocator,
  createOverlayFake,
} from "./test/locator.mjs";

const refs = [
  { n: 1, elementId: "para-1", label: "the intro" },
  { n: 2, elementId: "img-1", label: "the photo" },
];
function rig(options = {}) {
  const locator = options.locator ?? createPointingLocator();
  const overlay = createOverlayFake();
  const card = new EventEmitter();
  const cursor = { point: { x: -1, y: -1 } };
  const pointing = createPointing({
    locator,
    overlay,
    card,
    cursor: () => cursor.point,
  });
  return { locator, overlay, card, cursor, pointing };
}

test("an answer naming two elements draws two numbered marks of the right kind", async () => {
  const { overlay, pointing } = rig();
  assert.equal(await pointing.show(refs, { displayId: DISPLAY.id }), true);
  const [{ capture, drawings }] = overlay.shown;
  assert.equal(capture.display.id, "1");
  assert.equal(capture.image, undefined);
  assert.deepEqual(
    drawings.map((d) => [d.n, d.kind, d.label, d.elementId]),
    [
      [1, "underline", "the intro", "para-1"],
      [2, "outline", "the photo", "img-1"],
    ],
  );
  assert.deepEqual(drawings[1].rect, {
    x: 140,
    y: 230,
    width: 200,
    height: 120,
  });
  assert.equal(drawings[0].lines.length, 2);
  assert.ok(drawings.every((d) => Number.isInteger(d.seed)));
});

test("marks are display relative, so a second monitor's origin is removed", async () => {
  const second = {
    ...DISPLAY,
    id: "2",
    bounds: { x: 1280, y: 0, width: 1280, height: 800 },
  };
  const el = {
    id: "x:1:1",
    kind: "control",
    bounds: { x: 1380, y: 100, width: 80, height: 30 },
    name: "Save",
    window: WINDOW,
    display: second,
  };
  const { overlay, pointing } = rig({
    locator: createPointingLocator({ elements: [el] }),
  });
  await pointing.show([{ n: 1, elementId: "x:1:1", label: "save" }], {});
  assert.equal(overlay.shown[0].capture.display.id, "2");
  assert.deepEqual(overlay.shown[0].drawings[0].rect, {
    x: 100,
    y: 100,
    width: 80,
    height: 30,
  });
  assert.equal(overlay.shown[0].drawings[0].kind, "circle");
});

test("a ref that no longer resolves is skipped and the others keep their numbers", async () => {
  const { overlay, pointing } = rig();
  await pointing.show([{ n: 1, elementId: "gone:1:1", label: "x" }, refs[1]], {
    displayId: "1",
  });
  assert.deepEqual(
    overlay.shown[0].drawings.map((d) => d.n),
    [2],
  );
  assert.equal(
    await pointing.show([{ n: 1, elementId: "gone:1:1", label: "x" }], {
      displayId: "1",
    }),
    false,
  );
});

test("a pixel box snaps to the element under it, or stays where the model put it", async () => {
  const box = {
    n: 1,
    rect: { x: 142, y: 232, width: 196, height: 116 },
    label: "photo",
  };
  const snapped = rig();
  await snapped.pointing.show([box], { displayId: "1" });
  assert.deepEqual(snapped.overlay.shown[0].drawings[0].rect, {
    x: 140,
    y: 230,
    width: 200,
    height: 120,
  });
  assert.equal(snapped.overlay.shown[0].drawings[0].kind, "outline");
  const loose = rig({ locator: createPointingLocator({ snaps: false }) });
  await loose.pointing.show([box], { displayId: "1" });
  assert.deepEqual(loose.overlay.shown[0].drawings[0].rect, box.rect);
});

test("pixel boxes of a capture are converted to the screen before they are drawn", async () => {
  const capture = {
    display: { id: "1", bounds: DISPLAY.bounds, scaleFactor: 2 },
    region: { x: 0, y: 0, width: 1280, height: 800 },
    pixelWidth: 2560,
    pixelHeight: 1600,
    image: { data: "x" },
  };
  const { overlay, pointing } = rig({
    locator: createPointingLocator({ snaps: false }),
  });
  await pointing.show(
    [
      {
        n: 1,
        rect: { x: 200, y: 400, width: 600, height: 200 },
        label: "area",
        kind: "outline",
      },
    ],
    { displayId: "1", capture },
  );
  assert.equal(overlay.shown[0].capture.image, capture.image);
  assert.equal(overlay.shown[0].capture.pixelWidth, 2560);
  assert.deepEqual(overlay.shown[0].drawings[0].rect, {
    x: 100,
    y: 200,
    width: 300,
    height: 100,
  });
});

test("the overlay is given the display the way the service compares it: a string id, no Electron extras", async () => {
  const electronDisplay = {
    id: 60,
    bounds: { ...DISPLAY.bounds },
    scaleFactor: 1,
    workArea: { x: 0, y: 0, width: 1280, height: 770 },
    rotation: 0,
  };
  const { overlay, pointing } = rig({
    locator: createPointingLocator({ snaps: false }),
  });
  await pointing.show(
    [{ n: 1, rect: { x: 100, y: 100, width: 200, height: 80 }, label: "box" }],
    {
      displayId: 60,
      capture: {
        display: electronDisplay,
        region: { x: 0, y: 0, width: 1280, height: 800 },
        pixelWidth: 1280,
        pixelHeight: 800,
      },
    },
  );
  assert.deepEqual(overlay.shown[0].capture.display, {
    id: "60",
    bounds: DISPLAY.bounds,
    scaleFactor: 1,
  });
  assert.equal(overlay.shown[0].capture.region.width, 1280);
});

test("a box that overshoots the display is trimmed to it, and one wholly off it is skipped", async () => {
  const capture = {
    display: { id: "1", bounds: DISPLAY.bounds, scaleFactor: 1 },
    region: { x: 0, y: 0, width: 1280, height: 800 },
    pixelWidth: 1280,
    pixelHeight: 800,
    image: { data: "x" },
  };
  const { overlay, pointing } = rig({
    locator: createPointingLocator({ snaps: false }),
  });
  await pointing.show(
    [
      { n: 1, rect: { x: 1200, y: 700, width: 200, height: 200 }, label: "a" },
      { n: 2, rect: { x: 1300, y: 10, width: 50, height: 50 }, label: "b" },
    ],
    { displayId: "1", capture },
  );
  assert.deepEqual(
    overlay.shown[0].drawings.map((d) => [d.n, d.rect]),
    [[1, { x: 1200, y: 700, width: 80, height: 100 }]],
  );
});

test("pulse, focus and clear go to the overlay; clear says why", async () => {
  const { overlay, pointing } = rig();
  pointing.pulse(1);
  assert.deepEqual(
    overlay.commands,
    [],
    "nothing to pulse before marks are shown",
  );
  await pointing.show(refs, { displayId: "1" });
  pointing.pulse(2);
  pointing.focus([1]);
  pointing.focus(null);
  assert.deepEqual(overlay.commands, [
    ["pulse", 2],
    ["focus", [1]],
    ["focus", null],
  ]);
  pointing.clear("answer-changed");
  assert.deepEqual(overlay.dismissed, ["answer-changed"]);
  pointing.clear("again");
  assert.equal(overlay.dismissed.length, 1);
});

test("clearing while marks are still being drawn cancels the draw instead of letting it appear", async () => {
  const { overlay, pointing } = rig();
  const realShow = overlay.show;
  let finish;
  overlay.show = async (capture, drawings) => {
    // The real service holds its capture from the moment it starts to draw.
    overlay.capture = capture;
    await new Promise((resolve) => (finish = resolve));
    return realShow(capture, drawings);
  };
  const drawing = pointing.show(refs, { displayId: DISPLAY.id });
  await new Promise((resolve) => setImmediate(resolve));
  pointing.clear("esc");
  assert.deepEqual(overlay.dismissed, ["esc"]);
  finish();
  assert.equal(await drawing, false);
  assert.equal(pointing.active, false);
  assert.deepEqual(overlay.commands, []);
  pointing.pulse(1);
  assert.deepEqual(overlay.commands, [], "nothing was drawn to pulse");
});

test("numberOf maps the ref a hovered bubble carries to its mark", async () => {
  const { pointing } = rig();
  await pointing.show(refs, { displayId: "1" });
  assert.equal(pointing.numberOf("img-1"), 2);
  assert.equal(pointing.numberOf("nope"), null);
  assert.equal(pointing.numberOf(null), null);
});

test("marks fade and revive as the chat card closes and opens", async () => {
  const { overlay, card, pointing } = rig();
  await pointing.show(refs, { displayId: "1" });
  card.emit("fade");
  card.emit("revive");
  assert.deepEqual(overlay.commands, [
    ["fade", undefined],
    ["revive", undefined],
  ]);
  pointing.clear("done");
  card.emit("fade");
  assert.equal(overlay.commands.length, 2);
});

test("a click on a badge reaches onMarkClick until it is unsubscribed", async () => {
  const { overlay, pointing } = rig();
  const clicks = [];
  const off = pointing.onMarkClick((n) => clicks.push(n));
  overlay.emit("mark-click", 2);
  off();
  overlay.emit("mark-click", 1);
  assert.deepEqual(clicks, [2]);
});

test("the window listens for clicks only while the cursor is over a badge", async () => {
  const { overlay, cursor, pointing } = rig();
  await pointing.show(refs, { displayId: "1" });
  const badge = pointing.badges()[0];
  cursor.point = { x: badge.x + 4, y: badge.y + 4 };
  pointing.poll();
  pointing.poll();
  cursor.point = { x: 5, y: 5 };
  pointing.poll();
  assert.deepEqual(overlay.interactive, [true, false]);
});

test("marks go away when the element moved or vanished, not when it stays", async () => {
  const { locator, overlay, pointing } = rig();
  await pointing.show(refs, { displayId: "1" });
  await pointing.check();
  assert.deepEqual(overlay.dismissed, []);
  locator.list = locator.list.map((e) =>
    e.id === "img-1"
      ? { ...e, bounds: { ...e.bounds, y: e.bounds.y + 40 } }
      : e,
  );
  await pointing.check();
  assert.deepEqual(overlay.dismissed, ["content-changed"]);
  await pointing.show(refs, { displayId: "1" });
  locator.list = locator.list.filter((e) => e.id !== "para-1");
  await pointing.check();
  assert.deepEqual(overlay.dismissed, ["content-changed", "content-changed"]);
});

test("a locator that cannot answer is not evidence that the screen changed", async () => {
  const { locator, overlay, pointing } = rig();
  await pointing.show(refs, { displayId: "1" });
  locator.elements = async () => {
    throw new Error("a11y busy");
  };
  await pointing.check();
  assert.deepEqual(overlay.dismissed, []);
});

test("elementsForPrompt asks the locator about the window the question is about", async () => {
  const { pointing } = rig();
  const lines = await pointing.elementsForPrompt(WINDOW);
  assert.ok(lines.includes("img-1 image Photo of a lake"));
  assert.deepEqual(await pointing.elementsForPrompt(null), []);
});
