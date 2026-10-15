import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { duration } from "../shared/motion.mjs";
import { mountPickAnimation } from "./teach.mjs";

// A just-enough document: elements that record their style, children and animations.
function fakeDocument() {
  const animations = [];
  const make = () => {
    const el = {
      style: {},
      children: [],
      className: "",
      textContent: "",
      removed: false,
      append(child) {
        this.children.push(child);
      },
      remove() {
        this.removed = true;
      },
      animate(keyframes, options) {
        const animation = { keyframes, options, cancelled: false };
        animation.cancel = () => {
          animation.cancelled = true;
          animation.reject?.(new Error("cancelled"));
        };
        // Playing: finish almost at once so the loop advances.
        animation.finished = new Promise((resolve, reject) => {
          animation.reject = reject;
          setTimeout(resolve, 1);
        });
        animations.push(animation);
        return animation;
      },
    };
    return el;
  };
  const doc = { createElement: make };
  const container = Object.assign(make(), { ownerDocument: doc });
  return { container, animations };
}

const nextTick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

test("the animation only moves transform and opacity, with token durations", async () => {
  const { container, animations } = fakeDocument();
  const handle = mountPickAnimation(container, { locale: "en" });
  await nextTick(300);
  handle.dispose();
  assert.ok(animations.length > 3);
  const allowed = new Set(["opacity", "transform", "offset", "easing", "composite"]);
  const tokens = new Set([...Object.values(duration)]);
  for (const a of animations) {
    for (const frame of a.keyframes)
      for (const property of Object.keys(frame)) assert.ok(allowed.has(property), property);
    assert.ok(tokens.has(a.options.duration), `duration ${a.options.duration}`);
  }
});

test("dispose removes it and cancels what is running", async () => {
  const { container, animations } = fakeDocument();
  const handle = mountPickAnimation(container, { locale: "en" });
  await nextTick(40);
  const root = container.children[0];
  handle.dispose();
  assert.equal(root.removed, true);
  const count = animations.length;
  await nextTick(150);
  assert.equal(animations.length, count);
});

test("reduced motion shows the finished frame with one short fade and no loop", async () => {
  const { container, animations } = fakeDocument();
  const handle = mountPickAnimation(container, { reducedMotion: true, locale: "en" });
  await nextTick(150);
  assert.equal(animations.length, 1);
  assert.equal(animations[0].options.duration, duration.fast);
  handle.dispose();
});

test("the caption is the hint in the user's language", () => {
  const { container } = fakeDocument();
  const handle = mountPickAnimation(container, { reducedMotion: true, locale: "ja" });
  const root = container.children[0];
  const caption = root.children.at(-1);
  assert.equal(caption.textContent, "一度クリックするだけで質問できます");
  handle.dispose();
});
