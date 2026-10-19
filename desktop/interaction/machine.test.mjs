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

test("leaving Blink with no card retreats after the corridor grace only, not after 1.5 s", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(timing.menuRest + 32);
  assert.equal(read().state, "menu");
  m.pointer(away, at.t, false);
  const early = go(timing.grace - 32);
  assert.equal(
    types(early).includes("retreat"),
    false,
    "the grace lets the pointer cross to a bubble",
  );
  assert.equal(read().out, true);
  assert.deepEqual(
    types(go(64)).filter((t) => t === "retreat"),
    ["retreat"],
  );
  assert.equal(read().state, "peek");
  assert.ok(at.t < timing.retreat, "well before the old 1.5 s");
});

test("touching Blink without the menu and leaving retreats at once, and a pointer back on Blink in the grace cancels it", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(100);
  m.pointer(away, at.t, false);
  go(timing.grace - 64);
  m.pointer(on, at.t, true);
  go(500);
  assert.equal(read().out, true, "still touching");
  m.pointer(away, at.t, false);
  go(timing.grace + 64);
  assert.equal(read().out, false);
});

test("a retreat that follows a motion, an answer or a drop still waits 1.5 s", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(100);
  m.pointer(away, at.t, false);
  m.answerStart(at.t);
  m.answerEnd(10, at.t);
  m.close(at.t);
  go(timing.grace + 200);
  assert.equal(read().out, true);
  go(timing.retreat);
  assert.equal(read().out, false);
});

