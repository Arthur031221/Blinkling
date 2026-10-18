import test from "node:test";
import assert from "node:assert/strict";
import { bindPanelNudge } from "./panel-nudge.mjs";

const area = { x: 0, y: 0, width: 1000, height: 800 };
const box = { x: 300, y: 300, width: 200, height: 100 };

function setup() {
  const handlers = new Map();
  const kept = [];
  const win = { webContents: { id: 1, send: (c, v) => kept.push([c, v]) } };
  const store = new Map();
  const saved = [];
  let replaced = 0;
  // Placing the panel again is what keeps the offset that fits.
  let apply;
  apply = bindPanelNudge({
    ipc: { on: (c, fn) => handlers.set(c, fn) },
    win,
    channel: "n",
    key: () => "panel",
    nudges: {
      get: (k) => store.get(k) ?? { x: 0, y: 0 },
      set: (k, v, commit) => {
        store.set(k, v);
        if (commit) saved.push(v);
      },
    },
    replace: () => {
      replaced++;
      apply?.(box, area);
    },
  });
  const send = (message, sender = win.webContents) =>
    handlers.get("n")({ sender }, message);
  return { apply, send, saved, kept, replaced: () => replaced };
}

test("a drag moves the panel and places it again; only the end is remembered", () => {
  const p = setup();
  p.send({ x: 30, y: -20 });
  assert.deepEqual(p.apply(box, area), { ...box, x: 330, y: 280 });
  assert.equal(p.replaced(), 1);
  assert.equal(p.saved.length, 0);
  p.send({ x: 30, y: -20, commit: true });
  assert.equal(p.saved.length, 1);
});

test("a panel goes anywhere in the work area and no further, and the page hears what was kept", () => {
  const p = setup();
  p.send({ x: 900, y: 0, commit: true });
  assert.equal(p.apply(box, area).x, 800, "the right edge of the work area");
  assert.deepEqual(p.kept.at(-1), ["n-kept", { x: 500, y: 0 }]);
  p.send({ x: -2000, y: -2000, commit: true });
  const top = p.apply({ ...box, x: 10 }, area);
  assert.deepEqual([top.x, top.y], [0, 0], "the top left corner");
  p.send({ x: 5000, y: 5000 });
  const far = p.apply(box, area);
  assert.deepEqual([far.x + far.width, far.y + far.height], [1000, 800]);
});

test("a drag that has not ended tells the page nothing", () => {
  const p = setup();
  p.send({ x: 30, y: 30 });
  assert.equal(p.kept.length, 0);
});

test("a reset puts it back and is remembered; other senders are ignored", () => {
  const p = setup();
  p.send({ x: 50, y: 50, commit: true });
  p.send({ x: 90, y: 90 }, { id: 2 });
  assert.equal(p.apply(box, area).x, 350);
  p.send({ reset: true });
  assert.deepEqual(p.apply(box, area), box);
  assert.deepEqual(p.saved.at(-1), { x: 0, y: 0 });
  assert.deepEqual(p.kept.at(-1), ["n-kept", { x: 0, y: 0 }]);
});
