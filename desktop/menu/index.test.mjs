import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { mountMenu } from "./index.mjs";
import { menuText, strings } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";

const css = readFileSync(
  new URL("../renderer/style.css", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../renderer/index.html", import.meta.url),
  "utf8",
);
const source = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
const rules = (selector) =>
  [...css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)]
    .filter((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim())
        .includes(selector),
    )
    .map((m) => m[2])
    .join("\n");
const px = (selector, property = "font-size") =>
  Number(rules(selector).match(new RegExp(`${property}:\\s*(\\d+)px`))?.[1]);

function mount(options) {
  const { window } = new JSDOM("<body><div id='menu'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const clicks = [];
  const menu = mountMenu(
    window.document.querySelector("#menu"),
    (id) => clicks.push(id),
    options,
  );
  globalThis.document = previous;
  return { menu, window, clicks };
}
const area = { x: 0, y: 0, width: 1280, height: 800 };
const anchor = { x: 1200, y: 400 };
const run = (menu, seconds, open) => {
  menu.setOpen(open, 0);
  for (let t = 0; t < seconds; t += 1 / 60) menu.frame(t, 1 / 60, area, anchor);
};

test("the fan has five bubbles: capture, guide, auto explain, settings, close", () => {
  const { menu } = mount({ text: menuText("zh-TW") });
  assert.deepEqual(
    menu.buttons.map((b) => b.dataset.action),
    ["capture", "guide", "auto-explain", "settings", "quit"],
  );
  assert.deepEqual(
    menu.buttons.map((b) => b.getAttribute("aria-label")),
    ["截圖", "導覽", "自動解說", "設定", "關閉"],
  );
});

test("every locale has the complete menu table and the product names stay untranslated", () => {
  const keys = Object.keys(strings.en).sort();
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    for (const value of Object.values(strings[locale]))
      assert.ok(value.trim(), locale);
  }
  for (const locale of LOCALES)
    assert.match(strings[locale].toolbar, /Blink/, locale);
  const labels = (locale) =>
    mount({ text: menuText(locale) }).menu.buttons.map((b) =>
      b.getAttribute("aria-label"),
    );
  assert.notDeepEqual(labels("ja"), labels("en"));
  assert.notDeepEqual(labels("de"), labels("fr"));
});

test("no menu label is hard-coded in the module", () => {
  assert.doesNotMatch(source, /[\u3000-\u9fff]/);
});

test("auto explain is a switch that shows its state on the bubble", () => {
  const { menu } = mount({ text: menuText("en") });
  const pill = menu.buttons[2];
  assert.equal(pill.getAttribute("role"), "switch");
  assert.equal(pill.getAttribute("aria-checked"), "false");
  assert.notEqual(pill.dataset.on, "true");
  menu.setAuto(true);
  assert.equal(pill.getAttribute("aria-checked"), "true");
  assert.equal(pill.dataset.on, "true");
  assert.equal(
    pill.querySelector(".action-label span").textContent,
    strings.en.autoExplainOn,
  );
  assert.match(css, /\.action-bubble\[data-on="true"\]::after/);
  // The bubble's own display rule would otherwise win over the hidden attribute.
  assert.match(rules(".action-bubble[hidden]"), /display:\s*none/);
  menu.setAuto(false);
  assert.equal(pill.getAttribute("aria-checked"), "false");
  assert.equal(
    pill.querySelector(".action-label span").textContent,
    strings.en.autoExplainHint,
  );
  assert.doesNotMatch(
    html,
    /auto-badge|id="pin"/,
    "Blink carries no badge or pin",
  );
});

test("only the switch is a switch; the other bubbles are plain buttons", () => {
  const { menu } = mount();
  assert.deepEqual(
    menu.buttons.map((b) => b.getAttribute("role")),
    [null, null, "switch", null, null],
  );
});

