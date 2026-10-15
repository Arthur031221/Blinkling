import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { takenKind, effectFor, EFFECTS, TAKEN_KINDS } from "./kinds.mjs";

const ELEMENT_KINDS = [
  "paragraph",
  "sentence",
  "heading",
  "section",
  "text",
  "image",
  "figure",
  "table",
  "cell",
  "code",
  "formula",
  "chart",
  "video",
  "canvas",
  "link",
  "button",
  "control",
  "input",
  "window",
  "page",
];

test("every locator element kind maps to a taken kind with an effect", () => {
  for (const kind of ELEMENT_KINDS) {
    const taken = takenKind(kind);
    assert.ok(TAKEN_KINDS.includes(taken), `${kind} -> ${taken}`);
    assert.ok(effectFor(taken), `${taken} has an effect`);
  }
});

test("kind to effect follows M4", () => {
  const expected = {
    text: "crayon-lines",
    image: "loop",
    table: "outline-sweep",
    code: "brackets-sides",
    formula: "wavy-underline",
    chart: "corner-brackets",
    control: "circle",
    video: "corner-brackets-tag",
    section: "bracket-left",
    window: "window-edge",
    page: "window-edge",
    screen: "window-edge",
    area: "outline",
  };
  for (const [kind, effect] of Object.entries(expected))
    assert.equal(effectFor(kind), effect, kind);
});

test("figures are images, headings are sections, canvases are video", () => {
  assert.equal(takenKind("figure"), "image");
  assert.equal(takenKind("heading"), "section");
  assert.equal(takenKind("canvas"), "video");
  assert.equal(takenKind("cell"), "text");
  assert.equal(takenKind("button"), "control");
  assert.equal(takenKind("link"), "control");
});

test("the effect table is frozen and covers exactly the taken kinds", () => {
  assert.ok(Object.isFrozen(EFFECTS));
  assert.deepEqual(Object.keys(EFFECTS).sort(), [...TAKEN_KINDS].sort());
});

test("an unknown kind falls back to a plain outline, never throws", () => {
  assert.equal(takenKind("blob"), "area");
  assert.equal(effectFor("blob"), "outline");
});
