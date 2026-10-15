import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createGroup, MAX_ITEMS, growTarget } from "./group.mjs";
import { timing } from "../shared/motion.mjs";

const item = (id, extra = {}) => ({
  id,
  kind: "text",
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  ...extra,
});

test("six picks join one group and the seventh is refused", () => {
  const g = createGroup();
  for (let i = 0; i < MAX_ITEMS; i++) assert.equal(g.add(item(`e${i}`)).ok, true);
  const seventh = g.add(item("e6"));
  assert.deepEqual(seventh, { ok: false, reason: "full" });
  assert.equal(g.items.length, 6);
});

test("the limit is six", () => assert.equal(MAX_ITEMS, 6));

test("picking the same element twice keeps one chip", () => {
  const g = createGroup();
  g.add(item("a", { elementId: "dom:1:4" }));
  const again = g.add(item("b", { elementId: "dom:1:4" }));
  assert.equal(again.ok, true);
  assert.equal(g.items.length, 1);
});

test("remove drops one chip and frees a slot", () => {
  const g = createGroup();
  for (let i = 0; i < 6; i++) g.add(item(`e${i}`));
  g.remove("e2");
  assert.equal(g.items.length, 5);
  assert.equal(g.add(item("e9")).ok, true);
});

test("grow replaces the item in place, keeping its position", () => {
  const g = createGroup();
  g.add(item("a"));
  g.add(item("b"));
  g.replace("a", item("a2", { kind: "section" }));
  assert.deepEqual(
    g.items.map((i) => i.id),
    ["a2", "b"],
  );
});

test("a click inside the last picked bounds grows it; elsewhere adds", () => {
  const g = createGroup();
  g.add(item("a", { bounds: { x: 100, y: 100, width: 50, height: 20 } }));
  assert.equal(growTarget(g.items, { x: 120, y: 110 })?.id, "a");
  assert.equal(growTarget(g.items, { x: 400, y: 400 }), null);
  assert.equal(growTarget([], { x: 1, y: 1 }), null);
});

test("only the most recent item grows, so older chips stay as they were", () => {
  const items = [
    item("a", { bounds: { x: 0, y: 0, width: 100, height: 100 } }),
    item("b", { bounds: { x: 200, y: 0, width: 100, height: 100 } }),
  ];
  assert.equal(growTarget(items, { x: 50, y: 50 }), null);
  assert.equal(growTarget(items, { x: 250, y: 50 })?.id, "b");
});

test("59 s joins the same chat, 61 s starts a new one", () => {
  let t = 1_000_000;
  const g = createGroup({ now: () => t });
  const first = g.touchChat();
  assert.equal(first.fresh, true);
  t += 59_000;
  const joined = g.touchChat();
  assert.equal(joined.fresh, false);
  assert.equal(joined.id, first.id);
  t += 61_000;
  const next = g.touchChat();
  assert.equal(next.fresh, true);
  assert.notEqual(next.id, first.id);
});

test("the window slides: each touch restarts the 60 s", () => {
  let t = 0;
  const g = createGroup({ now: () => t });
  const a = g.touchChat();
  for (let i = 0; i < 5; i++) {
    t += 50_000;
    assert.equal(g.touchChat().id, a.id);
  }
});

test("the same-chat window is the spec's 60 s", () => {
  assert.equal(timing.sameChat, 60000);
});

test("clear empties the items but keeps the chat clock", () => {
  let t = 0;
  const g = createGroup({ now: () => t });
  const a = g.touchChat();
  g.add(item("a"));
  g.clear();
  assert.equal(g.items.length, 0);
  t += 10_000;
  assert.equal(g.touchChat().id, a.id);
});
