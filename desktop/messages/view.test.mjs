import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createMessageStream } from "./index.mjs";
import { mountMessageBubbles } from "./view.mjs";
import { translatorFor } from "./strings.mjs";

let ROW = 80;
const DECK = 200;
const css = readFileSync(new URL("./deck.css", import.meta.url), "utf8");
const rule = (selector) =>
  css.match(
    new RegExp(
      `(?:^|\\n)${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    ),
  )?.[1] ?? "";

/** jsdom has no layout: give the deck and its bubbles a deterministic one. */
function setup({
  openChat,
  onAction,
  locale = "zh-TW",
  onShape,
  onReference,
} = {}) {
  const clock = { now: 100_000 };
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
    onAction,
    onShape,
    onReference,
    t: translatorFor(window.document, locale),
    now: () => clock.now,
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
    if (this === deck)
      return {
        top: 0,
        bottom: DECK,
        height: DECK,
        left: 0,
        right: 300,
        width: 300,
      };
    const index = [...deck.children].indexOf(this);
    const bottom = this.sliding ? DECK : (index + 1) * ROW - top;
    return {
      top: bottom - ROW,
      bottom,
      height: ROW,
      left: 0,
      right: 300,
      width: 300,
    };
  };
  // Layout position is independent of scrolling and of transforms.
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetTop: {
      configurable: true,
      get() {
        return [...deck.children].indexOf(this) * ROW;
      },
    },
    offsetHeight: { configurable: true, get: () => ROW },
  });
  const frame = () =>
    new Promise((resolve) => window.requestAnimationFrame(resolve));
  const scrolled = () => deck.dispatchEvent(new window.Event("scroll"));
  const say = (id, text) => store.accept({ type: "delta", id, text });
  return {
    window,
    clock,
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

test("a whole answer arriving at once fades its older bubbles, wherever they were drawn before", async () => {
  const t = setup();
  t.window.matchMedia = () => ({ matches: false }); // motion is on
  // A slide starts where the bubble was drawn before: at the bottom of the deck,
  // right where the newest bubble is now.
  t.window.HTMLElement.prototype.animate = function (frames) {
    if (/translateY/.test(frames[0].transform ?? "")) this.sliding = true;
    return { cancel() {}, addEventListener() {} };
  };
  t.say("older", "Earlier answer。");
  await t.frame();
  // The earlier bubble was the newest one; the next event moves it far up.
  t.say("current", "一。二。三。四。五。六。");
  await t.frame();
  await t.frame();
  const first = t.deck.querySelector(".gl-answer-bubble");
  assert.match(first.textContent, /Earlier answer/);
  assert.ok(first.sliding, "the bubble was sliding");
  assert.ok(
    Number(first.style.opacity || 1) < 1,
    "the earlier bubble fades by its layout distance, not its mid-slide rect",
  );
  t.dispose();
});

test("older bubbles fade by opacity alone with their distance from the newest", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  await t.frame();
  await t.frame();
  const bubbles = [...t.deck.querySelectorAll(".gl-answer-bubble")];
  assert.ok(bubbles.length >= 5);
  const opacity = bubbles.map((b) => Number(b.style.opacity || 1));
  assert.equal(opacity.at(-1), 1, "the newest bubble is fully opaque");
  for (let i = 1; i < opacity.length; i++)
    assert.ok(
      opacity[i - 1] <= opacity[i],
      `bubble ${i - 1} is not fainter than ${i}`,
    );
  assert.ok(opacity.at(-3) < opacity.at(-2) && opacity.at(-2) < opacity.at(-1));
  assert.ok(opacity[0] >= 0.3, "the oldest stays readable");
  for (const bubble of bubbles) {
    assert.equal(
      bubble.style.getPropertyValue("--gl-age"),
      "",
      "no age shadow",
    );
    assert.equal(bubble.style.transform, "", "fading never moves or scales");
  }
  assert.match(css, /background:\s*var\(--surface\)/, "an opaque surface");
  assert.doesNotMatch(
    css,
    /color-mix|rgba|#[0-9a-fA-F]{6}\b/,
    "no translucent or literal colors",
  );
  t.dispose();
});

test("the deck hides its native scrollbar and clips with a soft fade", () => {
  const deckRule = rule(".gl-bubble-deck");
  assert.match(deckRule, /scrollbar-width:\s*none/);
  assert.match(
    css,
    /\.gl-bubble-deck::-webkit-scrollbar\s*\{[^}]*display:\s*none/,
  );
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
  const link = [...t.deck.querySelectorAll("button")].find(
    (b) => b.textContent === "在對話中開啟",
  );
  assert.ok(link, "an open-in-chat bubble ends the answer");
  assert.equal(t.deck.lastElementChild.contains(link), true);
  first.click();
  assert.deepEqual(
    opened,
    ["a"],
    "a clipped bubble opens the full answer in the chat",
  );
  const cap = rule(".gl-answer-bubble").match(/max-height:\s*(\d+)px/);
  assert.ok(cap && Number(cap[1]) <= 200, "bubble height has a fixed cap");
  t.dispose();
});

test("an offer bubble is a quiet button that runs its action, in the bubble look", () => {
  const ran = [];
  const t = setup({ onAction: (a) => ran.push(a) });
  t.store.accept({
    type: "blink-offer",
    id: "o",
    label: "儲存導覽",
    action: "save-guide",
  });
  const bubble = t.deck.querySelector(".gl-answer-bubble");
  assert.equal(bubble.dataset.kind, "offer");
  const button = bubble.querySelector("button");
  assert.equal(button.textContent, "儲存導覽");
  button.click();
  assert.deepEqual(ran, ["save-guide"]);
  bubble.click();
  assert.deepEqual(ran, ["save-guide"], "only the button acts");
  assert.equal(
    t.deck.querySelectorAll(".gl-answer-bubble").length,
    1,
    "one bubble",
  );
  t.dispose();
});

test("a short bubble is never marked clipped", async () => {
  const t = setup();
  t.say("a", "很短。");
  t.store.accept({ type: "done" });
  await t.frame();
  await t.frame();
  assert.notEqual(
    t.deck.querySelector(".gl-answer-bubble").dataset.clipped,
    "true",
  );
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

test("a new bubble is pinned in view unless the reader scrolled up a moment ago", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  t.deck.scrollTop = 0;
  t.scrolled();
  t.clock.now += 3000;
  t.say("a", "七。");
  assert.equal(
    t.deck.scrollTop,
    0,
    "within the reading window the position holds",
  );
  t.clock.now += 1500;
  t.say("a", "八。");
  assert.equal(
    t.deck.scrollTop,
    t.maxTop(),
    "after it, the newest comes into view",
  );
  t.dispose();
});

test("an auto-explain answer arriving after reading back is shown at once", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  t.store.accept({ type: "done", turnId: "t1" });
  t.deck.scrollTop = 0;
  t.scrolled();
  t.clock.now += 20_000;
  t.store.accept({
    type: "message",
    id: "explain",
    role: "assistant",
    content: [{ type: "text", text: "這是自動解說。" }],
  });
  assert.equal(t.deck.scrollTop, t.maxTop());
  t.dispose();
});

test("repeated pointer hover does not undo the reader's scroll position", async () => {
  const t = setup();
  t.say("a", "一。二。三。四。五。六。");
  t.deck.scrollTop = 0;
  t.scrolled();
  for (let i = 0; i < 30; i++) t.store.hover(true, "blink");
  assert.equal(t.deck.scrollTop, 0);
  t.dispose();
});

test("the click-through shape is solid while scrolling and per bubble when still", async () => {
  const shapes = [];
  const t = setup({ onShape: () => shapes.push(t.view.regions()) });
  t.say("a", "一。二。三。四。五。六。");
  await t.frame();
  await t.frame();
  const still = t.view.regions();
  assert.equal(still.length, 3, "bubbles scrolled out of the deck drop out");
  assert.ok(still.every((r) => r.y + r.height <= 200 && r.y >= 0));
  t.deck.dispatchEvent(new t.window.Event("wheel"));
  const solid = t.view.regions();
  assert.deepEqual(solid, [{ x: 0, y: 0, width: 300, height: 200 }]);
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(
    t.view.regions().length,
    still.length,
    "back to bubbles after the scroll settles",
  );
  t.dispose();
});

test("a hidden deck has no shape at all", async () => {
  const t = setup();
  t.say("a", "一。");
  t.store.accept({ type: "done", turnId: "t" });
  t.store.leaveDisplay();
  assert.equal(t.deck.dataset.visible, "false");
  assert.deepEqual(t.view.regions(), []);
  t.dispose();
});

test("deck strings follow the system language", async () => {
  const t = setup({ locale: "de" });
  t.say("a", "Eins.");
  assert.equal(t.deck.getAttribute("aria-label"), "Antworten von Blink");
  t.store.accept({
    type: "message",
    id: "long",
    role: "assistant",
    content: [{ type: "text", text: "Satz. ".repeat(12) }],
  });
  assert.ok(
    [...t.deck.querySelectorAll("button")].some(
      (b) => b.textContent === "Im Chat öffnen",
    ),
  );
  t.dispose();
});

test("reference badges show the number, report hover and scroll their bubble into view", async () => {
  const hovers = [];
  const t = setup({ locale: "en", onReference: (e) => hovers.push(e.ref) });
  t.say(
    "a",
    "Press Buy [[1:e42|Buy button]]. Then wait. Then wait. Then wait. Then wait. Then wait.",
  );
  const badge = t.deck.querySelector(".gl-ref");
  assert.equal(badge.textContent, "1");
  assert.doesNotMatch(t.deck.textContent, /e42/);
  badge.dispatchEvent(new t.window.MouseEvent("mouseover", { bubbles: true }));
  badge.dispatchEvent(new t.window.MouseEvent("mouseout", { bubbles: true }));
  assert.deepEqual(hovers, ["e42", null]);
  t.deck.scrollTop = t.maxTop();
  t.scrolled();
  const bubble = badge.closest(".gl-answer-bubble");
  assert.equal(t.view.reveal("missing"), false);
  assert.equal(t.view.reveal("e42"), true);
  const index = [...t.deck.children].indexOf(bubble);
  assert.ok(
    index * ROW - t.deck.scrollTop >= 0 &&
      (index + 1) * ROW - t.deck.scrollTop <= 200,
    "the bubble with the badge is fully inside the deck",
  );
  t.dispose();
});

test("the deck keeps clear of the fan when a menu rectangle is given", async () => {
  const t = setup();
  t.say("a", "一。");
  const host = t.deck.parentElement;
  host.getBoundingClientRect = () => ({
    left: 0,
    right: 300,
    top: 0,
    bottom: 400,
    width: 300,
    height: 400,
  });
  t.view.avoid({ x: 200, y: 340, width: 90, height: 90 });
  assert.equal(host.style.getPropertyValue("--gl-clear"), "60px");
  t.view.avoid(null);
  assert.equal(host.style.getPropertyValue("--gl-clear"), "0px");
  t.view.avoid({ x: 500, y: 340, width: 90, height: 90 });
  assert.equal(
    host.style.getPropertyValue("--gl-clear"),
    "0px",
    "a fan elsewhere changes nothing",
  );
  t.dispose();
});

test("the deck's own files hold no timing, easing or color literals", () => {
  for (const file of [
    "deck.css",
    "view.mjs",
    "render.mjs",
    "calm.mjs",
    "index.mjs",
    "parts.mjs",
  ]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /(transition|animation)[^;]*[0-9.]+m?s\b|duration: *[0-9]|frequency *= *[0-9]|#[0-9a-fA-F]{6}\b/,
      file,
    );
  }
});
