import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { CHIPS, defaultChip, scriptOf, isForeign, promptFor } from "./ask.mjs";

test("there are exactly three quick-ask chips", () => {
  assert.deepEqual(CHIPS, ["what", "translate", "points"]);
});

test("script detection", () => {
  assert.equal(scriptOf("Hello world"), "latin");
  assert.equal(scriptOf("今天的天氣很好"), "han");
  assert.equal(scriptOf("これは日本語です"), "kana");
  assert.equal(scriptOf("안녕하세요 세계"), "hangul");
  assert.equal(scriptOf("Привет мир"), "cyrillic");
  assert.equal(scriptOf("مرحبا بالعالم"), "arabic");
  assert.equal(scriptOf("1234 -- !!"), null);
});

test("foreign means a different script from the user's language", () => {
  assert.equal(isForeign("Hello world, how are you", "zh-TW"), true);
  assert.equal(isForeign("今天的天氣很好", "zh-TW"), false);
  assert.equal(isForeign("今天的天氣很好", "en"), true);
  assert.equal(isForeign("これは日本語です", "ja"), false);
  assert.equal(isForeign("漢字だけの文章", "ja"), false, "kanji is fine for ja");
  assert.equal(isForeign("Hello world", "de"), false, "latin vs latin is not guessed");
  assert.equal(isForeign("12345", "en"), false);
  assert.equal(isForeign("", "en"), false);
});

test("default ask by kind: image and chart ask what it is", () => {
  for (const kind of ["image", "chart", "video", "control", "formula", "table", "code", "window", "area", "screen"])
    assert.equal(defaultChip({ kind, text: "" }, "en"), "what", kind);
});

test("default ask by language: foreign text translates, own-language text explains", () => {
  assert.equal(defaultChip({ kind: "text", text: "Hello there, nice to meet you" }, "zh-TW"), "translate");
  assert.equal(defaultChip({ kind: "text", text: "你好，很高興認識你" }, "zh-TW"), "what");
  assert.equal(defaultChip({ kind: "text", text: "Bonjour tout le monde, merci" }, "ja"), "translate");
});

test("a long section or page defaults to key points, a short one to what", () => {
  const long = "word ".repeat(300);
  assert.equal(defaultChip({ kind: "section", text: long }, "en"), "points");
  assert.equal(defaultChip({ kind: "page", text: long }, "en"), "points");
  assert.equal(defaultChip({ kind: "section", text: "Short heading" }, "en"), "what");
});

test("foreign text beats length: a long foreign page translates", () => {
  assert.equal(defaultChip({ kind: "page", text: "词 ".repeat(300) }, "en"), "translate");
});

test("prompts differ by chip and kind, name the language, and only ask to explain", () => {
  const text = promptFor("what", { kind: "text" }, "zh-TW");
  const image = promptFor("what", { kind: "image" }, "zh-TW");
  assert.notEqual(text, image);
  assert.match(text, /Explain/);
  assert.match(image, /What is this/);
  assert.match(promptFor("translate", { kind: "text" }, "ja"), /Translate/);
  assert.match(promptFor("points", { kind: "section" }, "ko"), /key points/i);
  assert.match(promptFor("what", { kind: "text" }, "de"), /German/);
  assert.match(promptFor("what", { kind: "text" }, "zh-TW"), /Traditional Chinese/);
  for (const chip of CHIPS)
    assert.doesNotMatch(promptFor(chip, { kind: "text" }, "en"), /click|type|control/i);
});
