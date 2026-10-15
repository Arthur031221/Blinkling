import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRefs, refKey } from "./refs.mjs";

test("element ids come first, in the order of their numbers", () => {
  const refs = parseRefs(
    "Open [[2:uia:7:12|Settings]] after you read [[1:uia:7:3|the intro]].",
  );
  assert.deepEqual(refs, [
    { n: 1, ref: "uia:7:3", elementId: "uia:7:3", label: "the intro" },
    { n: 2, ref: "uia:7:12", elementId: "uia:7:12", label: "Settings" },
  ]);
});

test("a pixel box is the fallback and carries its rectangle", () => {
  const [ref] = parseRefs("See [[1:box:10,20,300,40|the header]].");
  assert.deepEqual(ref, {
    n: 1,
    ref: "box:10,20,300,40",
    rect: { x: 10, y: 20, width: 300, height: 40 },
    label: "the header",
  });
});

test("a repeated number keeps its first target, and bad boxes are dropped", () => {
  const refs = parseRefs(
    "[[1:a:1:1|x]] [[1:a:1:2|y]] [[2:box:1,2,0,5|flat]] [[3:box:a,b,c,d|junk]] [[4:|empty]]",
  );
  assert.deepEqual(
    refs.map((r) => r.ref),
    ["a:1:1"],
  );
});

test("an unfinished reference while streaming is not a reference yet", () => {
  assert.deepEqual(parseRefs("Look at [[1:uia:7:3|the in"), []);
});

test("text without references, or a non-string, yields nothing", () => {
  assert.deepEqual(parseRefs("plain answer"), []);
  assert.deepEqual(parseRefs(undefined), []);
});

test("refKey matches the data-ref the bubble badge carries", () => {
  assert.equal(refKey({ elementId: "uia:7:3" }), "uia:7:3");
  assert.equal(
    refKey({ rect: { x: 1, y: 2, width: 3, height: 4 } }),
    "box:1,2,3,4",
  );
});
