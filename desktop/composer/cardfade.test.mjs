import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const view = readFileSync(new URL("./view.mjs", import.meta.url), "utf8");
const block = (selector) =>
  css.slice(css.indexOf(`${selector} {`)).split("\n}")[0];

test("the card's paper is solid where the message list starts", () => {
  const card = block(".gl-chat-card");
  // Both the paper and the outline reach full strength at --gl-fade, which the
  // view sets to the list's top, so no message text sits on a see-through card.
  const stops = card.match(/var\(--gl-fade, \d+px\)/g) ?? [];
  assert.equal(stops.length, 2);
  assert.doesNotMatch(card, /55%/);
  assert.match(view, /setProperty\("--gl-fade"/);
  assert.match(view, /history\.offsetTop/);
});

test("the list's own fade is no longer than the solid paper under it", () => {
  const history = block(".gl-chat-history");
  const ramp = Number(history.match(/#000 (\d+)px/)?.[1]);
  assert.ok(ramp > 0 && ramp <= 72);
});
