import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

const html = readFileSync("demo/index.html", "utf8");
const css = readFileSync("demo/demo.css", "utf8");
const pages = readFileSync(".github/workflows/build-pages.mjs", "utf8");
const check = readFileSync(".github/workflows/check-pages.mjs", "utf8");
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The showcase page is the v3 Blink page: the main tier and the secondary
// tier from docs/FEATURES.md, drawn with the shared wordmark, in Inter only.
describe("demo page", () => {
  it("draws the name with the shared wordmark placeholder", () => {
    assert.equal(html.match(/<!--wordmark-->/g)?.length, 1);
    assert.match(css, /--wordmark-height/);
  });

  it("loads no Fraunces", () => {
    for (const source of [html, css, pages])
      assert.doesNotMatch(source, /fraunces/i);
  });

  for (const v2 of [
    /suggested questions/i,
    /picture-in-picture/i,
    /floating/i,
    /channel preview/i,
    /shift/i,
    /chromium/i,
    /\b2\.1\b/,
    /google flights|arxiv/i,
  ])
    it(`has no v2 wording ${v2}`, () => {
      assert.doesNotMatch(html, v2);
      // The Playwright check legitimately names the Chromium it drives.
      if (!v2.test("chromium")) assert.doesNotMatch(check, v2);
    });

  it("ships no v2 recordings", () => {
    assert.doesNotMatch(html, /<img[^>]+\.gif/);
    assert.doesNotMatch(html, /demo-assets/);
    assert.doesNotMatch(pages, /\.gif|demo-assets/);
  });

  it("teaches Blink: Ctrl and click, Ctrl and drag, the mini composer", () => {
    assert.match(text, /Blink/);
    assert.match(text, /Ctrl/);
    assert.match(text, /click/i);
    assert.match(text, /drag/i);
  });

  it("keeps only the main and secondary tiers: hero, install, extras", () => {
    assert.ok(html.match(/<section/g).length <= 3);
    assert.ok(html.match(/<article/g).length <= 7);
  });

  it("keeps the strings the pages build toggles", () => {
    assert.match(html, /Store listings are not available yet\./);
    assert.match(html, /Updates are manual\./);
  });

  it("only animates transform and opacity", () => {
    for (const [, value] of css.matchAll(/transition(?:-property)?:([^;]+);/g))
      for (const property of value
        .split(",")
        .map((part) => part.trim().split(/\s+/)[0]))
        assert.match(property, /^(transform|opacity|none)$/, value);
  });

  it("is checked under the new heading", () => {
    const heading = html
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]
      .replace(/<br\s*\/?>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    assert.ok(check.includes(heading.replace(/\s/g, " ")), heading);
  });
});
