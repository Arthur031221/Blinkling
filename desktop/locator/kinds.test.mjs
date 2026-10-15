import test from "node:test";
import assert from "node:assert/strict";
import { KINDS, kindOf, isContainerKind, normalizeText } from "./kinds.mjs";

const cases = [
  ["paragraph", { role: "paragraph" }],
  ["paragraph", { role: "listitem" }],
  ["paragraph", { role: "blockquote" }],
  ["heading", { role: "heading" }],
  ["section", { role: "article" }],
  ["section", { role: "navigation" }],
  ["section", { role: "generic" }],
  ["text", { role: "text" }],
  ["text", { role: "caption" }],
  ["text", { role: "statictext" }],
  ["image", { role: "img" }],
  ["image", { role: "img", tag: "svg", name: "Company logo" }],
  ["figure", { role: "figure" }],
  ["figure", { role: "generic", tag: "figure" }],
  ["table", { role: "table" }],
  ["table", { role: "grid" }],
  ["cell", { role: "cell" }],
  ["cell", { role: "columnheader" }],
  ["cell", { role: "gridcell" }],
  ["code", { role: "code" }],
  ["code", { role: "generic", tag: "pre" }],
  ["formula", { role: "math" }],
  ["chart", { role: "img", tag: "svg", name: "Revenue chart" }],
  ["chart", { role: "graphics-document" }],
  ["video", { role: "video" }],
  ["video", { role: "audio" }],
  ["canvas", { role: "img", tag: "canvas" }],
  ["link", { role: "link" }],
  ["button", { role: "button" }],
  ["button", { role: "pushbutton" }],
  ["control", { role: "checkbox" }],
  ["control", { role: "slider" }],
  ["control", { role: "combobox" }],
  ["control", { role: "tab" }],
  ["control", { role: "menuitem" }],
  ["input", { role: "textbox" }],
  ["input", { role: "searchbox" }],
  ["input", { role: "spinbutton" }],
  ["input", { role: "textbox", secure: true }],
  ["window", { role: "window" }],
  ["window", { role: "frame" }],
  ["window", { role: "application" }],
  ["page", { role: "document" }],
  ["page", { role: "webarea" }],
];

for (const [kind, input] of cases)
  test(`${JSON.stringify(input)} is a ${kind}`, () => {
    assert.equal(kindOf(input), kind);
  });

test("every kind of the interface is produced by some role", () => {
  const produced = new Set([
    ...cases.map(([kind]) => kind),
    "sentence", // made by sentenceAt, never by a role
  ]);
  assert.deepEqual([...KINDS].sort(), [...produced].sort());
});

test("a secure field is an input whatever its role says", () => {
  assert.equal(kindOf({ role: "paragraph", secure: true }), "input");
  assert.equal(kindOf({ role: "password", tag: "input" }), "input");
});

test("roles are matched without case, spaces or dashes", () => {
  assert.equal(kindOf({ role: "Push Button" }), "button");
  assert.equal(kindOf({ role: "TABLE-CELL" }), "cell");
  assert.equal(kindOf({ role: "document web" }), "page");
});

test("an unknown role with text is text, without text a section", () => {
  assert.equal(kindOf({ role: "frobnicator", text: "hello" }), "text");
  assert.equal(kindOf({ role: "frobnicator" }), "section");
  assert.equal(kindOf({}), "section");
});

test("separators and decorations have no kind", () => {
  assert.equal(kindOf({ role: "separator" }), null);
  assert.equal(kindOf({ role: "presentation" }), null);
});

test("containers are the kinds a click can climb to", () => {
  for (const kind of ["section", "page", "window", "figure", "table"])
    assert.equal(isContainerKind(kind), true, kind);
  for (const kind of ["paragraph", "text", "image", "button", "input"])
    assert.equal(isContainerKind(kind), false, kind);
});

test("text is squashed and capped at 4000", () => {
  assert.equal(normalizeText("  a \n\n b\t c "), "a b c");
  assert.equal(normalizeText("x".repeat(5000)).length, 4000);
  assert.equal(normalizeText(undefined), "");
});
