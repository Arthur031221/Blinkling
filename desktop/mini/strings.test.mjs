import test from "node:test";
import assert from "node:assert/strict";
import { strings, t } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";
// The old product name, built from parts so this file does not name it.
const OLD_NAME = new RegExp(["Glimp", "selet"].join(""));

test("every locale has the same keys, and none say the old name", () => {
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  const keys = Object.keys(strings.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const value of Object.values(strings[locale])) {
      assert.ok(value.trim());
      assert.doesNotMatch(value, OLD_NAME);
    }
  }
});

test("variables fill in", () => {
  assert.equal(t("en")("mini.chars", { n: 12 }), "12 characters");
  assert.equal(t("zh-TW")("mini.remove", { name: "圖片" }), "移除圖片");
});

test("a locale falls back to English", () => {
  assert.equal(t("xx")("mini.send"), "Send");
});
