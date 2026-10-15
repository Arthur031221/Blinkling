import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createPickController, DRAG_PX } from "./controller.mjs";
import { createLocatorStub, display, element } from "./test/locator-stub.mjs";

const page = element("dom:w1:0", "window", display.bounds);
const section = element("dom:w1:1", "section", { x: 80, y: 60, width: 600, height: 400 }, { parentId: "dom:w1:0" });
const para = element(
  "dom:w1:2",
  "paragraph",
  { x: 100, y: 100, width: 400, height: 60 },
  { text: "Hello there", parentId: "dom:w1:1" },
);
const photo = element("dom:w1:3", "image", { x: 100, y: 200, width: 200, height: 120 }, { parentId: "dom:w1:1" });
const password = element("dom:w1:4", "input", { x: 100, y: 400, width: 200, height: 30 }, { secure: true, parentId: "dom:w1:1" });

function rig(options = {}) {
  const states = [];
  const taken = [];
  const captured = [];
  const errors = [];
  const locator = createLocatorStub({ elements: [page, section, para, photo, password], ...options.locator });
  const controller = createPickController({
    locator,
    guard: options.guard ?? { allowed: () => true },
    capture: async (rect, d) => {
      captured.push(rect);
      if (options.captureFails) throw new Error("no screen");
      return { data: "AAAA", width: Math.round(rect.width), height: Math.round(rect.height) };
    },
    displayAt: () => display,
    onState: (s) => states.push(s),
    onTaken: (t, meta) => taken.push({ t, meta }),
    onError: (e) => errors.push(e),
    newId: (() => {
      let n = 0;
      return () => `pick-${++n}`;
    })(),
  });
  return { controller, states, taken, captured, errors, locator, last: () => states.at(-1) };
}
const at = (x, y) => ({ x, y });
async function click(c, p) {
  await c.pointer({ type: "move", ...p });
  await c.pointer({ type: "down", ...p });
  await c.pointer({ type: "up", ...p });
}

test("raising shows the crayon badge, dropping clears everything", async () => {
  const r = rig();
  await r.controller.raise();
  assert.deepEqual([r.last().active, r.last().mode, r.last().locked], [true, "crayon", false]);
  r.controller.drop();
  assert.equal(r.last().active, false);
  assert.equal(r.last().outline, null);
});

test("hovering outlines the element under the pointer", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "move", ...at(120, 120) });
  assert.deepEqual(r.last().outline, para.bounds);
  assert.equal(r.last().kind, "text");
});

test("only the latest hover answer is shown", async () => {
  let release;
  const slow = createLocatorStub({ elements: [page, para, photo] });
  const original = slow.locate.bind(slow);
  slow.locate = (p) => (p.x === 120 ? new Promise((res) => (release = () => res(original(p)))) : original(p));
  const states = [];
  const c = createPickController({
    locator: slow,
    guard: { allowed: () => true },
    capture: async () => ({ data: "x", width: 1, height: 1 }),
    displayAt: () => display,
    onState: (s) => states.push(s),
    onTaken() {},
  });
  await c.raise();
  const first = c.pointer({ type: "move", x: 120, y: 120 });
  await c.pointer({ type: "move", x: 150, y: 250 });
  release();
  await first;
  assert.deepEqual(states.at(-1).outline, photo.bounds);
});

test("a click takes the hovered element with its pixels, text and kind", async () => {
  const r = rig();
  await r.controller.raise();
  await click(r.controller, at(120, 120));
  assert.equal(r.taken.length, 1);
  const { t } = r.taken[0];
  assert.equal(t.kind, "text");
  assert.equal(t.source, "pick");
  assert.deepEqual(t.bounds, para.bounds);
  assert.equal(t.text, "Hello there");
  assert.equal(t.elementId, para.id);
  assert.equal(t.image.data, "AAAA");
  assert.deepEqual(r.captured[0], para.bounds);
  assert.equal(t.display.id, display.id);
});

test("an image element is taken as an image", async () => {
  const r = rig();
  await r.controller.raise();
  await click(r.controller, at(150, 250));
  assert.equal(r.taken[0].t.kind, "image");
});

test("clicking an empty area takes the window", async () => {
  const r = rig();
  await r.controller.raise();
  await click(r.controller, at(900, 700));
  assert.equal(r.taken[0].t.kind, "window");
  assert.deepEqual(r.taken[0].t.bounds, display.bounds);
});

test("an existing selection wins over the element under the pointer", async () => {
  const selected = element("dom:w1:sel", "text", { x: 110, y: 104, width: 150, height: 20 }, { text: "Hello" });
  const r = rig({ locator: { selection: selected } });
  await r.controller.raise();
  await click(r.controller, at(120, 110));
  assert.equal(r.taken[0].t.text, "Hello");
  assert.deepEqual(r.taken[0].t.bounds, selected.bounds);
});

