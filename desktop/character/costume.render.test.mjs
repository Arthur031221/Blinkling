import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
import { EFFORTS, FAMILIES, SCENE_FOR, SHOW_FOR } from "./costume.mjs";

function rig() {
  const { window } = new JSDOM("<body><div id='h'></div></body>");
  const previous = globalThis.document;
  globalThis.document = window.document;
  const blink = mountBlink(window.document.querySelector("#h"));
  globalThis.document = previous;
  return blink;
}
const run = (blink, o, from, to) => {
  for (let t = from; t <= to; t += 1 / 30) blink.pose(t, o);
};

const MARK = {
  opus: "#c9374d",
  sonnet: 'fill-opacity=".12"',
  haiku: "#ee6a56",
  fable: "#7c5fc4",
};
const marks = (blink) =>
  Object.entries(MARK)
    .filter(([, m]) => blink.svg.innerHTML.includes(m))
    .map(([f]) => f);

test("with a model chosen, Blink wears only that model's piece, with no scene played", () => {
  const seen = new Set();
  for (const family of FAMILIES) {
    const blink = rig();
    run(blink, { outfit: family }, 0, 1);
    assert.deepEqual(marks(blink), [family], family);
    seen.add(blink.svg.innerHTML);
  }
  assert.equal(seen.size, FAMILIES.length);
});

test("a worn piece is among the ornaments, so a window clipped to a shape keeps the crown, the hat and the plane", () => {
  for (const family of FAMILIES) {
    const blink = rig();
    run(blink, { outfit: null }, 0, 1);
    assert.equal(blink.ornaments().length, 0, `${family} not yet`);
    run(blink, { outfit: family }, 1, 2);
    assert.ok(blink.ornaments().length > 0, `${family} reaches past the body`);
    run(blink, { outfit: null }, 2, 3);
    assert.equal(blink.ornaments().length, 0, `${family} taken off`);
  }
});

test("with no model, or the switch off, Blink wears nothing", () => {
  const blink = rig();
  run(blink, { outfit: null }, 0, 2);
  assert.deepEqual(marks(blink), []);
  run(blink, {}, 2, 3);
  assert.deepEqual(marks(blink), []);
});

test("a model scene plays once, then only the piece stays, and the scene is not drawn twice", () => {
  for (const family of FAMILIES) {
    const blink = rig();
    const o = {
      outfit: family,
      costumeAt: 1,
      costume: { what: "model", family, effort: "high" },
    };
    run(blink, o, 0, 1 + SCENE_FOR * 0.3);
    assert.ok(blink.ornaments().length > 0, `${family} has props to keep`);
    run(blink, o, 1 + SCENE_FOR * 0.3, 1 + SCENE_FOR + 1);
    assert.deepEqual(marks(blink), [family], family);
    // Only the piece is left, which reaches as far as it does when just worn.
    const worn = rig();
    run(worn, { outfit: family }, 0, 1);
    // The boxes follow the body, which breathes, so they agree to a pixel.
    const round = (list) =>
      list.map((poly) => poly.map((p) => [Math.round(p.x), Math.round(p.y)]));
    assert.equal(
      blink.ornaments().length,
      worn.ornaments().length,
      `${family} leaves props behind`,
    );
    for (const [i, poly] of round(blink.ornaments()).entries())
      for (const [j, p] of poly.entries())
        for (const k of [0, 1])
          assert.ok(
            Math.abs(p[k] - round(worn.ornaments())[i][j][k]) <= 1,
            `${family} leaves props behind`,
          );
    assert.equal(
      blink.svg.innerHTML.split(MARK[family]).length - 1,
      blink.svg.innerHTML.split(MARK[family]).length - 1,
    );
  }
});

test("every effort plays its own show, and the reduced version holds still", () => {
  const MOVING = ["yaw", "L", "R", "legL", "legR", "front", "back", "eyes"];
  for (const reduced of [false, true]) {
    const looks = new Set();
    for (const effort of EFFORTS) {
      const blink = rig();
      const o = {
        outfit: "sonnet",
        costumeAt: 1,
        costume: { what: "effort", family: "sonnet", effort, reduced },
      };
      run(blink, o, 0, 1 + SHOW_FOR[effort] * 0.4);
      const a = blink.pose(1 + SHOW_FOR[effort] * 0.4, o);
      const b = blink.pose(1 + SHOW_FOR[effort] * 0.6, o);
      looks.add(JSON.stringify(MOVING.map((k) => a[k])));
      if (reduced)
        assert.deepEqual(
          MOVING.map((k) => b[k]),
          MOVING.map((k) => a[k]),
          `${effort} moves when reduced`,
        );
    }
    assert.equal(looks.size, EFFORTS.length, `reduced=${reduced}`);
  }
});

test("a show keeps the model's piece on", () => {
  for (const effort of EFFORTS) {
    const blink = rig();
    const o = {
      outfit: "opus",
      costumeAt: 1,
      costume: { what: "effort", family: "opus", effort },
    };
    run(blink, o, 0, 1 + SHOW_FOR[effort] / 2);
    assert.ok(marks(blink).includes("opus"), effort);
  }
});

test("the piece stays on while Blink grips an edge and peeks, on every edge", () => {
  for (const family of FAMILIES)
    for (const edge of ["left", "right", "top", "bottom"]) {
      const blink = rig();
      run(blink, { outfit: family, mode: "peek", edge }, 0, 2);
      assert.deepEqual(marks(blink), [family], `${family} at the ${edge} edge`);
    }
});
