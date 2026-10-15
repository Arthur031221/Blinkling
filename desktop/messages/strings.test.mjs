import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { strings, translatorFor } from "./strings.mjs";

test("every locale has exactly the English keys and the same placeholders", () => {
  const keys = Object.keys(strings.en).sort();
  const holes = (text) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale] ?? {}).sort(), keys, locale);
    for (const key of keys)
      assert.deepEqual(
        holes(strings[locale][key]),
        holes(strings.en[key]),
        `${locale}.${key}`,
      );
  }
});

test("Blink is never translated", () => {
  for (const locale of LOCALES)
    assert.match(strings[locale].deckLabel, /Blink/, locale);
});

test("translatorFor follows the window language and falls back to English", () => {
  const doc = (languages) => ({ defaultView: { navigator: { languages } } });
  assert.equal(translatorFor(doc(["ja-JP"]))("stopped"), "停止しました");
  assert.equal(translatorFor(doc(["de"]))("openChat"), "Im Chat öffnen");
  assert.equal(translatorFor(doc(["zh-Hant-TW"]))("copied"), "已複製");
  assert.equal(translatorFor(doc(["sv"]))("stopped"), "Stopped");
  assert.equal(translatorFor(doc([]), "ko")("copied"), "복사됨");
  assert.equal(
    translatorFor(doc(["en"]))("reference", { n: 2, label: "Buy" }),
    "Show Buy on the page (reference 2)",
  );
});
