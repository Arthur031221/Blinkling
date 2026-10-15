import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { followShellTheme } from "./theme.mjs";

const look = readFileSync(
  new URL("../shared/look.css", import.meta.url),
  "utf8",
);
function page() {
  const dom = new JSDOM(`<style>${look}</style>`);
  // jsdom gives inline sheets no href; look.css is what this test loads.
  Object.defineProperty(dom.window.document.styleSheets[0], "href", {
    value: "file:///shared/look.css",
  });
  return dom.window.document;
}
const rule = (doc, selector) =>
  [...doc.styleSheets[0].cssRules].find((r) => r.selectorText === selector);

test("the shell's theme gets the look.css tokens, in both directions", () => {
  const doc = page();
  assert.equal(followShellTheme(doc), true);
  const night = rule(doc, ':root[data-theme="dark"]');
  const day = rule(doc, ':root[data-theme="light"]');
  assert.match(night.style.cssText, /--surface-2: #222723/);
  assert.match(day.style.cssText, /--surface-2: #faf8f3/);
  assert.doesNotMatch(night.style.cssText, /--radius-m/);
});

test("a page without look.css is left alone", () => {
  const doc = new JSDOM("<style>:root{--x:1}</style>").window.document;
  assert.equal(followShellTheme(doc), false);
});