test("label text is at least 13px from the shared type tokens and icons are 24px", () => {
  const look = readFileSync(
    new URL("../shared/look.css", import.meta.url),
    "utf8",
  );
  const token = (name) =>
    Number(look.match(new RegExp(`--${name}:\\s*(\\d+)px`))[1]);
  for (const selector of [".action-label strong", ".action-label span"]) {
    const name = rules(selector).match(/font-size:\s*var\(--(type-\w+)\)/)?.[1];
    assert.ok(name, `${selector} uses a type token`);
    assert.ok(token(name) >= 13, selector);
  }
  assert.ok(px(".action-bubble svg", "width") >= 24);
});

test("bubbles keep one fixed size and animate only transform and opacity", () => {
  const bubble = rules(".action-bubble");
  assert.match(bubble, /width:\s*42px/);
  assert.match(bubble, /height:\s*42px/);
  for (const [, , props] of css
    .matchAll(/(?:^|\n)([^{}\n]*action[^{}\n]*)\{([^}]*)\}/g)
    .map((m) => m)) {
    for (const t of props.matchAll(/transition:([^;]*);/g))
      for (const part of t[1].split(",")) {
        const property = part.trim().split(/\s+/)[0];
        assert.ok(["transform", "opacity"].includes(property), part);
        assert.match(part, /var\(--motion-/, "duration from the motion tokens");
        assert.match(part, /var\(--ease-/, "easing from the motion tokens");
      }
  }
  assert.doesNotMatch(css, /transition:\s*(width|left|top|all)/);
});

test("the module positions bubbles with transform only", () => {
  const { menu } = mount();
  run(menu, 1, true);
  for (const b of menu.buttons) {
    assert.equal(b.style.left, "");
    assert.equal(b.style.top, "");
    assert.equal(b.style.width, "");
    assert.match(b.style.transform, /^translate\(/);
  }
});

test("no timing, easing or spring literal in the module", () => {
  assert.doesNotMatch(source, /cubic-bezier|\b\d+ms\b/);
  assert.doesNotMatch(source, /spring\([^)]*,\s*\d+\s*\)/);
});

test("opening and closing settle, and reversing mid-way is smooth", () => {
  const { menu } = mount();
  run(menu, 1, true);
  assert.ok(menu.buttons.every((b) => b.style.opacity === "1"));
  assert.ok(menu.buttons.every((b) => !b.inert));
  menu.setOpen(false, 1);
  for (let t = 1; t < 1.1; t += 1 / 60) menu.frame(t, 1 / 60, area, anchor);
  const partway = menu.buttons.map((b) => Number(b.style.opacity));
  assert.ok(
    partway.some((v) => v > 0 && v < 1),
    "mid-close",
  );
  menu.setOpen(true, 1.1);
  for (let t = 1.1; t < 2; t += 1 / 60) menu.frame(t, 1 / 60, area, anchor);
  assert.ok(menu.buttons.every((b) => b.style.opacity === "1"));
});

test("a bubble reports its click and unfolds its label on hover", () => {
  const { menu, clicks, window } = mount();
  run(menu, 1, true);
  menu.buttons[1].dispatchEvent(new window.Event("pointerenter"));
  menu.frame(2, 1 / 60, area, anchor);
  assert.equal(menu.expanded, 1);
  assert.ok(menu.buttons[1].classList.contains("expanded"));
  menu.buttons[1].dispatchEvent(new window.Event("pointerleave"));
  assert.equal(menu.expanded, -1);
  menu.buttons[3].click();
  assert.deepEqual(clicks, ["settings"]);
});

test("the fan logs its frames for the motion gate and never leaves the display", () => {
  globalThis.__blinklingFrames = [];
  const { menu } = mount();
  run(menu, 1, true);
  const frames = globalThis.__blinklingFrames.filter(
    (f) => f.surface === "fan",
  );
  assert.ok(frames.length > 10);
  for (const f of frames.filter((f) => f.box)) {
    assert.ok(f.box.x >= 0 && f.box.y >= 0, "inside top-left");
    assert.ok(f.box.x + f.box.width <= area.width, "inside right");
    assert.ok(f.box.y + f.box.height <= area.height, "inside bottom");
  }
});

test("closing collapses where the fan stood, even when Blink leaves at once", () => {
  const { menu } = mount();
  run(menu, 1, true);
  const standing = menu.buttons.map((b) => b.style.transform);
  menu.setOpen(false, 1);
  const far = { x: 100, y: 700 };
  const before = menu.buttons[0].style.transform;
  menu.frame(1.02, 1 / 60, area, far);
  const after = menu.buttons.map((b) => b.style.transform);
  const near = (t) => t.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.abs(near(after[0])[0] - near(before)[0]) < 40, "no jump");
  assert.notDeepEqual(after, standing);
});

