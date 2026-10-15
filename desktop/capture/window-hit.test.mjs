import { test } from "node:test";
import assert from "node:assert/strict";
import { windowAt, browserOf, chipAnchor } from "./window-hit.mjs";

const box = (x, y, width, height) => ({ x, y, width, height });
const wins = [
  { id: "top", bounds: box(100, 100, 300, 200) },
  { id: "mid", bounds: box(50, 50, 500, 400) },
  { id: "back", bounds: box(0, 0, 1280, 800) },
];

test("the frontmost window containing the point wins", () => {
  assert.equal(windowAt(wins, { x: 150, y: 150 }).id, "top");
  assert.equal(windowAt(wins, { x: 60, y: 60 }).id, "mid");
  assert.equal(windowAt(wins, { x: 900, y: 700 }).id, "back");
});

test("edges are inclusive on the left and top, exclusive on the right and bottom", () => {
  assert.equal(windowAt(wins, { x: 100, y: 100 }).id, "top");
  assert.equal(windowAt(wins, { x: 400, y: 150 }).id, "mid");
  assert.equal(windowAt(wins, { x: 150, y: 300 }).id, "mid");
});

test("no window under the point gives null, and so does an empty list", () => {
  assert.equal(windowAt([wins[0]], { x: 5, y: 5 }), null);
  assert.equal(windowAt([], { x: 5, y: 5 }), null);
  assert.equal(windowAt(undefined, { x: 5, y: 5 }), null);
});

test("windows with no area or a bad box are never hit", () => {
  assert.equal(
    windowAt([{ id: "flat", bounds: box(0, 0, 0, 50) }], { x: 0, y: 10 }),
    null,
  );
  assert.equal(windowAt([{ id: "bad" }], { x: 0, y: 10 }), null);
});

test("Chrome and Edge are told apart from their class, app name or title", () => {
  for (const win of [
    { appClass: "google-chrome" },
    { appClass: "Google-chrome" },
    { app: "Google Chrome" },
    { app: "chrome" },
    { app: "chrome.exe" },
    { title: "Inbox - Google Chrome" },
    { appClass: "chromium" },
    { app: "Chromium" },
  ])
    assert.equal(browserOf(win), "chrome", JSON.stringify(win));
  for (const win of [
    { appClass: "microsoft-edge" },
    { app: "Microsoft Edge" },
    { app: "msedge.exe" },
    { title: "News - Microsoft Edge" },
    { title: "News and 2 more pages - Personal - Microsoft​ Edge" },
  ])
    assert.equal(browserOf(win), "edge", JSON.stringify(win));
});

test("other apps, including other browsers, are not offered the full-page chip", () => {
  for (const win of [
    { app: "Firefox" },
    { appClass: "firefox" },
    { app: "Safari" },
    { app: "Mousepad" },
    { appClass: "evince" },
    { title: "Chrome notes.txt - Mousepad" },
    { title: "Google Chrome - Mousepad" },
    { app: "Chrome Remote Desktop" },
    {},
    null,
  ])
    assert.equal(browserOf(win), null, JSON.stringify(win));
});

test("the chip sits inside the window, near the top right, and stays on screen", () => {
  const display = box(0, 0, 1280, 800);
  const anchor = chipAnchor(box(100, 100, 600, 400), display, {
    width: 80,
    height: 28,
  });
  assert.ok(anchor.x >= 100 && anchor.x + 80 <= 700);
  assert.ok(anchor.y >= 100 && anchor.y + 28 <= 500);
  assert.ok(anchor.x > 100 + 300, "right half");
  // A window larger than the display keeps the chip on the display.
  const wide = chipAnchor(box(-200, -50, 2000, 900), display, {
    width: 80,
    height: 28,
  });
  assert.ok(wide.x >= 0 && wide.x + 80 <= 1280);
  assert.ok(wide.y >= 0 && wide.y + 28 <= 800);
  // A tiny window still gets an anchor inside the display.
  const tiny = chipAnchor(box(10, 10, 50, 20), display, {
    width: 80,
    height: 28,
  });
  assert.ok(tiny.x >= 0 && tiny.y >= 0);
});
