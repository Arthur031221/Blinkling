import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const rule = (selector) =>
  css.match(
    new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`),
  )?.[1] ?? "";

test("the input grows to six lines and never shows the native scroll arrows (MP-7)", () => {
  const input = rule(".mini-input");
  assert.match(input, /scrollbar-width:\s*none/);
  assert.match(css, /\.mini-input::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
});

test("the box uses only the shared tokens for colour, so the dark theme reaches every part (MP-6)", () => {
  const literal = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g);
  assert.equal(literal, null);
});
