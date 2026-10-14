import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardBounds, resolvePosition } from "../main/placement.mjs";
import { anchorOf, growOrigin } from "./origin.mjs";

const display = (scaleFactor = 1) => ({
  id: 1,
  scaleFactor,
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  workArea: { x: 0, y: 0, width: 1280, height: 720 },
});
const originFor = (edge, ratio = 0.5, d = display()) => {
  const position = resolvePosition(d, { edge, ratio });
  const [x, y] = growOrigin(
    cardBounds(d, position),
    anchorOf({ display: d, position }),
  )
    .split(" ")
    .map(parseFloat);
  return { x, y };
};

test("the card grows from Blink's side on all four edges", () => {
  assert.equal(
    originFor("left").x,
    0,
    "Blink is left of a card on the left edge",
  );
  assert.equal(originFor("right").x, 100);
  assert.equal(
    originFor("bottom").y,
    100,
    "bottom edge: Blink is at the card's foot",
  );
  assert.ok(
    originFor("top").y < 50,
    "top edge: Blink is above the card's middle",
  );
  assert.equal(originFor("top").x, 100);
  assert.equal(originFor("bottom").x, 100);
  assert.equal(originFor("left", 0.9).y, 100);
});

test("the origin never leaves the card and survives other displays and zoom", () => {
  for (const edge of ["left", "right", "top", "bottom"])
    for (const ratio of [0, 0.3, 1])
      for (const scale of [1, 1.5, 2]) {
        const { x, y } = originFor(edge, ratio, display(scale));
        assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${edge} ${ratio}`);
      }
  assert.equal(
    growOrigin({ x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 5 }),
    "100% 100%",
  );
});

test("the card reads the origin from a variable instead of a fixed corner", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const card = css.match(/\.gl-chat-card\s*\{([^}]*)\}/)[1];
  assert.match(card, /transform-origin:\s*var\(--gl-origin/);
  assert.doesNotMatch(card, /transform-origin:\s*bottom right/);
});
