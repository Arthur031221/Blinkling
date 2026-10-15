import test from "node:test";
import assert from "node:assert/strict";
import { strings, t } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";
// The old product name, built from parts so this file does not name it.
const OLD_NAME = new RegExp(["Glimp", "selet"].join(""));

test("all nine locales carry exactly the English keys", () => {
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  const keys = Object.keys(strings.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const [key, value] of Object.entries(strings[locale]))
      assert.ok(value.trim(), `${locale}.${key}`);
  }
});

test("the product and the mascot names are never translated", () => {
  for (const locale of LOCALES)
    for (const [key, value] of Object.entries(strings[locale])) {
      assert.doesNotMatch(
        value,
        new RegExp(`${OLD_NAME.source}|布林克|ブリンク`),
        `${locale}.${key}`,
      );
    }
  for (const locale of LOCALES)
    assert.match(strings[locale]["pdf.offer"], /Blinkling/);
});

test("the spec's Traditional Chinese words", () => {
  const z = t("zh-TW");
  assert.equal(z("chip.what"), "這是什麼");
  assert.equal(z("chip.translate"), "翻譯");
  assert.equal(z("chip.keypoints"), "重點");
  assert.equal(z("tag.frame"), "目前畫面");
  assert.equal(z("mini.pause"), "暫停自動解說");
  assert.equal(z("translate.page"), "翻譯整頁");
});

test("a missing key throws, and the first-hold hint tells the reader to click once", () => {
  assert.equal(t("en")("hint.pick"), "Click once to ask about this");
  assert.throws(() => t("en")("nope"));
});

test("the macOS pick key names", () => {
  assert.equal(t("en")("key.control"), "Control");
  assert.equal(t("en")("key.option"), "Option");
});
