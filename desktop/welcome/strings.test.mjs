import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { strings, welcomeText } from "./strings.mjs";

test("every locale has the same keys and keeps the name Blinkling", () => {
  const keys = Object.keys(strings.en).sort();
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const text of Object.values(strings[locale]))
      assert.doesNotMatch(text, /布林克林|ブリンクリング/);
  }
});

test("the pick key fills in and the step counter names the three steps", () => {
  const t = welcomeText("en");
  assert.equal(t("tryTitle", { key: "Ctrl" }), "Hold Ctrl and click");
  assert.equal(t("step", { n: 2 }), "Step 2 of 3");
  assert.match(welcomeText("zh-TW")("tryBody", { key: "Ctrl" }), /Ctrl/);
});

test("an unknown language falls back to English", () => {
  assert.equal(welcomeText("xx")("done"), "Got it");
});
