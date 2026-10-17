import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFORTS,
  FAMILIES,
  SCENE_FOR,
  SHOW_FOR,
  costumeChange,
  costumePlay,
  playFor,
  worn,
} from "./costume.mjs";
import { drawBlink } from "./rig.mjs";

const model = (family, effort = "high") => ({ what: "model", family, effort });
const effort = (e) => ({ what: "effort", family: "opus", effort: e });
const frames = (change, step = 1 / 30) => {
  const out = [];
  for (let k = 0; k <= playFor(change); k += step)
    out.push([k, costumePlay(change, k, false)]);
  return out;
};
const props = (p) =>
  ["back", "mid", "behind", "front", "attach"].reduce(
    (n, k) =>
      n + ((p[k] ?? "").match(/<(path|circle|ellipse|rect)/g) ?? []).length,
    0,
  );

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

test("there are four models and five efforts", () => {
  assert.deepEqual(FAMILIES, ["opus", "sonnet", "haiku", "fable"]);
  assert.deepEqual(EFFORTS, ["low", "medium", "high", "xhigh", "max"]);
});

test("a play is short, and the efforts last longer as they climb", () => {
  assert.ok(SCENE_FOR >= 2 && SCENE_FOR <= 4);
  let before = 0;
  for (const e of EFFORTS) {
    assert.ok(SHOW_FOR[e] >= 2 && SHOW_FOR[e] <= 4.5, e);
    assert.ok(SHOW_FOR[e] > before, `${e} is not longer than the one below`);
    before = SHOW_FOR[e];
  }
  assert.equal(playFor(model("opus")), SCENE_FOR);
  assert.equal(playFor(effort("max")), SHOW_FOR.max);
});

test("a play is gone outside its window and for a name that is not ours", () => {
  for (const f of FAMILIES) {
    assert.equal(costumePlay(model(f), -0.1), null);
    assert.equal(costumePlay(model(f), SCENE_FOR + 0.01), null);
    assert.ok(costumePlay(model(f), SCENE_FOR / 2));
  }
  for (const e of EFFORTS) {
    assert.equal(costumePlay(effort(e), -0.1), null);
    assert.equal(costumePlay(effort(e), SHOW_FOR[e] + 0.01), null);
  }
  assert.equal(costumePlay(model("gpt"), 1), null);
  assert.equal(costumePlay(null, 1), null);
});

test("each model has its own scene, with props, and it ends in that model's piece alone", () => {
  const seen = new Set();
  for (const f of FAMILIES) {
    const all = frames(model(f), 0.1);
    seen.add(JSON.stringify(all.map(([, p]) => [p.back, p.mid, p.front])));
    assert.ok(
      Math.max(...all.map(([, p]) => props(p))) >= 8,
      `${f} has too few props`,
    );
    const end = costumePlay(model(f), SCENE_FOR);
    const piece = worn(f, { yaw: 0, t: SCENE_FOR });
    assert.equal(end.attach ?? "", piece.attach, `${f} ends in another piece`);
    assert.equal(end.faceExtra ?? "", piece.faceExtra, f);
    for (const layer of ["back", "mid", "front", "behind"])
      assert.ok(!(end[layer] ?? "").includes("<"), `${f} leaves ${layer}`);
  }
  assert.equal(seen.size, FAMILIES.length);
});

test("the pieces are different for each model and never sit on the eyes or the mouth", () => {
  const pieces = FAMILIES.map((f) => worn(f, { yaw: 0, t: 0 }));
  assert.equal(new Set(pieces.map((p) => JSON.stringify(p))).size, 4);
  const ys = (svg) =>
    [...svg.matchAll(/ (?:cy|y)="(-?[\d.]+)"/g)].map((m) => +m[1]);
  // Crown and hat sit above the head; the scarf is below the mouth.
  for (const f of ["opus", "fable"])
    assert.ok(Math.max(...ys(worn(f).attach)) <= 42, f);
  const scarf = worn("haiku", { yaw: 0, t: 0 }).attach;
  assert.ok(scarf.includes("#ee6a56"));
  // The scarf follows the body as it turns, and still starts under the mouth.
  for (const yaw of [-60, -30, 0, 30, 60]) {
    const band = worn("haiku", { yaw, t: 0 }).attach.match(
      /^<g class="prop"><path d="M([-\d.]+) ([-\d.]+)/,
    );
    assert.ok(band, `scarf at ${yaw}`);
    assert.ok(+band[2] >= 140, `scarf at ${yaw} is at y ${band[2]}`);
  }
  // The glasses are clear rings: the eyes stay seen through them.
  const glass = worn("sonnet").faceExtra;
  assert.ok(glass.includes('fill-opacity=".12"'));
  assert.equal(worn("gpt").attach, "");
});