test("Blink retreats 1.5 s after a card closes by itself", () => {
  const { m, go, read } = rig();
  m.click(0);
  m.close(0);
  m.pointer(away, 0, false);
  go(timing.retreat - 64);
  assert.equal(read().out, true);
  go(128);
  assert.equal(read().out, false);
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
    "settings or welcome window": (m) => m.windows(1),
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

test("Blink stays out while the welcome or settings window is open and retreats 1.5 s after it closes", () => {
  const { m, go, read } = rig();
  m.click(0);
  m.close(0);
  m.pointer(away, 0, false);
  m.windows(1);
  go(30000);
  assert.equal(read().out, true);
  m.windows(0);
  go(timing.retreat + 128);
  assert.equal(read().out, false);
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

test("a grab that lands before the rest ends does not bring the menu back at the drop", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(timing.menuRest - 100);
  m.press(on, at.t);
  m.pointer({ x: on.x + MOVE_SLOP, y: on.y }, at.t, true);
  go(40);
  m.release(at.t);
  m.pointer({ x: on.x + MOVE_SLOP, y: on.y }, at.t, true);
  go(80);
  assert.equal(read().menu, false);
  go(timing.menuRest);
  assert.equal(read().menu, true);
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

test("an answer to an Auto explain keeps the card up until the reader closes it", () => {
  const { m, at, go, read } = rig();
  m.answerStart(0);
  go(2000);
  m.answerEnd(10, at.t, { keep: true });
  go(readingMs(10) + 3 * timing.retreat);
  assert.equal(read().card, true, "no timer closes it");
  m.close(at.t);
  assert.equal(read().card, false, "the reader still can");
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

test("a click outside says whether it ended anything, so a guide goes with it", () => {
  const { m } = rig();
  m.click(0);
  assert.equal(m.outside(10), true);
  const held = rig();
  held.m.click(0);
  held.m.panels(1);
  assert.equal(held.m.outside(10), false, "a dialog holds the card");
});

test("a click outside closes the card even over a streaming answer or a draft, and a draft is kept by the page", () => {
  const { m, read } = rig();
  m.answerStart(0);
  const fx = (m.outside(10), m.take());
  assert.equal(read().card, false);
  assert.equal(
    fx.some((e) => e.type === "close-chat"),
    true,
  );
  const again = rig();
  again.m.click(0);
  again.m.composer({ text: true }, 1);
  again.m.outside(5);
  assert.equal(again.read().card, false);
});

test("an answer that goes on streaming after the click outside does not open the card mid-way, Blink goes back to its edge, and the finished answer opens the card", () => {
  const { m, at, go, read } = rig();
  m.answerStart(0);
  at.t = 10;
  const closed = (m.outside(10), m.take());
  assert.equal(
    types(closed).includes("retreat"),
    true,
    "at once with the card",
  );
  assert.equal(read().card, false);
  assert.equal(read().out, false, "Blink is back at its edge");
  go(timing.retreat + 100);
  assert.equal(read().state, "peek");
  const fx = go(1000);
  assert.equal(types(fx).includes("open-chat"), false);
  m.answerEnd(40, at.t);
  assert.equal(read().card, true, "the finished answer opens the card");
  assert.equal(types(m.take()).includes("open-chat"), true);
  m.close(at.t);
  // The next question opens the card as usual.
  m.answerStart(at.t);
  assert.equal(read().card, true);
});

test("a click outside keeps a card that holds a file dialog or the viewer, and does not keep one that holds a chip", () => {
  const { m, read } = rig();
  m.click(0);
  m.panels(1);
  m.outside(10);
  assert.equal(read().card, true);
  m.panels(0);
  m.viewer(true);
  m.outside(20);
  assert.equal(read().card, true);
  m.viewer(false);
  m.chips(true);
  m.outside(30);
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

test("the blur that follows Esc closing the card is not a click outside: Blink waits out its grace", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  m.click(at.t);
  m.composer({ focus: true }, at.t + 1);
  assert.equal(read().out, true);
  m.pointer(away, at.t, false);
  m.escape(at.t);
  assert.equal(read().card, false);
  // The hidden card gives up the keyboard.
  m.blurred(at.t + 5);
  assert.equal(read().out, true);
  go(900);
  assert.equal(read().out, true);
  go(1500);
  assert.equal(read().out, false);
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

test("losing focus to a click in Settings, the welcome or the viewer keeps the card", () => {
  const { m, at, read } = rig();
  m.click(0);
  m.composer({ focus: true }, 1);
  m.geometry({ panels: [{ x: 900, y: 100, width: 300, height: 400 }] });
  m.pointer({ x: 1000, y: 200 }, at.t, false);
  m.blurred(50);
  assert.equal(read().card, true);
  m.pointer(away, at.t, false);
  m.blurred(60);
  assert.equal(read().card, false);
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

test("the idle grumble is said from the edge: Blink does not come out, and the bubble does not hold it", () => {
  const { m, go } = rig();
  m.grumble(true, 0);
  assert.deepEqual(types(m.take()), []);
  assert.equal(types(go(30000)).includes("out"), false);
  m.grumble(false);
  assert.equal(types(go(timing.retreat + 200)).includes("retreat"), false);
});

test("a click outside clears the bubbles and sends Blink back at once, whatever it is doing", () => {
  const cases = {
    "out with nothing open": (m) => m.showFor(60000, 0),
    "a capture in progress": (m) => m.capture(true, 0),
    "a guide running": (m) => m.guide(true, 0),
    "an answer streaming": (m) => m.answerStart(0),
    "a menu opened by a click": (m) => (m.click(0), m.click(1)),
  };
  for (const [name, start] of Object.entries(cases)) {
    const { m, read } = rig();
    start(m);
    m.take();
    m.outside(100);
    const fx = types(m.take());
    assert.equal(read().out, false, name);
    assert.equal(read().card, false, name);
    assert.equal(fx.includes("retreat"), true, `${name}: retreats`);
    assert.equal(fx.includes("bubbles-clear"), true, `${name}: bubbles`);
  }
});

test("a click outside closes the hover menu too", () => {
  const { m, at, go, read } = rig();
  m.pointer(on, at.t, true);
  go(timing.menuRest + 32);
  assert.equal(read().state, "menu");
  m.pointer(away, at.t, false);
  m.outside(at.t);
  assert.equal(read().state === "menu", false);
  assert.equal(types(m.take()).includes("bubbles-clear"), true);
});

test("a click outside leaves a pinned card and a card with a panel open, and Blink stays out for them", () => {
  const pinned = rig();
  pinned.m.click(0);
  pinned.m.pin(true, 1);
  pinned.m.take();
  pinned.m.outside(100);
  assert.equal(pinned.read().card, true);
  assert.equal(pinned.read().out, true);
  const panel = rig();
  panel.m.click(0);
  panel.m.panels(1);
  panel.m.take();
  panel.m.outside(100);
  assert.equal(panel.read().card, true);
  assert.equal(panel.read().out, true);
});

test("the idle grumble is not touched by a click outside", () => {
  const { m, read } = rig();
  m.grumble(true);
  m.take();
  m.outside(100);
  assert.deepEqual(
    types(m.take()).filter((t) => t !== "bubbles-clear"),
    [],
  );
  assert.equal(read().out, false);
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

test("a notice opens the card unfocused and closes it by the reading rule", () => {
  const { m, at, go, read } = rig();
  m.notice(at.t);
  const open = m.take().find((e) => e.type === "open-chat");
  assert.equal(open.focus, false);
  assert.equal(read().card, true);
  go(timing.readMin - 500);
  assert.equal(read().card, true, "still readable");
  go(timing.readMin + timing.retreat);
  assert.equal(read().card, false, "closed by itself");
});

test("a guide holds the card open for as long as it runs", () => {
  const { m, at, go, read } = rig();
  m.guide(true, at.t);
  m.take();
  go(120_000);
  assert.equal(read().card, true, "open for the whole guide");
  m.guide(false, at.t);
  assert.equal(read().card, false, "the empty card goes with the guide");
});

test("ending a guide that can be shown again keeps the card for the offer, then lets it go", () => {
  const { m, at, go, read } = rig();
  m.guide(true, at.t);
  m.take();
  go(30_000);
  m.guide(false, at.t, true);
  assert.equal(read().card, true, "the offer is readable");
  go(timing.readMin + timing.retreat);
  assert.equal(read().card, false, "closed by itself later");
});

test("ending a guide closes the card at once when the guide opened it and nothing else is in it", () => {
  const { m, at, go, read } = rig();
  m.guide(true, at.t);
  m.take();
  go(30_000);
  m.pointer(on, at.t, true);
  m.guide(false, at.t);
  assert.equal(read().card, false, "closed the moment the guide ends");
  assert.ok(
    m.take().some((e) => e.type === "close-chat" && e.why === "guide-end"),
  );
});

test("ending a guide keeps the card for the reading time when it holds an answer, a draft or a failure", () => {
  const answered = rig();
  answered.m.guide(true, answered.at.t);
  answered.m.answerStart(answered.at.t);
  answered.m.answerEnd(40, answered.at.t);
  answered.m.guide(false, answered.at.t);
  assert.equal(answered.read().card, true, "an answer is still being read");

  const drafting = rig();
  drafting.m.guide(true, drafting.at.t);
  drafting.m.composer({ text: true }, drafting.at.t);
  drafting.m.guide(false, drafting.at.t);
  assert.equal(drafting.read().card, true, "a draft stays");

  const failed = rig();
  failed.m.guide(true, failed.at.t);
  failed.m.notice(failed.at.t);
  failed.m.guide(false, failed.at.t);
  failed.m.take();
  assert.equal(failed.read().card, true, "the failure is read first");
});

test("a card that was already open before the guide keeps the reading time", () => {
  const { m, at, read } = rig();
  m.pin(true, at.t);
  m.pin(false, at.t);
  m.notice(at.t);
  m.guide(true, at.t);
  m.guide(false, at.t);
  assert.equal(read().card, true);
});

test("a pinned card outlives a notice and a guide", () => {
  const { m, at, go, read } = rig();
  m.pin(true, at.t);
  m.notice(at.t);
  go(120_000);
  assert.equal(read().card, true);
});

test("using the capture bubble closes the menu, hover or sticky, and nothing else", () => {
  const hovered = rig();
  hovered.m.pointer(on, hovered.at.t, true);
  hovered.go(timing.menuRest + 32);
  assert.equal(hovered.read().menu, true);
  hovered.m.menuUsed(hovered.at.t);
  assert.equal(hovered.read().menu, false);
  assert.ok(types(hovered.m.take()).includes("close-menu"));

  const sticky = rig();
  sticky.m.pointer(on, sticky.at.t, true);
  sticky.m.click(sticky.at.t);
  sticky.m.click(sticky.at.t);
  assert.equal(sticky.read().menu, true);
  sticky.m.menuUsed(sticky.at.t);
  assert.equal(sticky.read().menu, false);
  assert.equal(sticky.read().card, false);

  const bare = rig();
  bare.m.menuUsed(bare.at.t);
  assert.deepEqual(bare.m.take(), []);
});

test("a card opened by anything but a click (a dropped file, a link, the mini box) takes the menu's place, hover or sticky", () => {
  const hovered = rig();
  hovered.m.pointer(on, hovered.at.t, true);
  hovered.go(timing.menuRest + 32);
  assert.equal(hovered.read().menu, true);
  hovered.m.open("request", hovered.at.t);
  assert.equal(hovered.read().card, true);
  assert.equal(hovered.read().menu, false, "the card and the menu never share");
  assert.deepEqual(
    types(hovered.m.take()).filter((x) => x === "open-chat"),
    ["open-chat"],
  );

  const sticky = rig();
  sticky.m.click(sticky.at.t);
  sticky.m.click(sticky.at.t);
  assert.equal(sticky.read().menu, true);
  sticky.m.open("request", sticky.at.t);
  assert.equal(sticky.read().card, true);
  assert.equal(sticky.read().menu, false);
  // The card the call opened closes by the same rules: Esc and a click away.
  sticky.m.escape(sticky.at.t);
  assert.equal(sticky.read().card, false);
});

test("a click inside Settings is Blinkling's own: the card stays, and a background click works once Settings is closed", () => {
  const { m, at, go, read } = rig();
  m.open("answer", 0); // card open
  m.pointer(away, at.t, false);
  go(32);
  assert.equal(read().surface, "chat");
  m.windows(1); // Settings opens
  m.blurred(at.t); // the click in Settings takes the keyboard from the card
  go(32);
  assert.equal(read().surface, "chat", "the card stays beside Settings");
  m.windows(0); // Settings closes
  go(32);
  assert.equal(
    m.outside(at.t),
    true,
    "the next background click ends the card",
  );
  assert.equal(read().surface, "none");
  // And again for the next capture: the same click works every time.
  m.open("answer", at.t);
  assert.equal(m.outside(at.t + 2), true);
});

test("a typed question whose card lost focus or was clicked away opens the card when the answer is done", () => {
  for (const away of ["outside", "blurred"]) {
    const { m, at, read } = rig();
    m.click(0);
    m.composer({ focus: true, text: true }, 1);
    m.answerStart(5);
    at.t = 20;
    m[away](20);
    assert.equal(read().card, false, away);
    m.take();
    m.answerEnd(30, 3000);
    assert.equal(read().card, true, `${away}: card opens at the end`);
    assert.equal(types(m.take()).includes("open-chat"), true);
  }
});

test("a capture question whose card was closed by the next capture opens the card when the answer is done", () => {
  const { m, read } = rig();
  m.capture(true, 0);
  m.capture(false, 100);
  m.click(200);
  m.answerStart(300);
  m.outside(400);
  m.capture(true, 500);
  m.capture(false, 600);
  assert.equal(read().card, false);
  m.answerEnd(20, 3000);
  assert.equal(read().card, true);
});

test("Esc or the close button on a streaming answer keeps the card shut at its end, and the next question opens it", () => {
  for (const how of ["escape", "close"]) {
    const { m, read } = rig();
    m.answerStart(0);
    m[how](10);
    m.take();
    m.answerEnd(10, 2000);
    assert.equal(read().card, false, how);
    m.answerStart(3000);
    assert.equal(read().card, true);
  }
});

test("a capture that starts with the card open closes the card first, a pinned card or one with a panel stays, and a second capture changes nothing", () => {
  const { m, read } = rig();
  m.click(0);
  assert.equal(read().card, true);
  m.take();
  m.capture(true, 10);
  assert.equal(read().card, false);
  assert.equal(types(m.take()).includes("close-chat"), true);
  m.capture(true, 20);
  m.capture(false, 30);
  m.capture(false, 40);
  const pinned = rig();
  pinned.m.click(0);
  pinned.m.pin(true, 1);
  pinned.m.capture(true, 10);
  assert.equal(pinned.read().card, true);
  const panel = rig();
  panel.m.click(0);
  panel.m.panels(1);
  panel.m.capture(true, 10);
  assert.equal(panel.read().card, true);
});
