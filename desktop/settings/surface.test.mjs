import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const windows = ["settings", "welcome"];

for (const name of windows) {
  test(`${name}: styles use the shared motion tokens and animate only transform and opacity`, () => {
    const css = read(`../${name}/style.css`);
    assert.doesNotMatch(css, /\b(?!0ms)\d+(\.\d+)?m?s\b/, "timing literal");
    const bare = css.replace(/var\([^)]*\)/g, "");
    assert.doesNotMatch(
      bare,
      /cubic-bezier|\bease(-in|-out|-in-out)?\b|\blinear\b/,
      "easing literal",
    );
    const properties = [
      ...css.matchAll(/transition(?:-property)?:\s*([^;]+);/g),
    ]
      .flatMap((m) => m[1].split(","))
      .map((part) => part.trim().split(/\s+/)[0]);
    assert.ok(properties.length > 0);
    for (const property of properties)
      assert.match(property, /^(transform|opacity)$/);
    assert.doesNotMatch(css, /@keyframes|animation\s*:/);
  });

  test(`${name}: scripts take their timings from the tokens`, () => {
    for (const file of ["index.mjs", "renderer.mjs"]) {
      const source = read(`../${name}/${file}`);
      assert.doesNotMatch(source, /setTimeout\([^)]*,\s*\d+\)/);
    }
  });

  test(`${name}: the page may load the wordmark kit and nothing else`, () => {
    const html = read(`../${name}/index.html`);
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
    assert.ok(csp, "CSP meta tag");
    assert.match(csp, /default-src 'self'/);
    // The wordmark kit's JSON import is a same-origin fetch.
    assert.match(csp, /connect-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
    assert.match(csp, /object-src 'none'/);
  });
}

for (const name of windows)
  test(`${name}: the header that drags the window never selects its text`, () => {
    const css = read(`../${name}/style.css`);
    const rule = new RegExp(`\\.${name}-head\\s*\\{[^}]*\\}`, "g");
    const heads = css.match(rule) ?? [];
    assert.ok(
      heads.some((r) => /user-select:\s*none/.test(r)),
      "user-select: none on the header",
    );
  });
