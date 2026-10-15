import test from "node:test";
import assert from "node:assert/strict";
import { createEscapeKeys } from "./escape-keys.mjs";
import { escape, setLayer, topLayer, LAYERS } from "../shared/escape.mjs";

function setup() {
  for (const name of LAYERS) setLayer(name, null);
  const registered = [];
  const shortcuts = {
    register: (key) => (registered.push(["on", key]), true),
    unregister: (key) => registered.push(["off", key]),
  };
  const keys = createEscapeKeys({ shortcuts });
  return { keys, registered };
}

test("the global Esc is registered only while guide or marks is the top layer", () => {
  const { keys, registered } = setup();
  keys.set("mini", () => {});
  assert.deepEqual(registered, [], "mini has its own focused window");
  keys.set("guide", () => {});
  assert.deepEqual(registered, [], "mini is still above guide");
  keys.set("mini", null);
  assert.deepEqual(registered, [["on", "Escape"]]);
  keys.set("guide", null);
  assert.deepEqual(registered.at(-1), ["off", "Escape"]);
  keys.set("marks", () => {});
  assert.deepEqual(registered.at(-1), ["on", "Escape"]);
  keys.set("marks", null);
});

test("the capture overlay above guide and marks keeps the global key off", () => {
  const { keys, registered } = setup();
  keys.set("guide", () => {});
  keys.set("overlay", () => {});
  assert.deepEqual(registered.at(-1), ["off", "Escape"]);
  keys.set("overlay", null);
  assert.deepEqual(registered.at(-1), ["on", "Escape"]);
  keys.set("guide", null);
});

test("pressing Esc closes only the top layer and re-syncs the key", () => {
  const { keys, registered } = setup();
  const closed = [];
  keys.set("guide", () => closed.push("guide"));
  keys.set("marks", () => closed.push("marks"));
  assert.equal(keys.press(), "guide");
  assert.deepEqual(closed, ["guide"]);
  assert.equal(topLayer(), "marks");
  assert.equal(registered.at(-1)[0], "on");
  assert.equal(keys.press(), "marks");
  assert.equal(registered.at(-1)[0], "off");
  assert.equal(keys.press(), null);
  assert.deepEqual(closed, ["guide", "marks"]);
});

test("a layer closed from elsewhere frees the key", () => {
  const { keys, registered } = setup();
  keys.set("guide", () => {});
  keys.set("guide", null);
  assert.equal(registered.at(-1)[0], "off");
  assert.equal(escape(), null);
});
