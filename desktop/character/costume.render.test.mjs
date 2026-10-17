import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountBlink } from "./index.mjs";
import { COSTUME_FOR, FAMILIES, EFFORTS, moveFor } from "./costume.mjs";

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
  sonnet: 'fill-opacity=".18"',
  haiku: "#ee6a56",
  fable: "#7c5fc4",
};
const worn = (blink) =>
  Object.values(MARK).filter((m) => blink.svg.innerHTML.includes(m));

test("each model's outfit shows on Blink and is gone after the costume time", () => {
  const seen = new Set();
  for (const family of FAMILIES) {
    const blink = rig();
    const o = { costumeAt: 1, costume: { family, effort: "medium" } };
    run(blink, o, 0, 1 + moveFor("medium") + 0.5);
    assert.deepEqual(worn(blink), [MARK[family]], family);
    seen.add(blink.svg.innerHTML);
    run(blink, o, 1 + COSTUME_FOR, 1 + COSTUME_FOR + 1.5);
    assert.deepEqual(worn(blink), [], `${family} is not taken off`);
  }
  assert.equal(seen.size, FAMILIES.length);
});

test("Blink wears nothing without a change", () => {
  const blink = rig();
  run(blink, { costumeAt: -100 }, 0, 2);
  assert.deepEqual(worn(blink), []);
  run(blink, { costumeAt: -100, costume: null }, 2, 3);
  assert.deepEqual(worn(blink), []);
});

test("every effort plays its own move, and the reduced version holds still", () => {
  const MOVING = ["yaw", "L", "R", "legL", "legR", "front", "eyes", "mouth"];
  for (const reduced of [false, true]) {
    const looks = new Set();
    for (const effort of EFFORTS) {
      const blink = rig();
      const o = {
        costumeAt: 1,
        costume: { family: "sonnet", effort, reduced },
      };
      run(blink, o, 0, 1 + moveFor(effort) * 0.4);
      const a = blink.pose(1 + moveFor(effort) * 0.4, o);
      const b = blink.pose(1 + moveFor(effort) * 0.6, o);
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
