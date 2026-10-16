import assert from "node:assert/strict";
import { test } from "node:test";
import { timing } from "../shared/motion.mjs";
import { createMachine, MOVE_SLOP, readingMs } from "./machine.mjs";

const blink = { x: 100, y: 100, width: 100, height: 100 };
const card = { x: 260, y: 60, width: 300, height: 400 };
const on = { x: 150, y: 150 };
const away = { x: 900, y: 700 };

function rig() {
  const m = createMachine();
  m.geometry({ blink });
  const at = { t: 0 };
  const go = (ms) => {
    const fx = [];
    for (let end = at.t + ms; at.t < end; ) {
      at.t = Math.min(at.t + 16, end);
      fx.push(...m.tick(at.t));
    }
    return fx;
  };
  return { m, at, go, read: () => m.read(at.t) };
}
const types = (fx) => fx.map((e) => e.type);

test("reading time is words over four per second, between 8 and 30 seconds", () => {
  assert.equal(readingMs(0), 8000);
  assert.equal(readingMs(20), 8000);
  assert.equal(readingMs(60), 15000);
  assert.equal(readingMs(400), 30000);
  assert.equal(readingMs(NaN), 8000);
});

test("Blink retreats only after 1.5 s with nothing engaged", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(timing.menuRest + 32);
  assert.equal(read().state, "menu");
  m.pointer(away, at.t, false);
  const fx = go(timing.retreat + timing.grace - 32);
  assert.equal(types(fx).includes("retreat"), false);
  assert.equal(read().out, true);
  assert.deepEqual(
    types(go(64)).filter((t) => t === "retreat"),
    ["retreat"],
  );
  assert.equal(read().state, "peek");
});

test("each engaged input blocks the retreat and releases it 1.5 s later", () => {
  const cases = {
    "pointer over Blink": (m) => m.pointer(on, 0, true),
    "composer focus": (m) => m.composer({ focus: true }, 0),
    "composer text": (m) => m.composer({ text: true }, 0),
    "ime composition": (m) => m.composer({ ime: true }, 0),
    "open panel": (m) => m.panels(1),
    "answer streaming": (m) => m.answerStart(0),
    "capture in progress": (m) => m.capture(true),
    "image viewer": (m) => m.viewer(true),
  };
  for (const [name, engage] of Object.entries(cases)) {
    const { m, go, read } = rig();
    m.click(0); // out, card open
    m.close(0);
    m.pointer(away, 0, false);
    go(0);
    engage(m);
    go(10000);
    assert.equal(read().out, true, `${name} keeps Blink out`);
  }
});

test("scroll and selection engage for two seconds, then the retreat clock runs", () => {
  for (const kind of ["scrolled", "selected"]) {
    const { m, at, go, read } = rig();
    m.click(0);
    m.close(0);
    m[kind](at.t);
    go(timing.activity + timing.retreat - 64);
    assert.equal(read().out, true, kind);
    go(160);
    assert.equal(read().out, false, kind);
  }
});

test("an open menu or card is engaged and never retreats", () => {
  const { m, go, read } = rig();
  m.click(0);
  m.click(1); // card to menu
  assert.equal(read().state, "menu");
  go(20000);
  assert.equal(read().out, true);
  assert.equal(read().state, "menu");
});

test("click toggles card, menu, card and keeps the history flag out of it", () => {
  const { m, read } = rig();
  m.pointer(on, 0, true);
  m.click(1);
  assert.equal(read().state, "chat");
  const fx = m.take();
  assert.equal(fx.find((e) => e.type === "open-chat").focus, true);
  m.click(2);
  assert.equal(read().state, "menu");
  assert.equal(read().card, false);
  m.click(3);
  assert.equal(read().state, "chat");
});

test("click from peek opens the card with the composer focused", () => {
  const { m, read } = rig();
  assert.equal(read().state, "peek");
  m.click(0);
  assert.equal(read().state, "chat");
  assert.equal(m.take().find((e) => e.type === "open-chat").focus, true);
});

test("hover shows the menu but never on top of an open card", () => {
  const { m, go, read } = rig();
  m.click(0);
  m.geometry({ card });
  m.take();
  m.pointer(on, 10, true);
  go(timing.menuRest * 3);
  assert.equal(read().menu, false);
  assert.equal(read().card, true);
  assert.equal(types(m.take()).includes("open-menu"), false);
});