test("a fan closed by picking Blink up shrinks together, so no bubble crosses another", () => {
  const overlap = (boxes) =>
    boxes.some((a, i) =>
      boxes
        .slice(i + 1)
        .some(
          (b) =>
            a.x < b.x + b.size &&
            b.x < a.x + a.size &&
            a.y < b.y + b.size &&
            b.y < a.y + a.size,
        ),
    );
  const worst = (together) => {
    const { menu } = mount();
    run(menu, 1, true);
    menu.setOpen(false, 1, { together });
    let bad = 0;
    for (let t = 1; t < 1.6; t += 1 / 60) {
      menu.frame(t, 1 / 60, area, anchor);
      const boxes = menu.buttons
        .filter((b) => Number(b.style.opacity) > 0.8)
        .map((b) => {
          const [x, y, scale] = b.style.transform.match(/-?\d+(\.\d+)?/g);
          return { x: +x, y: +y, size: 42 * scale };
        });
      if (overlap(boxes)) bad++;
    }
    return bad;
  };
  assert.equal(worst(true), 0);
  assert.ok(worst(false) > 0, "the staggered close is the one that crosses");
});

// N6.2 / NM-3: a pointer jump onto Blink plus a click opens and closes the fan
// inside one rest delay. Every bubble that is moving turns around at once,
// from where it is, instead of finishing the old trip and flying back.
test("reversing mid-way turns every moving bubble around from where it is", () => {
  const opacities = (menu) => menu.buttons.map((b) => Number(b.style.opacity));
  for (const [from, to] of [
    [true, false],
    [false, true],
  ]) {
    const { menu } = mount();
    if (!from) run(menu, 1, true);
    let t = 0;
    menu.setOpen(from, t);
    for (let i = 0; i < 9; i++, t += 1 / 60)
      menu.frame(t, 1 / 60, area, anchor);
    const turning = opacities(menu);
    assert.ok(
      turning.some((v) => v > 0.05 && v < 0.95),
      "mid-way",
    );
    menu.setOpen(to, t);
    const sign = to ? 1 : -1;
    const samples = [];
    for (let i = 0; i < 12; i++, t += 1 / 60) {
      menu.frame(t, 1 / 60, area, anchor);
      samples.push(opacities(menu));
    }
    turning.forEach((start, i) => {
      if (start <= 0.05 || start >= 0.95) return;
      // The first frames may still coast on momentum, but within a tenth of a
      // second the bubble has crossed back past where it was turned.
      const late = samples[samples.length - 1][i];
      assert.ok(
        sign * (late - start) > 0,
        `bubble ${i} still on its old trip: ${start} -> ${late}`,
      );
      const coast = Math.max(...samples.map((s) => sign * (start - s[i])));
      assert.ok(coast < 0.06, `bubble ${i} coasted ${coast} the wrong way`);
    });
  }
});

