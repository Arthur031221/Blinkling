import test from "node:test";
import assert from "node:assert/strict";
import { timing } from "../shared/motion.mjs";
import { WORDS, wordAt, mountThinking } from "./thinking.mjs";

const fakeDocument = () => {
  const make = (tag) => ({
    tag,
    className: "",
    hidden: false,
    textContent: "",
    attributes: {},
    children: [],
    ownerDocument: null,
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    append(...n) {
      this.children.push(...n);
    },
    remove() {
      this.removed = true;
    },
  });
  const doc = { createElement: make };
  const host = make("div");
  host.ownerDocument = doc;
  return { doc, host };
};

test("the word changes every interval and wraps around", () => {
  assert.equal(wordAt(0), "Thinking");
  assert.equal(wordAt(timing.thinkWord - 1), "Thinking");
  assert.equal(wordAt(timing.thinkWord), "Pondering");
  assert.equal(wordAt(timing.thinkWord * WORDS.length), "Thinking");
  assert.ok(WORDS.every((w) => /ing\b/.test(w)));
});

test("a turn with a picture starts on reading the screen", () => {
  assert.equal(wordAt(0, { seeing: true }), "Reading the screen");
  assert.equal(wordAt(timing.thinkWord, { seeing: true }), "Working it out");
});

test("the indicator shows with dots and a word, and stops cleanly", () => {
  const { host } = fakeDocument();
  let t = 0,
    ticks = null,
    cleared = 0;
  const think = mountThinking(host, {
    label: "Blink is working",
    now: () => t,
    schedule: (fn) => ((ticks = fn), 7),
    cancel: () => cleared++,
  });
  const root = host.children[0];
  assert.equal(root.hidden, true);
  assert.equal(root.attributes.role, "status");
  assert.equal(root.attributes["aria-label"], "Blink is working");
  think.start();
  assert.equal(root.hidden, false);
  assert.equal(root.children[0].children.length, 3);
  assert.equal(root.children[1].textContent, "Thinking");
  t = timing.thinkWord + 100;
  ticks();
  assert.equal(root.children[1].textContent, "Pondering");
  think.start();
  assert.equal(cleared, 0, "a second start keeps the same timer");
  think.stop();
  assert.equal(root.hidden, true);
  assert.equal(cleared, 1);
  think.stop();
  assert.equal(cleared, 1);
});
