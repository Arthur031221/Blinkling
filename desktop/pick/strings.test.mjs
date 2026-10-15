import test from "node:test";
import assert from "node:assert/strict";
import { strings, t } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";

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
      assert.doesNotMatch(value, /Glimpselet|布林克|ブリンク/, `${locale}.${key}`);
    }
  for (const locale of LOCALES) assert.match(strings[locale]["pdf.offer"], /Blinkling/);
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

test("variables fill in and a missing key throws", () => {
  assert.equal(t("en")("hint.pick", { key: "Ctrl" }).includes("Ctrl"), true);
  assert.throws(() => t("en")("nope"));
});

test("the macOS pick key names", () => {
  assert.equal(t("en")("key.control"), "Control");
  assert.equal(t("en")("key.option"), "Option");
});
