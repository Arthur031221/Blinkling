import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { mountGuidePanel } from "./guide-panel.mjs";

const labels = {
  "guide-thinking": "Reading the screen",
  "guide-back": "Back",
  "guide-next": "Next",
  "guide-done": "Done",
  "guide-overview": "Overview",
  "guide-dismiss": "End",
  "guide-retry": "Try again",
  "guide-close": "Close",
  "guide-start": "Start",
  "guide-step": "Step {n} of {total}",
};
const rig = () => {
  const { document } = new JSDOM("<section></section>").window;
  const host = document.querySelector("section");
  const actions = [];
  const panel = mountGuidePanel({
    host,
    tr: (key, v = {}) => labels[key].replace(/\{(\w+)\}/g, (_, k) => v[k]),
    onAction: (action) => actions.push(action),
  });
  return { host, panel, actions };
};
const step = (extra = {}) => ({
  type: "guide",
  phase: "step",
  bubbles: ["Click Save"],
  canBack: false,
  canNext: true,
  ...extra,
});

test("a repeated event leaves the pill where it is, so it does not enter again", () => {
  const { host, panel } = rig();
  panel.update({ type: "guide", phase: "thinking" });
  const pill = host.querySelector(".gl-answer-bubble");
  assert.equal(pill.textContent, "Reading the screen");
  panel.update({ type: "guide", phase: "thinking" });
  assert.equal(host.querySelector(".gl-answer-bubble"), pill);
  assert.equal(host.children.length, 2, "the line and the End button");
});

const finished = (extra) => ({ type: "guide", phase: "finished", ...extra });
test("a changed text updates the same pill and a new one is added after it", () => {
  const { host, panel } = rig();
  panel.update(finished({ bubbles: ["Click Save"] }));
  const [first] = host.querySelectorAll(".gl-answer-bubble");
  panel.update(finished({ bubbles: ["Click Save now", "Then close"] }));
  const pills = [...host.querySelectorAll(".gl-answer-bubble")];
  assert.equal(pills[0], first);
  assert.deepEqual(
    pills.map((p) => p.textContent),
    ["Click Save now", "Then close"],
  );
  panel.update(finished({ bubbles: ["Click Save"] }));
  assert.equal(host.querySelectorAll(".gl-answer-bubble").length, 1);
});

test("the buttons keep their nodes between steps and follow canBack and last", () => {
  const { host, panel, actions } = rig();
  panel.update(step());
  const next = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Next",
  );
  const back = host.querySelector("button");
  assert.equal(back.disabled, true);
  panel.update(step({ canBack: true, last: true }));
  assert.equal(back.disabled, false);
  assert.equal(next.textContent, "Done");
  assert.ok(next.isConnected);
  next.click();
  assert.deepEqual(actions, ["guide-next"]);
});

test("each phase shows its own buttons and a dismissed guide hides the panel", () => {
  const { host, panel } = rig();
  const shown = () =>
    [...host.querySelectorAll("button")].map((b) => b.dataset.action);
  panel.update(step());
  assert.deepEqual(shown(), ["guide-back", "guide-next", "guide-dismiss"]);
  assert.equal(
    host.querySelector(".gl-answer-bubble"),
    null,
    "the explanation stands under the mark on the page, not in the card",
  );
  panel.update({
    type: "guide",
    phase: "finished",
    bubbles: ["Bye"],
    canBack: true,
  });
  assert.deepEqual(shown(), ["guide-back", "guide-dismiss"]);
  panel.update({
    type: "guide",
    phase: "error",
    bubbles: ["Why"],
    retry: true,
  });
  assert.deepEqual(shown(), ["guide-retry", "guide-dismiss"]);
  panel.update({ type: "guide", phase: "dismissed" });
  assert.equal(host.hidden, true);
  assert.equal(host.children.length, 0);
});

test("a guide line sits in the card flow and enters with transform and opacity only", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const rule = /\.gl-guide > \.gl-answer-bubble \{([^}]*)\}/.exec(css)?.[1];
  assert.match(rule, /flex-basis:\s*100%/);
  assert.match(rule, /animation:\s*gl-guide-in var\(--motion-/);
  const frames = /@keyframes gl-guide-in \{([\s\S]*?)\n\}/.exec(css)?.[1];
  assert.match(frames, /opacity/);
  assert.doesNotMatch(frames, /width|height|margin|padding|top|left/);
});

test("a step says its number out of the total, with no title and no overview button", () => {
  const { host, panel } = rig();
  panel.update(step({ index: 1, total: 4, title: "Results", canBack: true }));
  assert.equal(host.firstChild.className, "gl-guide-head");
  assert.equal(host.firstChild.textContent, "Step 2 of 4");
  assert.equal(
    [...host.querySelectorAll("button")].some(
      (b) => b.dataset.action === "guide-overview",
    ),
    false,
  );
});

test("while the screen is read the card has an End button", () => {
  const { host, panel, actions } = rig();
  panel.update({ type: "guide", phase: "thinking" });
  const end = host.querySelector("button");
  assert.equal(end.dataset.action, "guide-dismiss");
  end.click();
  assert.deepEqual(actions, ["guide-dismiss"]);
});

test("a closed guide leaves nothing in the card, not even an offer to show it again", () => {
  const { host, panel } = rig();
  panel.update({
    type: "guide",
    phase: "step",
    index: 0,
    total: 3,
    canNext: true,
  });
  panel.update({ type: "guide", phase: "dismissed" });
  assert.equal(host.hidden, true);
  assert.equal(host.querySelector("button"), null);
  assert.equal(host.textContent, "");
});
