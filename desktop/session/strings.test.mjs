import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { strings, say } from "./strings.mjs";

test("every locale says every sentence", () => {
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(strings[locale]).sort(),
      Object.keys(strings.en).sort(),
      locale,
    );
    for (const [key, text] of Object.entries(strings[locale])) {
      assert.ok(text.trim().length > 0, `${locale}.${key}`);
      if (locale !== "en")
        assert.notEqual(text, strings.en[key], `${locale}.${key}`);
    }
  }
});

test("a language the app does not ship reads English", () => {
  assert.equal(say("xx")("closed"), strings.en.closed);
});
