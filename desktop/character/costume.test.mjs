import test from "node:test";
import assert from "node:assert/strict";
import {
  COSTUME_FOR,
  FAMILIES,
  EFFORTS,
  costumeChange,
  costumeOutfit,
  costumeMove,
  moveFor,
} from "./costume.mjs";
import { drawBlink } from "./rig.mjs";

test("a model change and an effort change each name what to play, nothing else does", () => {
  const same = { family: "opus", effort: "high" };
  assert.equal(costumeChange(null, same), null, "startup plays nothing");
  assert.equal(
    costumeChange(same, { ...same }),
    null,
    "the same value plays nothing",
  );
  assert.deepEqual(costumeChange(same, { family: "haiku", effort: "high" }), {
    family: "haiku",
    effort: "high",
    what: "model",
  });
  assert.deepEqual(costumeChange(same, { family: "opus", effort: "low" }), {
    family: "opus",
    effort: "low",
    what: "effort",
  });
  assert.equal(costumeChange(same, { family: "gpt", effort: "high" }), null);
  assert.equal(costumeChange(same, { family: "opus", effort: "turbo" }), null);
});

test("a model name resolves to its family, with versions and ids", () => {
  assert.deepEqual(FAMILIES, ["opus", "sonnet", "haiku", "fable"]);
  assert.deepEqual(EFFORTS, ["low", "medium", "high", "xhigh", "max"]);
});

test("the costume lasts between four and six seconds", () => {
  assert.ok(COSTUME_FOR >= 4 && COSTUME_FOR <= 6);
  for (const e of EFFORTS) assert.ok(moveFor(e) < COSTUME_FOR);
});

test("each model has its own outfit and none is empty", () => {
  const seen = new Set();
  for (const f of FAMILIES) {
    const o = costumeOutfit(f, 2);
    const all = JSON.stringify(o);
    assert.ok(all.length > 60, f);
    assert.ok(!seen.has(all), `${f} repeats another outfit`);
    seen.add(all);
  }
  assert.ok(
    costumeOutfit("opus", 2).behind.includes("<path"),
    "opus has a cape behind",
  );
  assert.ok(
    costumeOutfit("sonnet", 2).faceExtra.includes("circle") ||
      costumeOutfit("sonnet", 2).faceExtra.includes("rect"),
    "sonnet has glasses",
  );
});

test("the outfit pops in and out and is gone outside its window", () => {
  for (const f of FAMILIES) {
    assert.equal(costumeOutfit(f, -1), null);
    assert.equal(costumeOutfit(f, COSTUME_FOR + 0.01), null);
    assert.ok(costumeOutfit(f, COSTUME_FOR / 2));
  }
});

test("every effort has its own move and the legs stay whole", () => {
  const keys = new Set();
  for (const e of EFFORTS) {
    const shape = [];
    for (let k = 0; k < moveFor(e); k += 0.05) {
      const p = costumeMove(e, k, false);
      assert.equal(p.clipY, undefined, `${e} clips the body`);
      for (const side of ["legL", "legR"]) {
        const l = p[side];
        assert.ok(
          !l || (l.length === 2 && l.every(Number.isFinite)),
          `${e} ${side}`,
        );
      }
      // A rig pose draws without throwing and keeps both legs.
      const svg = drawBlink({ ...p, noShadow: true }, "t");
      assert.ok(svg.includes("blink-body"));
      shape.push(JSON.stringify([p.y, p.L, p.R, p.yaw, p.roll]));
    }
    keys.add(shape.join("|"));
  }
  assert.equal(keys.size, EFFORTS.length);
});

test("xhigh and max spin round and throw stars, the lower efforts stay facing front", () => {
  const swings = {};
  for (const e of ["xhigh", "max"]) {
    let top = 0,
      sparks = false,
      flips = 0,
      last = 0;
    for (let k = 0; k < moveFor(e); k += 0.02) {
      const p = costumeMove(e, k, false);
      top = Math.max(top, Math.abs(p.yaw ?? 0));
      sparks ||= (p.front ?? "").includes("<path");
      const sign = Math.sign(p.yaw ?? 0);
      if (sign && last && sign !== last) flips++;
      if (sign) last = sign;
    }
    assert.ok(top >= 60, `${e} turns ${top}`);
    assert.ok(sparks, e);
    swings[e] = flips;
  }
  assert.ok(swings.max > swings.xhigh, "max spins more than xhigh");
  for (const e of ["low", "medium", "high"]) {
    for (let k = 0; k < moveFor(e); k += 0.05)
      assert.ok(Math.abs(costumeMove(e, k, false).yaw ?? 0) < 20, e);
  }
});

test("reduced motion gives one still pose, not a move", () => {
  for (const e of EFFORTS) {
    const a = costumeMove(e, 0.1, true),
      b = costumeMove(e, moveFor(e) * 0.6, true);
    assert.deepEqual(a, b, e);
    assert.ok(!(a.front ?? "").includes("animate"));
  }
  assert.notDeepEqual(
    costumeMove("low", 0.1, true),
    costumeMove("max", 0.1, true),
  );
});
