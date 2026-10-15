import test from "node:test";
import assert from "node:assert/strict";
import { tableMarkdown, textAttachment, imageAttachment, MAX_TEXT, chipText } from "./taken.mjs";

test("Markdown tables escape pipes and fill ragged rows", () => {
  assert.equal(
    tableMarkdown([["a|b", "c"], ["1"]]),
    "| a\\|b | c |\n| --- | --- |\n| 1 |  |",
  );
});

test("an empty table is empty text", () => assert.equal(tableMarkdown([]), ""));

test("text attachments are UTF-8 text files the composer's conversion accepts", () => {
  const a = textAttachment("héllo 你好");
  assert.equal(a.mediaType, "text/plain");
  assert.match(a.name, /\.txt$/);
  assert.equal(Buffer.from(a.data, "base64").toString("utf8"), "héllo 你好");
});

test("text is capped before it is sent", () => {
  const a = textAttachment("x".repeat(MAX_TEXT + 5000));
  assert.equal(Buffer.from(a.data, "base64").toString("utf8").length, MAX_TEXT);
  assert.ok(MAX_TEXT <= 200000);
});

test("image attachments keep their PNG data", () => {
  const a = imageAttachment({ data: "AAAA", width: 4, height: 3 });
  assert.deepEqual([a.mediaType, a.data], ["image/png", "AAAA"]);
});

test("the text chip shows the first words and the length", () => {
  const c = chipText("Blink looks at your screen and explains what it sees to you quietly.");
  assert.match(c.preview, /^Blink looks at your screen/);
  assert.ok(c.preview.length <= 32);
  assert.equal(c.length, 68);
});
