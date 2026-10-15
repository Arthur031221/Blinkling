import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { mountMenu, menuActions } from "./index.mjs";
import { strings } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";

const css = readFileSync(
  new URL("../renderer/style.css", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../renderer/index.html", import.meta.url),
  "utf8",
);
const rule = (selector) =>
  [...css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)]
    .filter((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim())
        .includes(selector),
    )
    .map((m) => m[2])
    .join("\n");

function mount(locale = "en") {
  const { window } = new JSDOM("<body><div id='menu'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const menu = mountMenu(window.document.querySelector("#menu"), () => {}, {
    locale,
  });
  globalThis.document = previous;
  return { menu, window };
}
const area = { x: 0, y: 0, width: 1366, height: 800 };

test("the fan has four pills: capture, guide, auto explain, settings", () => {
  assert.deepEqual(
    menuActions.map((a) => a.id),
    ["capture", "guide", "auto-explain", "settings"],
  );
  assert.equal(mount().menu.buttons.length, 4);
});

test("every locale has every string, and Blink is never translated", () => {
  assert.deepEqual(Object.keys(strings).sort(), [...LOCALES].sort());
  const keys = Object.keys(strings.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), keys, locale);
    assert.match(strings[locale].toolbar, /Blink/, locale);
  }
});

test("pill labels follow the language", () => {
  for (const locale of LOCALES) {
    const { menu } = mount(locale);
    assert.equal(
      menu.buttons[0].querySelector("strong").textContent,
      strings[locale].capture,
    );
    assert.equal(
      menu.buttons[3].getAttribute("aria-label"),
      strings[locale].settings,
    );
  }
});

test("pill text is at least 13px and icons are larger at 100%", () => {
  assert.match(rule(".action-detail"), /font-size:\s*var\(--type-s\)/);
  assert.match(rule(".action-detail strong"), /font-size:\s*var\(--type-s\)/);
  assert.match(rule(".action-detail > span"), /font-size:\s*var\(--type-s\)/);
  assert.match(rule(".action-bubble svg"), /width:\s*26px/);
});

test("the pill css moves nothing but transform and opacity", () => {
  for (const sel of [".action-bubble", ".action-detail"])
    assert.doesNotMatch(
      rule(sel),
      /transition:[^;]*(width|left|top|height|all)/,
      sel,
    );
  assert.doesNotMatch(css, /#[0-9a-fA-F]{6}\b/, "colours come from look.css");
  assert.doesNotMatch(css, /(transition|animation)[^;]*\d+m?s\b/);
});

test("auto explain is a switch with a visible on-state, and no separate badge", () => {
  const { menu } = mount();
  const pill = menu.buttons[2];
  assert.equal(pill.getAttribute("role"), "switch");
  assert.equal(pill.getAttribute("aria-checked"), "false");
  assert.equal(pill.dataset.on, "false");
  menu.setAuto(true);
  assert.equal(pill.getAttribute("aria-checked"), "true");
  assert.equal(pill.dataset.on, "true");
  assert.equal(pill.getAttribute("aria-label"), "Auto explain (on)");
  assert.equal(
    pill.querySelector(".action-detail > span").textContent,
    strings.en["auto.on"],
  );
  assert.match(css, /\.action-bubble\[data-on="true"\]::after/);
  menu.setAuto(false);
  assert.equal(pill.getAttribute("aria-label"), "Auto explain");
  assert.doesNotMatch(html, /auto-badge|id="pin"|chat-card/);
});

test("hovering one pill expands only that pill", () => {
  const { menu, window } = mount();
  menu.setOpen(true, 0);
  menu.frame(1, 0.016, area, { x: 1366, y: 400 });
  menu.buttons[1].dispatchEvent(new window.Event("pointerenter"));
  assert.equal(menu.expanded, 1);
  menu.frame(1.016, 0.016, area, { x: 1366, y: 400 });
  assert.ok(menu.buttons[1].classList.contains("expanded"));
  assert.ok(!menu.buttons[0].classList.contains("expanded"));
  menu.buttons[1].dispatchEvent(new window.Event("pointerleave"));
  assert.equal(menu.expanded, -1);
});

test("the fan opens and logs its frames, and collapse is instant", () => {
  const { menu } = mount();
  globalThis.__blinklingFrames.length = 0;
  menu.setOpen(true, 0);
  let now = 0;
  for (let i = 0; i < 90; i++) {
    now += 0.016;
    menu.frame(now, 0.016, area, { x: 1366, y: 400 });
  }
  assert.ok(
    menu.buttons.every((b) => Number(b.style.opacity) > 0.99),
    "fully open",
  );
  assert.ok(globalThis.__blinklingFrames.some((f) => f.surface === "fan"));
  menu.collapse();
  assert.ok(menu.buttons.every((b) => b.style.opacity === "0"));
  assert.ok(menu.buttons.every((b) => b.inert));
  assert.equal(menu.polygons().length, 0);
});

test("pills are placed with transform, never with left or top", () => {
  const { menu } = mount();
  menu.setOpen(true, 0);
  menu.frame(1, 0.016, area, { x: 1366, y: 400 });
  for (const b of menu.buttons) {
    assert.match(b.style.transform, /^translate\(/);
    assert.equal(b.style.left, "");
    assert.equal(b.style.top, "");
  }
});
