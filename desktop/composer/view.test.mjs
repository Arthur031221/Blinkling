import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createComposer } from "./index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { mountComposer } from "./view.mjs";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const blocks = (selector) =>
  [...css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(",").map((s) => s.trim()).includes(selector))
    .map((m) => m[2]);
const long = "非常長的檔案名稱-screenshot-with-a-very-long-name-スクリーンショット.png";

function setup({ selection = { model: "haiku", effort: "low" } } = {}) {
  const dom = new JSDOM("<body><div id='host'></div></body>", { pretendToBeVisual: true });
  const { window } = dom;
  const previous = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  const selected = [];
  let listener;
  const session = {
    send: async () => {},
    select: async (next) => {
      selected.push(next);
      return next;
    },
    stop: async () => {},
    subscribe: (fn) => ((listener = fn), () => (listener = null)),
  };
  const composer = createComposer({ session, selection });
  const store = createMessageStream({ quietMs: 600_000 });
  const host = window.document.querySelector("#host");
  const view = mountComposer(host, { composer, store });
  const q = (s) => host.querySelector(s);
  const picker = (label) =>
    [...host.querySelectorAll(".gl-picker")].find(
      (p) => p.querySelector(".gl-picker-menu").getAttribute("aria-label") === label,
    );
  const options = (label) =>
    [...picker(label).querySelectorAll(".gl-picker-option")].map((o) => o.dataset.value);
  return {
    window,
    host,
    q,
    picker,
    options,
    composer,
    selected,
    emit: (e) => listener(e),
    trigger: (label) => picker(label).querySelector(".gl-picker-trigger"),
    key: (el, key) =>
      el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
    dispose() {
      view.dispose();
      composer.dispose();
      store.dispose();
      globalThis.AbortController = previous;
      window.close();
    },
  };
}

test("the model and effort pickers are Blink popovers: no native select, no blank entry", () => {
  const t = setup();
  assert.equal(t.host.querySelectorAll("select, option").length, 0);
  assert.deepEqual(t.options("模型"), ["opus", "sonnet", "haiku"]);
  assert.deepEqual(t.options("思考程度"), ["low", "medium", "high"]);
  for (const option of t.host.querySelectorAll(".gl-picker-option"))
    assert.notEqual(option.textContent.trim(), "");
  assert.match(t.trigger("模型").textContent, /Haiku/);
  assert.match(t.trigger("思考程度").textContent, /Low/);
  t.dispose();
});

test("before a selection exists the trigger names its job and cannot open", () => {
  const t = setup({ selection: null });
  assert.equal(t.trigger("模型").textContent, "模型");
  assert.equal(t.trigger("模型").disabled, true);
  t.dispose();
});

test("applied selections never add duplicates, however many answers arrive", () => {
  const t = setup();
  const applied = [
    ["claude-opus-5-5-20260101", "high"],
    ["claude-sonnet-5-5", "medium"],
    ["claude-opus-5-5-20260101", "high"],
    ["claude-haiku-5-5", "low"],
    ["opus", "high"],
    ["claude-opus-5-5-20260101", "high"],
  ];
  for (let round = 0; round < 5; round++)
    for (const [model, effort] of applied)
      t.emit({ type: "selection", applied: { model, effort } });
  assert.deepEqual(t.options("模型"), ["opus", "sonnet", "haiku"]);
  assert.deepEqual(t.options("思考程度"), ["low", "medium", "high"]);
  t.emit({ type: "selection", applied: { model: "claude-opus-5-5-20260101", effort: "high" } });
  assert.equal(t.trigger("模型").textContent, "Opus 5.5");
  t.emit({ type: "selection", applied: { model: "mystery-model", effort: "xhigh" } });
  t.emit({ type: "selection", applied: { model: "mystery-model", effort: "xhigh" } });
  assert.deepEqual(t.options("模型"), ["opus", "sonnet", "haiku", "mystery-model"]);
  assert.equal(t.options("思考程度").filter((v) => v === "xhigh").length, 1);
  t.dispose();
});

test("a picker opens, chooses with the pointer, and reports the selection", async () => {
  const t = setup();
  const trigger = t.trigger("模型"),
    menu = t.picker("模型").querySelector(".gl-picker-menu");
  assert.equal(menu.hidden, true);
  trigger.click();
  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  t.picker("模型").querySelector('[data-value="sonnet"]').click();
  assert.equal(menu.hidden, true);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(t.selected, [{ model: "sonnet", effort: "low" }]);
  t.dispose();
});

test("a picker is keyboard operable and Escape or an outside press only dismisses it", async () => {
  const t = setup();
  const trigger = t.trigger("思考程度"),
    menu = t.picker("思考程度").querySelector(".gl-picker-menu");
  t.key(trigger, "ArrowDown");
  assert.equal(menu.hidden, false);
  assert.equal(t.window.document.activeElement.dataset.value, "low", "focus starts on the current row");
  t.key(menu, "ArrowDown");
  t.key(menu, "ArrowDown");
  t.key(menu, "Enter");
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(t.selected, [{ model: "haiku", effort: "high" }]);
  assert.equal(menu.hidden, true);
  assert.equal(t.window.document.activeElement, trigger, "focus returns to the trigger");

  trigger.click();
  let escaped = 0;
  t.window.document.addEventListener("keydown", () => escaped++);
  t.key(menu, "Escape");
  assert.equal(menu.hidden, true);
  assert.equal(escaped, 0, "Escape must not also close the card");
  assert.equal(t.selected.length, 1);

  trigger.click();
  t.window.document.body.dispatchEvent(new t.window.Event("pointerdown", { bubbles: true }));
  assert.equal(menu.hidden, true);
  t.dispose();
});

test("a notice sits in the card's flow above the form instead of over the toolbar", () => {
  const t = setup();
  const notice = t.q(".gl-notice");
  assert.ok(notice);
  const order = [...t.q(".gl-chat-card").children];
  assert.ok(order.indexOf(notice) < order.indexOf(t.q(".gl-composer")));
  for (const body of blocks(".gl-notice"))
    assert.doesNotMatch(body, /position:\s*absolute/, "an absolute notice covers the toolbar");
  t.dispose();
});

test("attachment chips ellipsize long names, keep the full name, and leave no gap when empty", () => {
  const t = setup();
  const strip = t.q(".gl-attachments");
  assert.equal(strip.hidden, true, "no strip, so no gap above the text box");
  t.composer.attach({ id: "a", name: long, mediaType: "image/png", data: "aGVsbG8=" });
  assert.equal(strip.hidden, false);
  const chip = strip.querySelector(".gl-attachment-chip");
  assert.equal(chip.title, long);
  const name = blocks(".gl-attachment-name").join(";");
  assert.match(name, /text-overflow:\s*ellipsis/);
  assert.match(name, /white-space:\s*nowrap/);
  assert.match(name, /overflow:\s*hidden/);
  t.composer.remove("a");
  assert.equal(strip.hidden, true);
  t.dispose();
});
