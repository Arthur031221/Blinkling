import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createComposer } from "./index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { mountComposer } from "./view.mjs";
import { translator } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";

/** Every view test runs in English and in Traditional Chinese. */
const locales = ["en", "zh-TW"];
const each = (name, run) => {
  for (const locale of locales)
    test(`${name} [${locale}]`, (ctx) => run(locale, ctx));
};

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const blocks = (selector) =>
  [...css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)]
    .filter((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim())
        .includes(selector),
    )
    .map((m) => m[2]);
const efforts = ["low", "medium", "high", "xhigh", "max"];
const long =
  "非常長的檔案名稱-screenshot-with-a-very-long-name-スクリーンショット.png";

function setup({
  selection = { model: "haiku", effort: "low" },
  locale = "en",
  ...hooks
} = {}) {
  const dom = new JSDOM("<body><div id='host'></div></body>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const previous = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  const selected = [],
    sent = [];
  let listener;
  const session = {
    send: async (turn) => {
      sent.push(turn);
    },
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
  const view = mountComposer(host, { composer, store, locale, ...hooks });
  const tr = translator(strings, locale);
  const q = (s) => host.querySelector(s);
  const picker = (label) =>
    [...host.querySelectorAll(".gl-picker")].find(
      (p) =>
        p.querySelector(".gl-picker-menu").getAttribute("aria-label") === label,
    );
  const options = (label) =>
    [...picker(label).querySelectorAll(".gl-picker-option")].map(
      (o) => o.dataset.value,
    );
  return {
    window,
    host,
    tr,
    view,
    store,
    q,
    picker,
    options,
    composer,
    selected,
    sent,
    emit: (e) => listener(e),
    trigger: (label) => picker(label).querySelector(".gl-picker-trigger"),
    key: (el, key) =>
      el.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      ),
    dispose() {
      view.dispose();
      composer.dispose();
      store.dispose();
      globalThis.AbortController = previous;
      window.close();
    },
  };
}

each(
  "the model and effort pickers are Blink popovers: no native select, no blank entry",
  (locale) => {
    const t = setup({ locale });
    assert.equal(t.host.querySelectorAll("select, option").length, 0);
    assert.deepEqual(t.options(t.tr("model")), ["opus", "sonnet", "haiku"]);
    assert.deepEqual(t.options(t.tr("effort")), efforts);
    for (const option of t.host.querySelectorAll(".gl-picker-option"))
      assert.notEqual(option.textContent.trim(), "");
    assert.equal(t.trigger(t.tr("model")).textContent, "Haiku");
    assert.equal(t.trigger(t.tr("effort")).textContent, t.tr("effort-low"));
    t.dispose();
  },
);

each(
  "before a selection exists the trigger names its job and cannot open",
  (locale) => {
    const t = setup({ selection: null, locale });
    assert.equal(t.trigger(t.tr("model")).textContent, t.tr("model"));
    assert.equal(t.trigger(t.tr("model")).disabled, true);
    t.dispose();
  },
);

each(
  "applied selections never add duplicates, however many answers arrive",
  (locale) => {
    const t = setup({ locale });
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
    assert.deepEqual(t.options(t.tr("model")), ["opus", "sonnet", "haiku"]);
    assert.deepEqual(t.options(t.tr("effort")), efforts);
    t.emit({
      type: "selection",
      applied: { model: "claude-opus-5-5-20260101", effort: "high" },
    });
    assert.equal(t.trigger(t.tr("model")).textContent, "Opus 5.5");
    t.emit({
      type: "selection",
      applied: { model: "mystery-model", effort: "xhigh" },
    });
    t.emit({
      type: "selection",
      applied: { model: "mystery-model", effort: "xhigh" },
    });
    assert.deepEqual(t.options(t.tr("model")), [
      "opus",
      "sonnet",
      "haiku",
      "mystery-model",
    ]);
    assert.equal(
      t.options(t.tr("effort")).filter((v) => v === "xhigh").length,
      1,
    );
    t.dispose();
  },
);

each(
  "a picker opens, chooses with the pointer, and reports the selection",
  async (locale) => {
    const t = setup({ locale });
    const trigger = t.trigger(t.tr("model")),
      menu = t.picker(t.tr("model")).querySelector(".gl-picker-menu");
    assert.equal(menu.hidden, true);
    trigger.click();
    assert.equal(menu.hidden, false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    t.picker(t.tr("model")).querySelector('[data-value="sonnet"]').click();
    assert.equal(menu.hidden, true);
    await new Promise((r) => setTimeout(r));
    assert.deepEqual(t.selected, [
      { model: "sonnet", effort: "low", permissionMode: "default" },
    ]);
    t.dispose();
  },
);

each(
  "the permission mode offers ask first and plan, and a pick keeps the other lists",
  async (locale) => {
    const t = setup({ locale });
    const menu = t.picker(t.tr("permission")).querySelector(".gl-picker-menu");
    assert.deepEqual(
      [...menu.querySelectorAll("[data-value]")].map((n) => n.dataset.value),
      ["default", "plan"],
    );
    assert.equal(
      t
        .trigger(t.tr("permission"))
        .textContent.includes(t.tr("permission-default")),
      true,
    );
    t.trigger(t.tr("permission")).click();
    menu.querySelector('[data-value="plan"]').click();
    await new Promise((r) => setTimeout(r));
    assert.deepEqual(t.selected, [
      { model: "haiku", effort: "low", permissionMode: "plan" },
    ]);
    t.dispose();
  },
);

each(
  "a picker is keyboard operable and Escape or an outside press only dismisses it",
  async (locale) => {
    const t = setup({ locale });
    const trigger = t.trigger(t.tr("effort")),
      menu = t.picker(t.tr("effort")).querySelector(".gl-picker-menu");
    t.key(trigger, "ArrowDown");
    assert.equal(menu.hidden, false);
    assert.equal(
      t.window.document.activeElement.dataset.value,
      "low",
      "focus starts on the current row",
    );
    t.key(menu, "ArrowDown");
    t.key(menu, "ArrowDown");
    t.key(menu, "Enter");
    await new Promise((r) => setTimeout(r));
    assert.deepEqual(t.selected, [
      { model: "haiku", effort: "high", permissionMode: "default" },
    ]);
    assert.equal(menu.hidden, true);
    assert.equal(
      t.window.document.activeElement,
      trigger,
      "focus returns to the trigger",
    );

    trigger.click();
    let escaped = 0;
    t.window.document.addEventListener("keydown", () => escaped++);
    t.key(menu, "Escape");
    assert.equal(menu.hidden, true);
    assert.equal(escaped, 0, "Escape must not also close the card");
    assert.equal(t.selected.length, 1);

    trigger.click();
    t.window.document.body.dispatchEvent(
      new t.window.Event("pointerdown", { bubbles: true }),
    );
    assert.equal(menu.hidden, true);
    t.dispose();
  },
);

each(
  "a notice sits in the card's flow above the form instead of over the toolbar",
  (locale) => {
    const t = setup({ locale });
    const notice = t.q(".gl-notice");
    assert.ok(notice);
    const order = [...t.q(".gl-chat-card").children];
    assert.ok(order.indexOf(notice) < order.indexOf(t.q(".gl-composer")));
    for (const body of blocks(".gl-notice"))
      assert.doesNotMatch(
        body,
        /position:\s*absolute/,
        "an absolute notice covers the toolbar",
      );
    t.dispose();
  },
);

each(
  "attachment chips ellipsize long names, keep the full name, and leave no gap when empty",
  (locale) => {
    const t = setup({ locale });
    const strip = t.q(".gl-attachments");
    assert.equal(strip.hidden, true, "no strip, so no gap above the text box");
    t.composer.attach({
      id: "a",
      name: long,
      mediaType: "image/png",
      data: "aGVsbG8=",
    });
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
  },
);

const dotOf = (t) => t.q(".gl-status-dot");

each(
  "no dot while starting or connected; a dot only when something is wrong",
  (locale) => {
    const t = setup({ locale });
    const status = (state) => t.store.accept({ type: "status", state });
    assert.equal(dotOf(t).hidden, true, "nothing to report before a status");
    status("starting");
    assert.equal(dotOf(t).hidden, true);
    status("connected");
    assert.equal(
      dotOf(t).hidden,
      true,
      "connected is the normal state: no dot",
    );
    const wrong = {
      retrying: "status-retrying",
      blocked: "status-blocked",
      disconnected: "status-disconnected",
    };
    for (const [state, key] of Object.entries(wrong)) {
      status(state);
      assert.equal(dotOf(t).hidden, false, `${state} shows the dot`);
      assert.equal(dotOf(t).dataset.state, state);
      assert.equal(dotOf(t).getAttribute("aria-label"), t.tr(key));
      status("connected");
      assert.equal(
        dotOf(t).hidden,
        true,
        `connected hides it again after ${state}`,
      );
    }
    t.dispose();
  },
);

each(
  "model labels come from one function for the list and the selected value",
  (locale) => {
    const t = setup({
      locale,
      selection: { model: "claude-opus-5-5-20260101", effort: "max" },
    });
    const model = t.tr("model");
    assert.equal(t.trigger(model).textContent, "Opus 5.5");
    const rows = () =>
      Object.fromEntries(
        [...t.picker(model).querySelectorAll(".gl-picker-option")].map((o) => [
          o.dataset.value,
          o.textContent,
        ]),
      );
    assert.equal(
      rows().opus,
      t.trigger(model).textContent,
      "list row and value agree",
    );
    t.emit({
      type: "selection",
      applied: { model: "claude-sonnet-5-5", effort: "high" },
    });
    assert.equal(t.trigger(model).textContent, rows().sonnet);
    assert.equal(rows().sonnet, "Sonnet 5.5");
    assert.equal(rows().haiku, "Haiku", "an unknown version is not invented");
    t.emit({
      type: "selection",
      applied: { model: "claude-opus-4-1-20250805", effort: "low" },
    });
    assert.equal(t.trigger(model).textContent, "Opus 4.1");
    t.dispose();
  },
);

each(
  "effort offers low, medium, high, xhigh and max in the viewer's language",
  (locale) => {
    const t = setup({ locale, selection: { model: "haiku", effort: "xhigh" } });
    const picker = t.picker(t.tr("effort"));
    assert.deepEqual(t.options(t.tr("effort")), efforts);
    assert.deepEqual(
      [...picker.querySelectorAll(".gl-picker-option")].map(
        (o) => o.textContent,
      ),
      efforts.map((id) => t.tr(`effort-${id}`)),
    );
    assert.equal(t.trigger(t.tr("effort")).textContent, t.tr("effort-xhigh"));
    t.dispose();
  },
);

each("every visible word of the card comes from the locale table", (locale) => {
  const t = setup({ locale });
  const card = t.q(".gl-chat-card");
  assert.equal(card.getAttribute("aria-label"), t.tr("card"));
  assert.equal(t.q(".gl-input").placeholder, t.tr("placeholder"));
  assert.equal(t.q(".gl-input").getAttribute("aria-label"), t.tr("input"));
  assert.equal(
    card.querySelector('[aria-label="' + t.tr("pin") + '"]') !== null,
    true,
  );
  assert.equal(
    card.querySelector('[aria-label="' + t.tr("close") + '"]') !== null,
    true,
  );
  assert.equal(
    card.querySelector('[aria-label="' + t.tr("add") + '"]') !== null,
    true,
  );
  assert.deepEqual(
    [...t.host.querySelectorAll(".gl-quick-chip")].map((b) => b.textContent),
    ["quick-what", "quick-translate", "quick-summary"].map((k) => t.tr(k)),
  );
  t.dispose();
});

each(
  "a quick ask sends the question in the viewer's language",
  async (locale) => {
    const t = setup({ locale });
    t.composer.capture({
      image: {
        id: "i",
        name: "s.png",
        mediaType: "image/png",
        data: "aGVsbG8=",
      },
    });
    const chip = t.host.querySelector(".gl-quick-chip");
    chip.click();
    await new Promise((r) => setTimeout(r));
    assert.equal(t.sent.at(-1).text, t.tr("quick-what"));
    assert.equal(t.sent.at(-1).source, "quick-ask");
    t.dispose();
  },
);

each("failures are shown translated, whatever raised them", (locale) => {
  const t = setup({ locale });
  const shown = () => t.q(".gl-composer-error");
  t.composer.error("send-failed");
  assert.equal(shown().textContent, t.tr("error-send-failed"));
  assert.equal(shown().hidden, false);
  t.composer.error("");
  assert.equal(shown().hidden, true);
  t.composer.attach({
    id: "a",
    name: "a.png",
    mediaType: "image/png",
    data: "aGVsbG8=",
  });
  void t.view.files([
    { name: "x.exe", type: "application/x-msdownload", size: 1 },
  ]);
  return new Promise((resolve) =>
    setTimeout(() => {
      assert.equal(shown().textContent, t.tr("error-unsupported-file"));
      t.dispose();
      resolve();
    }),
  );
});

each(
  "Escape closes the open list first and the card second, wherever focus is",
  (locale) => {
    const closed = [];
    const u = setup({ locale, onClose: () => closed.push(1) });
    const trigger = u.trigger(u.tr("model")),
      menu = u.picker(u.tr("model")).querySelector(".gl-picker-menu");
    trigger.click();
    u.q(".gl-input").focus();
    assert.equal(
      menu.hidden,
      false,
      "the list is open while focus is in the text box",
    );
    assert.equal(u.view.escape(), true);
    assert.equal(menu.hidden, true, "the first Escape closes the list only");
    assert.equal(u.view.isOpen(), true);
    assert.equal(
      u.window.document.activeElement,
      u.q(".gl-input"),
      "focus stays in the text box",
    );
    assert.equal(closed.length, 0);
    assert.equal(u.view.escape(), true);
    assert.equal(u.view.isOpen(), false, "the second Escape closes the card");
    assert.equal(closed.length, 1);
    u.dispose();
  },
);

each(
  "Escape inside the open list returns focus to its trigger and keeps the card",
  (locale) => {
    const t = setup({ locale });
    const trigger = t.trigger(t.tr("effort"));
    trigger.click();
    assert.equal(t.window.document.activeElement.className, "gl-picker-option");
    assert.equal(t.view.escape(), true);
    assert.equal(t.window.document.activeElement, trigger);
    assert.equal(t.view.isOpen(), true);
    t.dispose();
  },
);

each(
  "the card reports the pointer on it so the shell never closes it underneath",
  (locale) => {
    const holds = [];
    const t = setup({ locale, onHold: (hold) => holds.push(hold) });
    const card = t.q(".gl-chat-card");
    card.dispatchEvent(new t.window.MouseEvent("mouseenter"));
    assert.equal(holds.at(-1).pointer, true);
    card.dispatchEvent(new t.window.MouseEvent("mouseleave"));
    assert.equal(holds.at(-1).pointer, false);
    t.dispose();
  },
);

each(
  "unpinning only reports the pin; the shell decides whether the card closes",
  (locale) => {
    const events = [];
    const t = setup({
      locale,
      onPin: (value) => events.push(["pin", value]),
      onClose: () => events.push(["close"]),
    });
    const pin = t.q(`[aria-label="${t.tr("pin")}"]`);
    pin.click();
    pin.click();
    assert.deepEqual(events, [
      ["pin", true],
      ["pin", false],
    ]);
    assert.equal(t.view.isOpen(), true);
    t.dispose();
  },
);

test("attachment chips are wrapping tiles with real thumbnails, never an inner scroll", () => {
  const props = (selector) =>
    Object.fromEntries(
      blocks(selector)
        .flatMap((body) => body.split(";"))
        .map((d) => d.split(":").map((s) => s.trim()))
        .filter(([k, v]) => k && v),
    );
  const strip = props(".gl-attachments");
  assert.equal(strip["flex-wrap"], "wrap");
  for (const key of ["max-height", "overflow", "overflow-y"])
    assert.equal(key in strip, false, `.gl-attachments must not set ${key}`);
  const thumb = props(".gl-attachment-chip .gl-message-image");
  assert.ok(
    parseInt(props(".gl-attachment-chip .gl-file-icon").height, 10) >= 48,
  );
  assert.ok(
    parseInt(props(".gl-attachment-chip .gl-file-icon").height, 10) >= 48,
  );
  assert.equal(thumb["object-fit"], "cover");
  assert.doesNotMatch(css, /image-rendering/);
});

each(
  "the thinking indicator shows while Claude works and gives way to the text",
  (locale) => {
    const t = setup({ locale });
    t.view.open();
    assert.equal(
      t.q(".gl-thinking") === null || t.q(".gl-thinking").hidden,
      true,
    );
    t.store.accept({ type: "sending", seeing: false });
    const dots = t.q(".gl-thinking");
    assert.ok(dots, "the indicator exists");
    assert.equal(dots.hidden, false);
    assert.equal(dots.querySelectorAll(".gl-dots i").length, 3);
    assert.equal(dots.getAttribute("aria-label"), t.tr("working"));
    assert.match(dots.querySelector(".gl-think-word").textContent, /^[A-Z]/);
    t.store.accept({ type: "delta", id: "a", text: "Hello there." });
    assert.equal(t.q(".gl-thinking").hidden, true);
    assert.match(t.q(".gl-chat-history").textContent, /Hello there/);
    t.dispose();
  },
);

each("opening the card scrolls the history to the newest message", (locale) => {
  const t = setup({ locale });
  const history = t.q(".gl-chat-history");
  Object.defineProperty(history, "scrollHeight", { value: 900 });
  t.view.close();
  history.scrollTop = 0;
  t.view.open();
  assert.equal(history.scrollTop, 900);
  history.scrollTop = 10;
  t.view.open();
  assert.equal(history.scrollTop, 10, "a refocus keeps the reader's place");
  t.view.close();
  t.view.open();
  assert.equal(history.scrollTop, 900);
  t.dispose();
});

test("the message list ends above the composer and bubbles are tinted in both themes", () => {
  const history = blocks(".gl-chat-history").join(";");
  assert.match(history, /overflow-y:\s*auto/);
  assert.match(history, /padding:\s*\d+px \d+px 1\d+px/);
  assert.match(history, /mask-image/);
  const user = blocks(".gl-user").join(";");
  assert.match(user, /color-mix\(in srgb, var\(--green\)/);
  assert.match(user, /align-self:\s*flex-end/);
  assert.match(blocks(".gl-assistant").join(";"), /align-self:\s*flex-start/);
  assert.doesNotMatch(
    user,
    /#[0-9a-f]{3,6}\b|rgb\(/i,
    "tokens only, so both themes follow",
  );
});
