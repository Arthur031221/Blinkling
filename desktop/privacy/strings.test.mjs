import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { strings, say, lockKey } from "./strings.mjs";

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every locale says every sentence, with the same placeholders", () => {
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(strings[locale]).sort(),
      Object.keys(strings.en).sort(),
      locale,
    );
    for (const [key, text] of Object.entries(strings[locale])) {
      assert.ok(text.trim().length > 0, `${locale}.${key}`);
      assert.deepEqual(
        placeholders(text),
        placeholders(strings.en[key]),
        `${locale}.${key}`,
      );
    }
  }
});
test("other languages are translated, and the names stay untranslated", () => {
  for (const locale of LOCALES.filter((x) => x !== "en"))
    for (const key of Object.keys(strings.en)) {
      assert.notEqual(
        strings[locale][key],
        strings.en[key],
        `${locale}.${key}`,
      );
      assert.match(
        strings[locale][key],
        /Blink/,
        `${locale}.${key} names Blink`,
      );
    }
  for (const locale of LOCALES)
    assert.match(strings[locale].claudeMissing, /Claude Code/);
});
test("each guard reason has a sentence", () => {
  const sentence = say("de");
  for (const key of Object.values(lockKey)) assert.ok(sentence(key));
  assert.deepEqual(Object.keys(lockKey).sort(), [
    "password-manager",
    "private",
    "secure",
  ]);
  assert.match(say("en")("usageLimit", { time: "3:00 PM" }), /3:00 PM/);
});