test("the way from Blink to the card is never leaving", () => {
  const { m, at, go, read } = rig();
  m.click(0);
  m.pointer(on, 0, true);
  m.geometry({ card });
  m.click(1); // menu
  m.click(2); // card
  m.close(3);
  m.take();
  m.pointer(on, 4, true);
  m.click(5);
  m.geometry({ card });
  // Walk through the gap: off Blink's shape, inside the hull of Blink and the card.
  at.t = 100;
  m.pointer({ x: 230, y: 150 }, at.t, false);
  assert.equal(read().pointer, false);
  const fx = go(timing.retreat * 4);
  assert.equal(types(fx).includes("retreat"), false);
  assert.equal(read().card, true);
});

test("the hover menu stays through 400 ms of grace after the pointer leaves", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, 0, true);
  assert.equal(read().menu, false);
  go(timing.menuRest + 32);
  assert.equal(read().menu, true);
  m.pointer(away, at.t, false);
  go(timing.grace - 40);
  assert.equal(read().menu, true);
  go(80);
  assert.equal(read().menu, false);
});

test("a press held 250 ms picks Blink up; a short click stays a click", () => {
  const a = rig();
  a.m.press(on, 0);
  a.go(timing.pickHold - 20);
  assert.equal(a.read().held, false);
  a.go(40);
  assert.equal(a.read().held, true);
  assert.equal(a.read().state, "held");
  assert.equal(a.m.release(a.at.t), "drop");
  assert.equal(a.read().held, false);

  const b = rig();
  b.m.press(on, 0);
  b.go(100);
  assert.equal(b.m.release(b.at.t), "click");
  assert.equal(b.read().state, "chat");
});

test("a press that moves 4 px picks Blink up", () => {
  const { m, read } = rig();
  m.press(on, 0);
  m.pointer({ x: on.x + MOVE_SLOP - 1, y: on.y }, 10, true);
  assert.equal(read().held, false);
  m.pointer({ x: on.x + MOVE_SLOP, y: on.y }, 20, true);
  assert.equal(read().held, true);
  assert.equal(
    m.take().some((e) => e.type === "pick-up"),
    true,
  );
});

test("Blink never retreats while held, however long", () => {
  const { m, go, read } = rig();
  m.press(on, 0);
  m.pointer({ x: 400, y: 400 }, 20, false);
  go(30000);
  assert.equal(read().state, "held");
  assert.equal(read().out, true);
});

test("an answer opens the card by itself, without taking the keyboard", () => {
  const { m, read } = rig();
  m.answerStart(0);
  assert.equal(read().card, true);
  assert.equal(read().state, "busy");
  assert.equal(m.take().find((e) => e.type === "open-chat").focus, false);
});

test("an unpinned card closes after the reading time from the end of the answer", () => {
  const { m, at, go, read } = rig();
  m.answerStart(0);
  go(2000);
  m.answerEnd(60, at.t);
  const end = at.t;
  go(readingMs(60) - 100);
  assert.equal(read().card, true);
  const fx = go(200 + timing.retreat);
  assert.equal(types(fx).includes("close-chat"), true);
  assert.ok(at.t - end >= 15000);
  assert.equal(read().card, false);
});

test("reading time waits while the pointer is on the card or a scroll is recent", () => {
  const { m, at, go, read } = rig();
  m.geometry({ card });
  m.answerStart(0);
  m.answerEnd(0, 0);
  m.pointer({ x: 300, y: 200 }, 0, false);
  for (let i = 0; i < 100; i++) {
    m.pointer({ x: 300, y: 200 }, at.t, false);
    go(250);
  }
  assert.equal(read().card, true);
  m.pointer(away, at.t, false);
  go(timing.grace + timing.retreat + 100);
  assert.equal(read().card, false);
});

test("a pinned card stays until unpinned, then closes by the reading rule", () => {
  const { m, at, go, read } = rig();
  m.answerStart(0);
  m.pin(true, 0);
  m.answerEnd(0, 0);
  go(60000);
  assert.equal(read().card, true);
  m.pin(false, at.t);
  assert.equal(read().card, false);
});

