import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LOCALES } from "../shared/i18n.mjs";
import { strings, captureText, textTable } from "./strings.mjs";
import { permissionLabels } from "./permission.mjs";

const here = (name) => new URL(name, import.meta.url);

test("every one of the nine locales has every key, no blanks", () => {
  const keys = Object.keys(strings.en).sort();
  assert.ok(keys.length > 10);
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const key of keys)
      assert.ok(String(strings[locale][key]).trim(), `${locale}.${key}`);
  }
});

test("the product name is written exactly Blinkling in every language", () => {
  for (const locale of LOCALES) {
    const text = JSON.stringify(strings[locale]);
    assert.doesNotMatch(text, /Glimpselet|布林克林|ブリンクリング/, locale);
  }
  for (const locale of LOCALES)
    assert.match(strings[locale].permissionLead, /Blinkling/, locale);
});

test("captureText follows the system language and falls back to English", () => {
  assert.equal(captureText("ja")("pageChip"), strings.ja.pageChip);
  assert.equal(captureText("zh-TW")("pageChip"), "整頁");
  assert.equal(captureText("nl")("pageChip"), strings.en.pageChip);
  assert.equal(captureText(undefined)("pageChip"), strings.en.pageChip);
});

test("the overlay hint names the four gestures and nothing else", () => {
  for (const locale of LOCALES) {
    const hint = strings[locale].hint;
    assert.match(hint, /Enter|Eingabe|Intro|Entrée/, locale);
    assert.match(hint, /Esc|Échap/, locale);
    assert.doesNotMatch(hint, /Shift/, locale);
  }
});

test("the capture pages carry no hard-coded text or language", async () => {
  for (const name of ["selection.html", "permission.html"]) {
    const html = await readFile(here(name), "utf8");
    assert.doesNotMatch(html, /lang="zh/, name);
    assert.doesNotMatch(html, /[぀-ヿ㐀-鿿]/, name);
    assert.match(html, /<html lang="en">/, name);
  }
});

test("macOS pane names are localised for each system version", () => {
  for (const locale of LOCALES) {
    const t = captureText(locale);
    for (const version of ["12.7", "13.6", "14.6", "15.1"]) {
      const labels = permissionLabels(version, t);
      for (const key of ["app", "pane", "section"])
        assert.ok(labels[key].trim(), `${locale} ${version} ${key}`);
    }
    assert.equal(
      permissionLabels("14.6", t).section,
      strings[locale].sectionSonoma,
    );
    assert.equal(
      permissionLabels("13.6", t).section,
      strings[locale].sectionVentura,
    );
  }
  assert.equal(permissionLabels("12.7", captureText("en")).control, "checkbox");
  assert.equal(permissionLabels("14.6", captureText("en")).control, "switch");
});

test("permission labels default to English", () => {
  assert.equal(permissionLabels("14.6").app, "System Settings");
});

test("the permission animation ends on the ON frame under reduced motion", async () => {
  const css = await readFile(here("permission.css"), "utf8");
  // Outside the no-preference block the switch, its knob and the check are ON.
  const [base] = css.split("@media (prefers-reduced-motion");
  assert.match(base, /\.switch\s*{[^}]*background:\s*var\(--green\)/);
  assert.match(base, /\.switch i\s*{[^}]*transform:\s*translateX\(14px\)/);
  assert.match(base, /\.checkbox i\s*{[^}]*opacity:\s*1/);
});

test("textTable falls back to English for an unknown locale", () => {
  assert.equal(textTable("ja").hint, strings.ja.hint);
  assert.equal(textTable("xx").hint, strings.en.hint);
  assert.deepEqual(Object.keys(textTable("de")), Object.keys(strings.en));
});
