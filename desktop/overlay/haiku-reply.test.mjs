import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseGuide } from "./schema.mjs";
import { drawGuide } from "./test-draw.mjs";
const reply = await readFile(
  new URL("./recorded/haiku-low-reply.txt", import.meta.url),
  "utf8",
);
// Recorded from a real `--model haiku --effort low` guide turn on a 1280x900
// screenshot. The reply carries a trailing comma ("height":720,}) that strict
// JSON rejects, which made every real guide fail.
const capture = {
  display: {
    id: "1",
    bounds: { x: 0, y: 0, width: 1280, height: 900 },
    scaleFactor: 1,
  },
  region: { x: 0, y: 0, width: 1280, height: 900 },
  pixelWidth: 1280,
  pixelHeight: 900,
};
test("the recorded haiku reply parses into a guide", () => {
  const guide = parseGuide(reply, capture);
  assert.ok(guide.sections.length >= 4);
  assert.ok(guide.steps.length >= 3);
});
test("the recorded haiku reply yields drawings", async () => {
  const drawings = await drawGuide(parseGuide(reply, capture), capture);
  assert.ok(drawings.length >= 4);
});
test("a trailing comma and a dangling quote are repaired", () => {
  const guide = parseGuide(
    '{"purpose":"p","sections":[{"id":"s1","rect":{"x":1,"y":1,"width":50,"height":50,"},"label":"a","description":"d","paragraphs":[]}],"steps":[{"id":"t1","note":"n","regionIds":["s1"],"arrows":[]},]}',
    capture,
  );
  assert.equal(guide.sections[0].label, "a");
  assert.equal(guide.steps.length, 1);
});
test("valid JSON with commas inside strings is never altered", () => {
  const guide = parseGuide(
    '{"purpose":"p","sections":[{"id":"s1","rect":{"x":1,"y":1,"width":50,"height":50},"label":"x,","description":"d,]","paragraphs":[]}],"steps":[{"id":"t1","note":"n","regionIds":["s1"],"arrows":[]}]}',
    capture,
  );
  assert.equal(guide.sections[0].label, "x,");
  assert.equal(guide.sections[0].description, "d,]");
});