test("Esc, the close button and a click outside close an unpinned card", () => {
  for (const how of ["escape", "close", "outside"]) {
    const { m, at, read } = rig();
    m.click(0);
    m[how](at.t);
    assert.equal(read().card, false, how);
  }
});

test("a click outside never drops a streaming answer or a draft", () => {
  const { m, read } = rig();
  m.answerStart(0);
  m.outside(10);
  assert.equal(read().card, true);
  m.answerEnd(5, 20);
  m.composer({ text: true }, 21);
  m.outside(30);
  assert.equal(read().card, true);
  m.composer({ text: false }, 31);
  m.outside(40);
  assert.equal(read().card, false);
});

test("a pinned card ignores a click outside and closes by hand", () => {
  const { m, read } = rig();
  m.click(0);
  m.pin(true, 1);
  m.outside(3);
  assert.equal(read().card, true);
  m.escape(4);
  assert.equal(read().card, false);
  m.click(5);
  m.pin(true, 6);
  m.close(7);
  assert.equal(read().card, false);
  assert.equal(read().pinned, false);
});

test("eating holds the state and engagement for its duration", () => {
  const { m, go, read } = rig();
  m.click(0);
  m.close(0);
  m.eat(1200, 0);
  assert.equal(read().state, "eating");
  go(1100);
  assert.equal(read().out, true);
  go(100 + timing.retreat + 50);
  assert.equal(read().state, "peek");
});

test("the machine owns no timer", async () => {
  const src = (await import("node:fs")).readFileSync(
    new URL("./machine.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(
    /setTimeout|setInterval|Date\.now|requestAnimationFrame/.test(src),
    false,
  );
});

test("losing focus with the pointer away from Blinkling is a click outside", () => {
  const { m, at, read } = rig();
  m.click(0);
  m.composer({ focus: true }, 1);
  m.pointer(away, at.t, false);
  m.blurred(50);
  assert.equal(read().card, false);
});

test("losing focus to a Blinkling panel or with the pointer on Blink keeps the card", () => {
  const near = rig();
  near.m.click(0);
  near.m.composer({ focus: true }, 1);
  near.m.pointer(on, near.at.t, true);
  near.m.blurred(50);
  assert.equal(near.read().card, true);
  const panel = rig();
  panel.m.click(0);
  panel.m.panels(1);
  panel.m.pointer(away, panel.at.t, false);
  panel.m.blurred(50);
  assert.equal(panel.read().card, true);
});

test("a motion that must be seen pulls Blink out and holds it until it ends", () => {
  const { m, go } = rig();
  m.showFor(3000, 0);
  assert.deepEqual(types(m.take()), ["out"]);
  assert.equal(
    types(go(3000 + timing.retreat - 64)).includes("retreat"),
    false,
  );
  assert.deepEqual(
    types(go(200)).filter((t) => t === "retreat"),
    ["retreat"],
  );
});

test("the standing grumble holds Blink out until it stops, then the retreat clock runs", () => {
  const { m, go, at } = rig();
  m.grumble(true, 0);
  assert.deepEqual(types(m.take()), ["out"]);
  assert.equal(types(go(30000)).includes("retreat"), false);
  m.grumble(false, at.t);
  assert.equal(types(go(timing.retreat - 64)).includes("retreat"), false);
  assert.deepEqual(
    types(go(200)).filter((t) => t === "retreat"),
    ["retreat"],
  );
});

test("a failed answer is reported once and ends the streaming state", () => {
  const { m, read } = rig();
  m.answerStart(0);
  m.take();
  m.answerFailed(10);
  assert.deepEqual(types(m.take()), ["answer-failed"]);
  assert.equal(read().streaming, false);
});

test("a pick in progress brings Blink out and holds it until the pick ends", () => {
  const { m, go, at } = rig();
  m.capture(true, 0);
  assert.deepEqual(types(m.take()), ["out"]);
  assert.equal(types(go(20000)).includes("retreat"), false);
  m.capture(false, at.t);
  assert.equal(types(go(timing.retreat - 64)).includes("retreat"), false);
  assert.deepEqual(
    types(go(200)).filter((t) => t === "retreat"),
    ["retreat"],
  );
});
