import test from "node:test";
import assert from "node:assert/strict";
import { strings, settingsText } from "./strings.mjs";
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

test("the version fills in and the help section keeps its Chinese name", () => {
  assert.equal(
    settingsText("en")("version", { version: "3.0.0" }),
    "Version 3.0.0",
  );
  assert.equal(settingsText("zh-TW")("help"), "說明");
  assert.equal(settingsText("zh-TW")("title"), "設定");
});

test("a locale falls back to English", () => {
  assert.equal(settingsText("xx")("close"), "Close");
});
