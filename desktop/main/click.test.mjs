import test from "node:test";
import assert from "node:assert/strict";
import { routeClick } from "./click.mjs";
import { validCommand } from "./ipc.mjs";

test("a click opens the mini composer, or the chat while a permission waits", () => {
  assert.equal(routeClick(), "mini");
  assert.equal(routeClick({ permission: false }), "mini");
  assert.equal(routeClick({ permission: true }), "chat");
});
test("click is a bare shell command", () => {
  assert.ok(validCommand({ type: "click" }));
  assert.ok(!validCommand({ type: "click", value: true }));
});
