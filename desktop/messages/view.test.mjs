import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createMessageStream } from "./index.mjs";
import { mountMessageBubbles } from "./view.mjs";

let ROW = 80;
const DECK = 200;
const css = readFileSync(new URL("../composer/style.css", import.meta.url), "utf8");
const rule = (selector) =>
  css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

/** jsdom has no layout: give the deck and its bubbles a deterministic one. */
function setup({ openChat } = {}) {
  const { window } = new JSDOM("<body><div id='host'></div></body>", {
    pretendToBeVisual: true,
  });
  window.matchMedia = () => ({ matches: true });
  const previous = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
    abort: globalThis.AbortController,
  };
  // jsdom only accepts its own AbortSignal in addEventListener options.
  globalThis.AbortController = window.AbortController;
  globalThis.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn);
  globalThis.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id);
  const store = createMessageStream({ quietMs: 600_000 });
  const view = mountMessageBubbles(window.document.querySelector("#host"), {
    store,
    openChat,
  });
  const deck = view.element;
  let top = 0;
  Object.defineProperties(deck, {
    clientHeight: { get: () => DECK },
    scrollHeight: { get: () => deck.children.length * ROW },
    scrollTop: {
      get: () => top,
      set: (value) => {
        top = Math.max(0, Math.min(value, deck.scrollHeight - DECK));
      },
    },
  });
  window.Element.prototype.getBoundingClientRect = function () {
    if (this === deck) return { top: 0, bottom: DECK, height: DECK, left: 0, right: 300, width: 300 };
    const index = [...deck.children].indexOf(this);
    const bottom = (index + 1) * ROW - top;
    return { top: bottom - ROW, bottom, height: ROW, left: 0, right: 300, width: 300 };
  };
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
  const scrolled = () => deck.dispatchEvent(new window.Event("scroll"));
  const say = (id, text) => store.accept({ type: "delta", id, text });
  return {
    window,
    store,
    view,
    deck,
    frame,
    scrolled,
    say,
    maxTop: () => deck.scrollHeight - DECK,
    dispose() {
      view.dispose();
      store.dispose();
      globalThis.requestAnimationFrame = previous.request;
      globalThis.cancelAnimationFrame = previous.cancel;
      globalThis.AbortController = previous.abort;
      window.close();
    },
  };
}

test("older bubbles keep full text opacity; age shows only through a shadow and edge variable", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  await t.frame();
  await t.frame();
  const bubbles = [...t.deck.querySelectorAll(".gl-answer-bubble")];
  assert.ok(bubbles.length >= 5);
  for (const bubble of bubbles) {
    assert.equal(bubble.style.opacity, "", "per-node opacity would fade the text");
    const computed = t.window.getComputedStyle(bubble).opacity;
    assert.ok(computed === "" || computed === "1", `computed opacity ${computed}`);
  }
  const ages = bubbles.map((b) => Number(b.style.getPropertyValue("--gl-age")));
  assert.ok(ages.every((n) => n >= 0 && n <= 1));
  assert.ok(ages[0] > ages.at(-1), "the oldest bubble is the most aged");
  assert.equal(ages.at(-1), 0);
  const bubbleRule = rule(".gl-answer-bubble");
  assert.doesNotMatch(bubbleRule, /(^|;|\s)opacity\s*:/, "age must not fade the text in CSS either");
  assert.match(css, /var\(--gl-age/, "CSS must read the age variable for edge and shadow");
  t.dispose();
});

test("the deck hides its native scrollbar and clips with a soft fade", () => {
  const deckRule = rule(".gl-bubble-deck");
  assert.match(deckRule, /scrollbar-width:\s*none/);
  assert.match(css, /\.gl-bubble-deck::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.match(deckRule, /mask-image:\s*linear-gradient/);
  assert.doesNotMatch(deckRule, /scrollbar-width:\s*thin/);
});

test("the deck follows a streaming answer even when content grows faster than scroll events arrive", async () => {
  ROW = 80;
  const t = setup();
  t.say("a", "一。二。三。");
  assert.equal(t.deck.scrollTop, t.maxTop());
  // Browsers deliver scroll events once per frame, after more text has grown.
  t.say("a", "四。五。");
  t.say("a", "六。七。");
  // The event for our own pin lands after layout grew (images, fonts, FLIP
  // transforms): it must not be mistaken for the reader scrolling away.
  ROW = 120;
  t.scrolled();
  t.say("a", "八。");
  assert.equal(t.deck.scrollTop, t.maxTop(), "newest text stays in view");
  t.say("a", "九。");
  t.say("a", "十。");
  assert.equal(t.deck.scrollTop, t.maxTop());
  ROW = 80;
  t.dispose();
});

test("scrolling up stops following and scrolling back to the bottom resumes it", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  t.deck.scrollTop = 0;
  t.scrolled();
  t.say("a", "七。");
  t.say("a", "八。");
  assert.equal(t.deck.scrollTop, 0, "the user's position is respected");
  t.deck.scrollTop = t.maxTop() - 10;
  t.scrolled();
  t.say("a", "九。");
  assert.equal(t.deck.scrollTop, t.maxTop(), "near the bottom follows again");
  t.dispose();
});

test("while the user reads back, text stays at full opacity", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  t.deck.scrollTop = 0;
  t.scrolled();
  await t.frame();
  for (const bubble of t.deck.querySelectorAll(".gl-answer-bubble"))
    assert.equal(bubble.style.opacity, "");
  t.dispose();
});

test("a long answer caps its bubble height and offers 在對話中開啟", async () => {
  const opened = [];
  const t = setup({ openChat: (id) => opened.push(id) });
  const long = "很長的一段說明。".repeat(60);
  t.say("a", long);
  t.store.accept({ type: "done" });
  const [first] = t.deck.querySelectorAll(".gl-answer-bubble");
  Object.defineProperty(first, "scrollHeight", { get: () => 900 });
  Object.defineProperty(first, "clientHeight", { get: () => 168 });
  await t.frame();
  await t.frame();
  assert.equal(first.dataset.clipped, "true");
  const link = [...t.deck.querySelectorAll("button")].find((b) => b.textContent === "在對話中開啟");
  assert.ok(link, "an open-in-chat bubble ends the answer");
  assert.equal(t.deck.lastElementChild.contains(link), true);
  first.click();
  assert.deepEqual(opened, ["a"], "a clipped bubble opens the full answer in the chat");
  const cap = rule(".gl-answer-bubble").match(/max-height:\s*(\d+)px/);
  assert.ok(cap && Number(cap[1]) <= 200, "bubble height has a fixed cap");
  t.dispose();
});

test("a short bubble is never marked clipped", async () => {
  const t = setup();
  t.say("a", "很短。");
  t.store.accept({ type: "done" });
  await t.frame();
  await t.frame();
  assert.notEqual(t.deck.querySelector(".gl-answer-bubble").dataset.clipped, "true");
  t.dispose();
});

test("the 簡答 label explains where the full answer lives", async () => {
  const t = setup();
  t.say("a", "**簡答：** 這是一張截圖。\n\n- 要點一\n- 要點二");
  t.store.accept({ type: "done" });
  const tag = t.deck.querySelector(".gl-summary-tag");
  assert.ok(tag);
  assert.match(tag.getAttribute("title"), /對話/);
  assert.equal(tag.textContent.replace(/[：:]$/, ""), "簡答");
  t.dispose();
});
