import test from "node:test";
import assert from "node:assert/strict";
import { KINDS, kindOfAx, kindOfDom, isKind } from "./kinds.mjs";

test("the kind list is exactly the twenty the interface names", () => {
  assert.deepEqual(
    [...KINDS],
    [
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
    ],
  );
  assert.ok(isKind("cell"));
  assert.ok(!isKind("media"));
});

// One row per Kind: what the companion extension (DOM) sends for it.
const DOM = [
  ["heading", { kind: "heading", role: "heading", tag: "h2" }],
  ["paragraph", { kind: "paragraph", role: "paragraph", tag: "p" }],
  ["paragraph", { kind: "listitem", role: "listitem", tag: "li" }],
  ["paragraph", { kind: "quote", role: "blockquote", tag: "blockquote" }],
  ["text", { kind: "caption", role: "caption", tag: "figcaption" }],
  ["section", { kind: "main", role: "main", tag: "main" }],
  ["section", { kind: "region", role: "generic", tag: "div" }],
  ["section", { kind: "navigation", role: "navigation", tag: "nav" }],
  ["image", { kind: "image", role: "img", tag: "img" }],
  ["canvas", { kind: "image", role: "img", tag: "canvas" }],
  ["figure", { kind: "figure", role: "figure", tag: "figure" }],
  ["table", { kind: "table", role: "table", tag: "table" }],
  ["cell", { kind: "cell", role: "cell", tag: "td" }],
  ["code", { kind: "code", role: "code", tag: "pre" }],
  ["formula", { kind: "math", role: "math", tag: "math" }],
  [
    "chart",
    {
      kind: "image",
      role: "img",
      tag: "svg",
      rect: { x: 0, y: 0, width: 400, height: 240 },
    },
  ],
  [
    "image",
    {
      kind: "image",
      role: "img",
      tag: "svg",
      rect: { x: 0, y: 0, width: 16, height: 16 },
    },
  ],
  ["chart", { kind: "image", role: "graphics-document", tag: "svg" }],
  ["video", { kind: "media", role: "video", tag: "video" }],
  ["control", { kind: "media", role: "audio", tag: "audio" }],
  ["link", { kind: "link", role: "link", tag: "a" }],
  ["button", { kind: "button", role: "button", tag: "button" }],
  ["control", { kind: "input", role: "checkbox", tag: "input" }],
  ["control", { kind: "input", role: "slider", tag: "input" }],
  ["input", { kind: "input", role: "textbox", tag: "input" }],
  ["input", { kind: "input", role: "combobox", tag: "select" }],
  ["page", { kind: "page", role: "document", tag: "html" }],
  ["window", { kind: "dialog", role: "dialog", tag: "dialog" }],
];
for (const [expected, input] of DOM)
  test(`dom ${input.tag}/${input.role} is a ${expected}`, () => {
    assert.equal(kindOfDom(input), expected);
  });

test("an element the extension has no word for is a section, never a made-up kind", () => {
  assert.equal(
    kindOfDom({ kind: "carousel", role: "", tag: "x-slides" }),
    "section",
  );
  assert.ok(isKind(kindOfDom({})));
});

// AT-SPI, macOS AX and Windows UI Automation names for the same kinds.
const AX = [
  ["button", "push button"],
  ["button", "AXButton"],
  ["button", "Button"],
  ["control", "check box"],
  ["control", "AXCheckBox"],
  ["control", "CheckBox"],
  ["control", "radio button"],
  ["control", "slider"],
  ["control", "AXSlider"],
  ["input", "entry"],
  ["input", "AXTextField"],
  ["input", "Edit"],
  ["input", "AXComboBox"],
  ["link", "link"],
  ["link", "AXLink"],
  ["link", "Hyperlink"],
  ["heading", "heading"],
  ["heading", "AXHeading"],
  ["paragraph", "paragraph"],
  ["paragraph", "list item"],
  ["paragraph", "block quote"],
  ["text", "static"],
  ["text", "label"],
  ["text", "AXStaticText"],
  ["text", "Text"],
  ["text", "text"],
  ["image", "image"],
  ["image", "AXImage"],
  ["image", "Image"],
  ["image", "icon"],
  ["canvas", "canvas"],
  ["chart", "chart"],
  ["figure", "figure"],
  ["table", "table"],
  ["table", "AXTable"],
  ["cell", "table cell"],
  ["cell", "AXCell"],
  ["cell", "DataItem"],
  ["code", "code"],
  ["formula", "math"],
  ["formula", "math fraction"],
  ["video", "video"],
  ["section", "section"],
  ["section", "panel"],
  ["section", "AXGroup"],
  ["section", "Group"],
  ["section", "filler"],
  ["section", "split pane"],
  ["page", "document web"],
  ["page", "document frame"],
  ["page", "AXWebArea"],
  ["page", "Document"],
  ["page", "page"],
  ["window", "frame"],
  ["window", "dialog"],
  ["window", "AXWindow"],
  ["window", "Window"],
  ["window", "window"],
];
for (const [expected, role] of AX)
  test(`ax role ${role} is a ${expected}`, () => {
    assert.equal(kindOfAx(role), expected);
  });

test("an unknown accessibility role is a section", () => {
  assert.equal(kindOfAx("flux capacitor"), "section");
  assert.equal(kindOfAx(undefined), "section");
});