test("first use: the open fan names all five bubbles, reports it once and keeps them until it closes", () => {
  const seen = [];
  const { menu } = mount({ firstUse: true, onLabelsShown: () => seen.push(1) });
  const names = () => menu.buttons.map((b) => b.classList.contains("expanded"));
  menu.frame(0, 1 / 60, area, anchor);
  assert.deepEqual(names(), [false, false, false, false, false]);
  assert.equal(seen.length, 0, "a closed fan has shown nothing");
  run(menu, 1, true);
  assert.deepEqual(names(), [true, true, true, true, true]);
  assert.equal(seen.length, 1);
  run(menu, 1, true);
  assert.equal(seen.length, 1, "reported once, not per frame");
  assert.equal(
    menu.polygons().length,
    10,
    "bubbles and their labels take the pointer",
  );
  menu.setOpen(false, 1);
  for (let t = 1; t < 3; t += 1 / 60) menu.frame(t, 1 / 60, area, anchor);
  assert.deepEqual(names(), [false, false, false, false, false]);
  run(menu, 1, true);
  assert.deepEqual(
    names(),
    [false, false, false, false, false],
    "the next opening is the quiet one",
  );
  assert.equal(seen.length, 1);
});

test("after the first use the fan labels only the bubble under the pointer", () => {
  const seen = [];
  const { menu } = mount({
    firstUse: false,
    onLabelsShown: () => seen.push(1),
  });
  run(menu, 1, true);
  assert.deepEqual(
    menu.buttons.map((b) => b.classList.contains("expanded")),
    [false, false, false, false, false],
  );
  assert.equal(seen.length, 0);
});

test("first-use labels are one line, so five of them never meet", () => {
  assert.match(rules(".intro .action-label"), /white-space:\s*nowrap/);
  assert.match(rules(".intro .action-label span"), /display:\s*none/);
});

test("the first-use labels reach every locale at the same size as a hovered one", () => {
  for (const locale of LOCALES) {
    const { menu } = mount({ text: menuText(locale), firstUse: true });
    assert.equal(menu.buttons.length, 5);
    for (const b of menu.buttons)
      assert.ok(
        b.querySelector(".action-label strong").textContent.length > 0,
        locale,
      );
  }
});

test("first use on a display too short for Close still finishes: the bubble left out is not waited on", () => {
  const seen = [];
  const { menu } = mount({ firstUse: true, onLabelsShown: () => seen.push(1) });
  const short = { x: 0, y: 0, width: 640, height: 400 };
  const go = (from) => {
    for (let t = from; t < from + 1; t += 1 / 60)
      menu.frame(t, 1 / 60, short, anchor);
  };
  menu.frame(0, 1 / 60, short, anchor);
  menu.setOpen(true, 0);
  go(0);
  assert.equal(menu.buttons.filter((b) => b.hidden).length, 1);
  assert.equal(seen.length, 1, "the names were reported");
  menu.setOpen(false, 1);
  go(1);
  go(2);
  menu.setOpen(true, 3);
  go(3);
  assert.deepEqual(
    menu.buttons
      .filter((b) => !b.hidden)
      .map((b) => b.classList.contains("expanded")),
    [false, false, false, false],
    "the next opening is the quiet one",
  );
});

test("closing on a display too short for Close starts at once: the bubble left out takes no turn", () => {
  const { menu } = mount();
  const short = { x: 0, y: 0, width: 640, height: 400 };
  let t = 0;
  const step = () => menu.frame((t += 1 / 60), 1 / 60, short, anchor);
  menu.frame(0, 1 / 60, short, anchor);
  menu.setOpen(true, 0);
  for (let i = 0; i < 90; i++) step();
  const before = menu.buttons[0].style.opacity;
  assert.equal(before, "1");
  menu.setOpen(false, t);
  step();
  step();
  assert.ok(
    Number(menu.buttons[3].style.opacity) < 1,
    "the farthest bubble leaves first, with no empty turn before it",
  );
});

test("the tooltip keeps dark text on its light surface when its bubble is on", () => {
  // A switched-on bubble sets white text for its own green face; the label is a
  // child that sits on --surface, so it must set its own colour.
  assert.match(rules('.action-bubble[aria-checked="true"]'), /text-on-green/);
  assert.match(rules(".action-label"), /(?:^|[\s;])color:\s*var\(--text\)/);
});
