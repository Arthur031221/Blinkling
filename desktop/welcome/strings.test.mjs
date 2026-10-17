import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { readFileSync } from "node:fs";
import { strings, welcomeText, START_COMMAND } from "./strings.mjs";

test("every locale has the same keys and keeps the name Blinkling", () => {
  const keys = Object.keys(strings.en).sort();
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const text of Object.values(strings[locale]))
      assert.doesNotMatch(text, /布林克林|ブリンクリング/);
  }
});

test("the pick key fills in and the step counter names how many steps there are", () => {
  const t = welcomeText("en");
  assert.equal(t("tryTitle", { key: "Ctrl" }), "Hold Ctrl and click");
  assert.equal(t("step", { n: 2, total: 3 }), "Step 2 of 3");
  assert.equal(t("step", { n: 2, total: 4 }), "Step 2 of 4");
  assert.match(welcomeText("zh-TW")("tryBody", { key: "Ctrl" }), /Ctrl/);
});

test("an unknown language falls back to English", () => {
  assert.equal(welcomeText("xx")("done"), "Got it");
});

test("every locale tells the start command and says in one line what the flag does, as config/flag.json does", () => {
  const flag = JSON.parse(
    readFileSync(new URL("../../config/flag.json", import.meta.url), "utf8"),
  );
  assert.equal(START_COMMAND, flag.command);
  for (const locale of LOCALES) {
    assert.equal(strings[locale].connectLine, flag.line[locale], locale);
    assert.match(strings[locale].connectThen, /\/blinkling:blinkling/, locale);
  }
});
