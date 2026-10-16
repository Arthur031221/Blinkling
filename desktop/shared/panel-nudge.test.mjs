import test from "node:test";
import assert from "node:assert/strict";
import { bindPanelNudge } from "./panel-nudge.mjs";

function setup() {
  const handlers = new Map();
  const win = { webContents: { id: 1 } };
  const store = new Map();
  const saved = [];
  let replaced = 0;
  const apply = bindPanelNudge({
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
    replace: () => replaced++,
  });
  const send = (message, sender = win.webContents) =>
    handlers.get("n")({ sender }, message);
  return { apply, send, saved, replaced: () => replaced };
}
const area = { x: 0, y: 0, width: 1000, height: 800 };
const box = { x: 300, y: 300, width: 200, height: 100 };

test("a drag moves the panel and places it again; only the end is remembered", () => {
  const p = setup();
  p.send({ x: 30, y: -20 });
  assert.deepEqual(p.apply(box, area), { ...box, x: 330, y: 280 });
  assert.equal(p.replaced(), 1);
  assert.equal(p.saved.length, 0);
  p.send({ x: 30, y: -20, commit: true });
  assert.equal(p.saved.length, 1);
});

test("the offset is held to 120 px and to the work area", () => {
  const p = setup();
  p.send({ x: 900, y: 0 });
  assert.equal(p.apply(box, area).x, 420);
  p.send({ x: -120, y: 0 });
  assert.equal(p.apply({ ...box, x: 10 }, area).x, 0);
});

test("a reset puts it back and is remembered; other senders are ignored", () => {
  const p = setup();
  p.send({ x: 50, y: 50, commit: true });
  p.send({ x: 90, y: 90 }, { id: 2 });
  assert.equal(p.apply(box, area).x, 350);
  p.send({ reset: true });
  assert.deepEqual(p.apply(box, area), box);
  assert.deepEqual(p.saved.at(-1), { x: 0, y: 0 });
});