test("every scene and show draws, keeps the legs whole and gives boxes inside a sane range", () => {
  const plays = [
    ...FAMILIES.map((f) => model(f, "max")),
    ...EFFORTS.map((e) => effort(e)),
  ];
  for (const change of plays) {
    for (const [k, p] of frames(change, 0.05)) {
      assert.equal(p.clipY, undefined, `${change.what} clips the body`);
      for (const side of ["legL", "legR"])
        assert.ok(!p[side] || p[side].every(Number.isFinite), side);
      const { bounds, ...fields } = p;
      const svg = drawBlink({ ...fields, noShadow: true }, "t");
      assert.ok(svg.includes("blink-body"), `${change.family} ${k}`);
      for (const box of bounds ?? []) {
        assert.equal(box.length, 4);
        assert.ok(box.every(Number.isFinite));
        assert.ok(box[2] > box[0] && box[3] > box[1]);
        assert.ok(box[2] - box[0] < 520 && box[3] - box[1] < 520);
      }
    }
  }
});

test("five efforts, five different shows, and the energy climbs", () => {
  const looks = new Set();
  const area = {},
    most = {};
  for (const e of EFFORTS) {
    const all = frames(effort(e), 0.1);
    looks.add(JSON.stringify(all.map(([, p]) => [p.y, p.L, p.R, p.roll])));
    most[e] = Math.max(...all.map(([, p]) => props(p)));
    area[e] = Math.max(
      ...all.map(([, p]) =>
        (p.bounds ?? []).reduce(
          (a, b) => Math.max(a, (b[2] - b[0]) * (b[3] - b[1])),
          0,
        ),
      ),
    );
  }
  assert.equal(looks.size, EFFORTS.length);
  assert.ok(most.max > most.xhigh && most.xhigh >= most.high, "props climb");
  assert.ok(most.high > most.low, "high has more than low");
  assert.ok(area.low < area.high && area.low < area.max, "low is the smallest");
});

test("the signature things are where the design says", () => {
  const has = (change, text) =>
    frames(change, 0.1).some(([, p]) =>
      ["back", "mid", "front", "attach", "behind"].some((k) =>
        (p[k] ?? "").includes(text),
      ),
    );
  assert.ok(has(effort("low"), 'stroke-width="3.2"'), "low steams a cup");
  assert.ok(has(effort("medium"), "#ffd25e"), "medium juggles balls");
  assert.ok(has(effort("high"), "#3b6fd6"), "high lifts plates");
  assert.ok(has(effort("xhigh"), "#d93d4e"), "xhigh plays a guitar");
  assert.ok(has(effort("max"), "#ff8a2e"), "max lights a rocket pack");
});

test("reduced motion gives one still pose with no props moving", () => {
  for (const e of EFFORTS) {
    const a = costumePlay(effort(e), 0.1, true),
      b = costumePlay(effort(e), SHOW_FOR[e] * 0.6, true);
    assert.deepEqual(a, b, e);
    assert.equal(props(a), 0);
  }
  for (const f of FAMILIES) {
    const a = costumePlay(model(f), 0.1, true);
    assert.deepEqual(a, costumePlay(model(f), SCENE_FOR * 0.6, true), f);
  }
  assert.notDeepEqual(
    costumePlay(effort("low"), 0.1, true),
    costumePlay(effort("max"), 0.1, true),
  );
});
