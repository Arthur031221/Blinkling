import "../shared/test-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) =>
  readFileSync(new URL(name, import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm,
    "",
  );
const css = read("./style.css"),
  renderer = read("./renderer.mjs");

test("the overlay styles take every time and curve from the motion tokens", () => {
  assert.doesNotMatch(
    css,
    /\b\d*\.?\d+m?s\b/,
    "no timing literal in style.css",
  );
  assert.doesNotMatch(css, /cubic-bezier\(/, "no curve literal in style.css");
  assert.match(css, /var\(--motion-slow\)/);
});

test("the overlay renderer animates with token durations and curves", () => {
  assert.doesNotMatch(renderer, /duration:\s*\d/);
  assert.doesNotMatch(renderer, /easing:\s*["'`]/);
  assert.doesNotMatch(renderer, /cubic-bezier\(/);
  assert.doesNotMatch(renderer, /\bset(Timeout|Interval)\(/);
});

test("overlay motion changes only transform and opacity", () => {
  const properties = new Set(
    [...renderer.matchAll(/\{\s*((?:\w+:\s*[^{},]+,?\s*)+)\}/g)]
      .flatMap((m) => [...m[1].matchAll(/(\w+):/g)].map((p) => p[1]))
      .filter(
        (name) =>
          ["opacity", "transform", "offset"].includes(name) ||
          /^(left|top|width|height|margin|stroke\w*)$/.test(name),
      ),
  );
  for (const name of properties)
    assert.ok(["opacity", "transform", "offset"].includes(name), name);
  const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(
    (m) => m[1],
  );
  for (const t of transitions) assert.match(t, /^(opacity|transform)\b/);
  assert.doesNotMatch(css, /animation:/);
});
