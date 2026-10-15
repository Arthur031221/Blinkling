import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderMarkdown, renderImage } from "./render.mjs";
import { translatorFor } from "./strings.mjs";
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
test("a raw interrupt marker reads as a plain line in the window language", () => {
  const { window } = new JSDOM();
  const markers = [
    "[Request interrupted by user]",
    "[Request interrupted by user for tool use]",
  ];
  for (const [locale, expected] of [
    ["zh-TW", "已停止"],
    ["ja", "停止しました"],
    ["en", "Stopped"],
    ["de", "Gestoppt"],
  ])
    for (const raw of markers) {
      const root = renderMarkdown(window.document, raw, {
        t: translatorFor(window.document, locale),
      });
      assert.equal(root.textContent, expected);
      assert.equal(root.querySelector(".gl-system-line").textContent, expected);
    }
  assert.equal(
    renderMarkdown(window.document, "[Request interrupted by user] but more")
      .textContent,
    "[Request interrupted by user] but more",
    "only the whole-message marker is replaced",
  );
  window.close();
});
test("code, image and summary labels follow the translator", async () => {
  const { window } = new JSDOM();
  const doc = window.document;
  const t = translatorFor(doc, "de");
  const root = renderMarkdown(doc, "**簡答：** kurz\n\n```js\nlet a;\n```", {
    t,
    copy: async () => {},
  });
  const button = root.querySelector("button");
  assert.equal(button.textContent, "Kopieren");
  assert.equal(button.getAttribute("aria-label"), "Code kopieren");
  button.click();
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(button.textContent, "Kopiert");
  assert.equal(
    root.querySelector(".gl-summary-tag").title,
    "Das ist eine kurze Antwort; der volle Text steht im Chat",
  );
  const image = renderImage(
    doc,
    { type: "image", mediaType: "image/png", data: "AAAA" },
    t,
  );
  assert.equal(image.alt, "Angehängtes Bild");
  window.close();
});

test("reference markers become numbered badges that hide the element id", () => {
  const { window } = new JSDOM();
  const doc = window.document;
  const t = translatorFor(doc, "en");
  const root = renderMarkdown(
    doc,
    "Press **Buy** [[1:e42|Buy button]] then check [[2:box:10,20,30,40|price tag]].",
    { t },
  );
  const badges = [...root.querySelectorAll("button.gl-ref")];
  assert.deepEqual(
    badges.map((b) => [b.textContent, b.dataset.ref, b.title]),
    [
      ["1", "e42", "Buy button"],
      ["2", "box:10,20,30,40", "price tag"],
    ],
  );
  assert.equal(
    badges[0].getAttribute("aria-label"),
    "Show Buy button on the page (reference 1)",
  );
  assert.equal(root.textContent, "Press Buy 1 then check 2.");
  assert.doesNotMatch(root.textContent, /e42|box:|\[\[/);
  window.close();
});

test("an unfinished reference stays hidden while streaming and code keeps its brackets", () => {
  const { window } = new JSDOM();
  const doc = window.document;
  assert.equal(
    renderMarkdown(doc, "Look here [[1:e4").textContent,
    "Look here ",
  );
  assert.equal(renderMarkdown(doc, "Look here [[").textContent, "Look here ");
  const code = renderMarkdown(doc, "Use `[[1:e4|x]]` literally");
  assert.equal(code.querySelector("code").textContent, "[[1:e4|x]]");
  assert.equal(code.querySelector(".gl-ref"), null);
  assert.equal(
    renderMarkdown(doc, "[[not a ref]] and [x]").textContent,
    "[[not a ref]] and [x]",
  );
  window.close();
});
