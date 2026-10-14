import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { mountMenu } from "./index.mjs";

const css = readFileSync(
  new URL("../renderer/style.css", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../renderer/index.html", import.meta.url),
  "utf8",
);
const size = (selector, property = "font-size") =>
  [...css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)]
    .filter((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim())
        .includes(selector),
    )
    .map(
      (m) =>
        m[2].match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1],
    )
    .filter(Boolean)
    .map(Number)
    .at(-1);

function mount() {
  const { window } = new JSDOM("<body><div id='menu'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const menu = mountMenu(window.document.querySelector("#menu"), () => {});
  globalThis.document = previous;
  return { menu, window };
}

test("pill text is at least 13px and icons are larger at 100%", () => {
  assert.ok(size(".action-detail") >= 13);
  assert.ok(size(".action-detail strong") >= 13);
  assert.ok(size(".action-detail > span") >= 13);
  assert.ok(size(".action-bubble svg", "width") >= 24);
  assert.doesNotMatch(
    css,
    /\.action-bubble\s*\{[^}]*transition:\s*width/,
    "width is animated in JS so layout can follow it",
  );
});

test("auto explain shows a visible on-state on its pill and offers the same on Blink", () => {
  const { menu } = mount();
  const pill = menu.buttons[4];
  assert.equal(pill.getAttribute("aria-pressed"), "false");
  assert.notEqual(pill.dataset.on, "true");
  menu.setAuto(true);
  assert.equal(pill.getAttribute("aria-pressed"), "true");
  assert.equal(pill.dataset.on, "true");
  assert.match(pill.getAttribute("aria-label"), /已開啟/);
  assert.match(pill.querySelector(".action-detail span").textContent, /已開啟/);
  assert.match(
    css,
    /\.action-bubble\[data-on="true"\]::after/,
    "a mark shows on the collapsed pill",
  );
  menu.setAuto(false);
  assert.equal(pill.getAttribute("aria-label"), "自動解說");
  assert.equal(
    pill.querySelector(".action-detail span").textContent,
    "畫面有大變化時簡短說明",
  );
  assert.match(
    html,
    /id="auto-badge"[^>]*hidden/,
    "Blink carries its own badge while auto explain is on",
  );
});
