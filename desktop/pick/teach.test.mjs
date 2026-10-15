import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createPickHint, mountPickAnimation } from "./teach.mjs";
import { createOnce } from "./once.mjs";
import { t } from "./strings.mjs";

const memory = () => {
  const map = new Map();
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v), map };
};

test("the first time the layer rises there is a hint, and never again", () => {
  const store = memory();
  const hint = createPickHint({ once: createOnce(store), t: t("zh-TW") });
  assert.equal(hint.onRaise(), "點一下就能詢問這個");
  assert.equal(hint.onRaise(), null);
  assert.equal(hint.onRaise(), null);
});

test("it stays gone after a restart", () => {
  const store = memory();
  createPickHint({ once: createOnce(store), t: t("en") }).onRaise();
  const again = createPickHint({ once: createOnce(store), t: t("en") });
  assert.equal(again.onRaise(), null);
});

test("the hint is in the reader's language", () => {
  assert.equal(createPickHint({ once: createOnce(memory()), t: t("ja") }).onRaise(), "クリックするとこれについて質問できます");
});

function mount(options = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="r"></div></body>`);
  const root = dom.window.document.getElementById("r");
  const demo = mountPickAnimation(root, { keyName: "Ctrl", dragLabel: "拖曳", ...options });
  return { root, demo, doc: dom.window.document };
}

test("the welcome animation shows the click scene first and the drag scene second", () => {
  const { root } = mount();
  const scenes = [...root.querySelectorAll(".demo-scene")].map((s) => s.className);
  assert.deepEqual(scenes, ["demo-scene demo-scene-click", "demo-scene demo-scene-drag"]);
  assert.ok(root.querySelector(".demo-blink"), "Blink is where everything flies to");
  assert.equal(root.querySelectorAll(".demo-thumb").length, 2);
});

test("the key caps name the key, and the second one adds the drag", () => {
  const { root } = mount({ keyName: "Option" });
  assert.deepEqual([...root.querySelectorAll(".demo-key")].map((k) => k.textContent), ["Option", "Option + 拖曳"]);
});

test("it is hidden from assistive tech, uses no inline style, and removes itself", () => {
  const { root, demo } = mount();
  assert.equal(root.querySelector(".pick-demo").getAttribute("aria-hidden"), "true");
  assert.equal(root.querySelector("[style]"), null);
  demo.destroy();
  assert.equal(root.querySelector(".pick-demo"), null);
});

test("its stylesheet moves only transform and opacity, and every duration comes from the tokens", () => {
  const css = readFileSync(new URL("./teach.css", import.meta.url), "utf8");
  const props = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)]
    .flatMap((m) => [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]));
  assert.deepEqual([...new Set(props)].sort(), ["opacity", "transform"]);
  assert.doesNotMatch(css, /(transition|animation)[^;]*[0-9.]+m?s\b/);
  assert.match(css, /prefers-reduced-motion/);
});
