import { readFileSync } from "node:fs";
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

test("Help tells every language the start command and what the flag does", () => {
  const flag = JSON.parse(
    readFileSync(new URL("../../config/flag.json", import.meta.url), "utf8"),
  );
  for (const locale of LOCALES)
    assert.equal(settingsText(locale)("syncLine"), flag.line[locale], locale);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /data-text="syncTitle"/);
  assert.match(html, /data-text="syncLine"/);
  assert.ok(html.includes(flag.command));
});

test("the quit key help names the key in every language", () => {
  for (const locale of LOCALES) {
    const line = settingsText(locale)("quitHelp", {
      key: "Ctrl + Alt + Shift + B",
    });
    assert.match(line, /Ctrl \+ Alt \+ Shift \+ B/, locale);
    assert.doesNotMatch(line, /\{key\}/, locale);
  }
});
