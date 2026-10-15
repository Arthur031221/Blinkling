import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  elementsForPrompt,
  hidePointing,
  pointingInstructions,
} from "./elements.mjs";
import { samplePage } from "../pick/test/locator-stub.mjs";

test("the prompt lists id, kind and name for what can be pointed at", () => {
  const lines = elementsForPrompt(samplePage());
  assert.ok(lines.includes("img-1 image Photo of a lake"));
  assert.ok(
    lines.includes(
      "para-1 text Blink looks at your screen. It never clicks anything.",
    ),
  );
  assert.ok(lines.includes("table-1 table"));
});

test("containers, empty boxes and secure fields never reach the model", () => {
  const lines = elementsForPrompt(samplePage());
  for (const id of ["page ", "title-1 ", "section-1 ", "pw-1 "])
    assert.ok(!lines.some((l) => l.startsWith(id)), id);
  assert.deepEqual(
    elementsForPrompt([
      {
        id: "a:1:1",
        kind: "control",
        bounds: { x: 0, y: 0, width: 0, height: 9 },
      },
    ]),
    [],
  );
});

test("long text is clipped to one line and the list is capped", () => {
  const long = {
    id: "a:1:1",
    kind: "text",
    text: `${"word ".repeat(60)}\nnext`,
    bounds: { x: 0, y: 0, width: 5, height: 5 },
  };
  const [line] = elementsForPrompt([long]);
  assert.ok(!line.includes("\n") && line.length < 90 && line.endsWith("…"));
  const many = Array.from({ length: 200 }, (_, i) => ({
    ...long,
    id: `a:1:${i}`,
    text: "x",
  }));
  assert.equal(elementsForPrompt(many).length, 60);
  assert.equal(elementsForPrompt(many, { limit: 5 }).length, 5);
});

test("the instructions teach the badge syntax only when there is something to point at", () => {
  assert.equal(pointingInstructions([]), "");
  const text = pointingInstructions(["a:1:1 control Save"]);
  assert.match(text, /a:1:1 control Save/);
  assert.match(text, /\[\[1:a:1:1\|/);
  assert.match(text, /\[\[n:box:x,y,width,height\|label\]\]/);
});

test("the instructions never show in the user's own message", () => {
  const block = pointingInstructions(["a:1:1 control Save"]);
  const event = {
    type: "message",
    id: "u1",
    role: "user",
    content: [
      { type: "image", data: "x" },
      { type: "text", text: `What is this?${block}` },
    ],
  };
  const shown = hidePointing(event);
  assert.deepEqual(shown.content[1], { type: "text", text: "What is this?" });
  assert.equal(shown.content[0], event.content[0]);
  assert.match(event.content[1].text, /a:1:1 control Save/, "input untouched");
  const reply = { type: "message", role: "assistant", content: event.content };
  assert.equal(hidePointing(reply), reply);
  assert.equal(hidePointing({ type: "done" }).type, "done");
});
