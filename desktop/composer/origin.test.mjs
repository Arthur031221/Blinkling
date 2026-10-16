import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardBounds, resolvePosition } from "../main/placement.mjs";
import { anchorOf, growOrigin, tailOf } from "./origin.mjs";

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
  assert.ok(
    originFor("bottom").y >= 98,
    "bottom edge: Blink is at the card's foot",
  );
  {
    // Top edge: Blink slides down far enough to leave room for the menu fan, so
    // the origin follows wherever Blink really is relative to the card.
    const d = display(),
      position = resolvePosition(d, { edge: "top", ratio: 0.5 }),
      card = cardBounds(d, position);
    assert.equal(
      originFor("top").y,
      Math.round(((position.reveal.y - card.y) / card.height) * 100),
      "top edge: the origin is Blink's own height inside the card",
    );
  }
  assert.equal(originFor("top").x, 100);
  assert.equal(originFor("bottom").x, 100);
  assert.ok(originFor("left", 0.9).y >= 98);
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

test("the tail grows from the side of the card that faces the mouth and keeps off the corners", () => {
  const card = { x: 100, y: 100, width: 400, height: 500 };
  assert.deepEqual(tailOf(card, { x: 560, y: 300 }), {
    side: "right",
    at: 200,
  });
  assert.deepEqual(tailOf(card, { x: 40, y: 350 }), { side: "left", at: 250 });
  assert.deepEqual(tailOf(card, { x: 560, y: 90 }), { side: "right", at: 36 });
  assert.deepEqual(tailOf(card, { x: 560, y: 900 }), {
    side: "right",
    at: 464,
  });
  assert.deepEqual(tailOf(card, { x: 300, y: 40 }), { side: "top", at: 200 });
  assert.deepEqual(tailOf(card, { x: 300, y: 700 }), {
    side: "bottom",
    at: 200,
  });
  assert.equal(tailOf(card, { x: 300, y: 300 }), null);
});

test("while Blink is carried the card grows from where Blink is held, not from where it rests", () => {
  const d = display();
  const position = resolvePosition(d, { edge: "right", ratio: 0.5 });
  assert.deepEqual(
    anchorOf({ display: d, position, drag: { x: 300, y: 200 } }),
    {
      x: 300,
      y: 200,
    },
  );
  assert.deepEqual(anchorOf({ display: d, position, drag: null }), {
    x: position.reveal.x,
    y: position.reveal.y,
  });
});
