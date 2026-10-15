import test from "node:test";
import assert from "node:assert/strict";
import { createGrumbler } from "./grumble.mjs";
import { strings, GRUMBLES } from "../renderer/strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";

const make = (extra = {}) => createGrumbler({ count: 8, ...extra });

test("quiet for a minute, then one line shows and goes after a few seconds", () => {
  const g = make({ random: () => 0 });
  assert.equal(g.tick(59_000, false), null);
  assert.equal(g.tick(60_000, false), 0);
  assert.equal(g.tick(66_000, false), 0, "still there");
  assert.equal(g.tick(67_000, false), null, "gone after the hold");
});

test("the next line comes a minute or more later and is never the same one", () => {
  const seen = [];
  let at = 0;
  const g = make({ random: () => 0.99 });
  for (let n = 0; n < 40; n++) {
    let line = null;
    while (line === null) line = g.tick((at += 1000), false);
    seen.push(line);
    while (g.tick((at += 1000), false) !== null);
  }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
  assert.ok(new Set(seen).size > 1);
});

test("the lines follow the random draw and stay in range", () => {
  for (const r of [0, 0.3, 0.7, 0.9999999]) {
    const g = make({ random: () => r });
    const line = g.tick(60_000, false);
    assert.ok(Number.isInteger(line) && line >= 0 && line < 8, String(r));
  }
});

test("busy keeps Blink quiet and starts the minute again", () => {
  const g = make({ random: () => 0 });
  g.tick(30_000, true);
  assert.equal(g.tick(89_000, false), null);
  assert.equal(g.tick(90_000, false), 0);
  assert.equal(g.tick(91_000, true), null, "busy takes the line away");
  assert.equal(g.tick(150_000, false), null);
});

test("a touch takes a shown line away and the quiet starts over", () => {
  const g = make({ random: () => 0 });
  assert.equal(g.tick(60_000, false), 0);
  g.touch(61_000);
  assert.equal(g.tick(62_000, false), null);
  assert.equal(
    g.tick(121_000, false),
    1,
    "again after a quiet minute, a different line",
  );
});

test("every locale has all the idle lines, each different and not empty", () => {
  for (const locale of LOCALES) {
    const lines = Array.from(
      { length: GRUMBLES },
      (_, i) => strings[locale][`grumble${i + 1}`],
    );
    assert.ok(
      lines.every((l) => typeof l === "string" && l.length > 3),
      locale,
    );
    assert.equal(new Set(lines).size, GRUMBLES, locale);
    assert.ok(
      lines.filter((l) => l.includes("Blink")).length >= 6,
      `${locale} speaks as Blink`,
    );
    assert.ok(
      lines.every((l) => !/[—–;]/.test(l)),
      `${locale} has no dashes or semicolons`,
    );
  }
});

test("the zh-TW lines are the ones the account holder gave", () => {
  assert.equal(strings["zh-TW"].grumble1, "Blink 好無聊……");
  assert.equal(strings["zh-TW"].grumble3, "Blink 肚子餓餓，想吃截圖");
});
