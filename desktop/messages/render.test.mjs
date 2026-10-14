import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderMarkdown, renderImage } from "./render.mjs";
test("Markdown renders structure and literal code without executable model HTML", async () => {
  const { window } = new JSDOM();
  const doc = window.document;
  let copied;
  const root = renderMarkdown(
    doc,
    "**Bold** and `inline`\n\n- first\n- second\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n| A | B |\n| --- | --- |\n| x | y |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [safe](https://example.com)",
    { copy: async (s) => (copied = s) },
  );
  assert.equal(root.querySelector("strong").textContent, "Bold");
  assert.equal(root.querySelectorAll("li").length, 2);
  assert.equal(root.querySelectorAll("td").length, 2);
  assert.equal(root.querySelector("script"), null);
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelectorAll("a").length, 1);
  assert.equal(root.querySelector("a").href, "https://example.com/");
  root.querySelector("button").click();
  await Promise.resolve();
  assert.equal(copied, "<img src=x onerror=alert(1)>");
  assert.equal(
    renderImage(doc, {
      type: "image",
      source: { type: "url", url: "https://evil.invalid" },
    }),
    null,
  );
  window.close();
});
test("a raw interrupt marker reads as a plain 已停止 line", () => {
  const { window } = new JSDOM();
  for (const raw of [
    "[Request interrupted by user]",
    "[Request interrupted by user for tool use]",
  ]) {
    const root = renderMarkdown(window.document, raw);
    assert.equal(root.textContent, "已停止");
    assert.equal(root.querySelector(".gl-system-line").textContent, "已停止");
  }
  assert.equal(
    renderMarkdown(window.document, "[Request interrupted by user] but more").textContent,
    "[Request interrupted by user] but more",
    "only the whole-message marker is replaced",
  );
  window.close();
});