test("dragging past 6 px takes an area and shows the crosshair", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "move", ...at(300, 300) });
  await r.controller.pointer({ type: "down", ...at(300, 300) });
  await r.controller.pointer({ type: "move", ...at(300 + DRAG_PX + 4, 300 + DRAG_PX + 4) });
  assert.equal(r.last().mode, "crosshair");
  assert.ok(r.last().area);
  await r.controller.pointer({ type: "move", ...at(200, 250) });
  await r.controller.pointer({ type: "up", ...at(200, 250) });
  const { t } = r.taken[0];
  assert.equal(t.kind, "area");
  assert.deepEqual(t.bounds, { x: 200, y: 250, width: 100, height: 50 });
  assert.equal(r.last().mode, "crayon");
  assert.equal(r.last().area, null);
});

test("an area over text carries the text next to the picture", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "down", ...at(90, 90) });
  await r.controller.pointer({ type: "move", ...at(520, 170) });
  await r.controller.pointer({ type: "up", ...at(520, 170) });
  assert.equal(r.taken[0].t.text, "Hello there");
});

test("movement within 6 px is still a click", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "down", ...at(120, 120) });
  await r.controller.pointer({ type: "move", ...at(123, 122) });
  await r.controller.pointer({ type: "up", ...at(123, 122) });
  assert.equal(r.taken[0].t.kind, "text");
});

test("a denied guard shows the lock and takes nothing", async () => {
  const r = rig({ guard: { allowed: () => false } });
  await r.controller.raise();
  assert.equal(r.last().locked, true);
  await click(r.controller, at(120, 120));
  assert.equal(r.taken.length, 0);
  assert.equal(r.captured.length, 0);
});

test("a secure field is outlined with the lock but never read or captured", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "move", ...at(150, 410) });
  assert.equal(r.last().locked, true);
  assert.deepEqual(r.last().outline, password.bounds);
  await r.controller.pointer({ type: "down", ...at(150, 410) });
  await r.controller.pointer({ type: "up", ...at(150, 410) });
  assert.equal(r.taken.length, 0);
  assert.equal(r.captured.length, 0);
  assert.equal(r.locator.calls.textIn, 0);
});

test("an area dragged over a secure field is not captured either", async () => {
  const r = rig();
  await r.controller.raise();
  await r.controller.pointer({ type: "down", ...at(90, 380) });
  await r.controller.pointer({ type: "move", ...at(400, 450) });
  await r.controller.pointer({ type: "up", ...at(400, 450) });
  assert.equal(r.taken.length, 0);
});

test("clicking the picked spot again grows it one level instead of adding", async () => {
  const r = rig();
  await r.controller.raise();
  await click(r.controller, at(120, 120));
  await click(r.controller, at(120, 120));
  assert.equal(r.taken.length, 2);
  assert.equal(r.taken[1].t.elementId, section.id);
  assert.equal(r.taken[1].meta.replaces, r.taken[0].meta.id);
  assert.equal(r.controller.items.length, 1);
});

test("picks stack up to six and the seventh is refused", async () => {
  const extra = Array.from({ length: 6 }, (_, i) =>
    element(`e${i}`, "image", { x: 700 + (i % 3) * 120, y: 100 + Math.floor(i / 3) * 120, width: 100, height: 100 }),
  );
  const r = rig({ locator: { elements: [page, section, para, photo, password, ...extra] } });
  await r.controller.raise();
  for (const e of extra) await click(r.controller, at(e.bounds.x + 40, e.bounds.y + 40));
  assert.equal(r.controller.items.length, 6);
  const before = r.captured.length;
  await click(r.controller, at(150, 250));
  assert.equal(r.controller.items.length, 6);
  assert.equal(r.captured.length, before);
  assert.equal(r.last().full, true);
});

test("a failed capture reports the error and takes nothing", async () => {
  const r = rig({ captureFails: true });
  await r.controller.raise();
  await click(r.controller, at(120, 120));
  assert.equal(r.taken.length, 0);
  assert.equal(r.errors.length, 1);
});

test("nothing happens while the layer is down", async () => {
  const r = rig();
  await click(r.controller, at(120, 120));
  assert.equal(r.taken.length, 0);
});

test("reset forgets the picks", async () => {
  const r = rig();
  await r.controller.raise();
  await click(r.controller, at(120, 120));
  r.controller.reset();
  assert.equal(r.controller.items.length, 0);
});
