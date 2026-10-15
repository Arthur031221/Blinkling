import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";
import { efforts, modelLabel } from "./models.mjs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("all nine locales carry exactly the English keys, with no empty text", () => {
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  const keys = Object.keys(strings.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const [key, text] of Object.entries(strings[locale])) {
      assert.ok(text.trim(), `${locale}/${key} is empty`);
      assert.deepEqual(
        text.match(/\{\w+\}/g) ?? [],
        strings.en[key].match(/\{\w+\}/g) ?? [],
        `${locale}/${key} must keep the same placeholders`,
      );
    }
  }
});

test("every key the code asks for exists, and every effort and error code has text", () => {
  for (const file of ["view.mjs", "renderer.mjs"])
    for (const [, key] of source(file).matchAll(/\btr\("([\w-]+)"/g))
      assert.ok(strings.en[key] !== undefined, `${file} uses missing ${key}`);
  for (const id of efforts) assert.ok(strings.en[`effort-${id}`], id);
  const codes = [
    ...source("index.mjs").matchAll(
      /failure\("([\w-]+)"\)|error = "([\w-]+)"/g,
    ),
  ].map((m) => m[1] ?? m[2]);
  assert.ok(codes.length >= 8);
  for (const code of new Set(codes))
    assert.ok(strings.en[`error-${code}`], `error-${code}`);
});

test("no display text is written in the view, the composer or the stylesheet", () => {
  for (const file of ["view.mjs", "renderer.mjs", "index.mjs", "style.css"])
    assert.doesNotMatch(source(file), /[぀-ヿ一-鿿가-힯]/u, file);
});

test("a model id reads the same wherever it is shown", () => {
  assert.equal(modelLabel("opus"), "Opus");
  assert.equal(modelLabel("claude-opus-5-5-20260101"), "Opus 5.5");
  assert.equal(modelLabel("claude-sonnet-5-5"), "Sonnet 5.5");
  assert.equal(modelLabel("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(modelLabel("claude-opus-5"), "Opus 5");
  assert.equal(modelLabel("mystery-model"), "mystery-model");
});
