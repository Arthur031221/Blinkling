import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateGuide,
  parseGuide,
  captureMatchesDisplay,
  guideRefs,
  stepNumbers,
} from "./schema.mjs";
import { drawGuide } from "./test-draw.mjs";
const capture = (scale = 1) => ({
  display: {
    id: "2",
    bounds: { x: -800, y: -200, width: 800, height: 600 },
    scaleFactor: scale,
  },
  region: { x: 0, y: 0, width: 800, height: 600 },
  pixelWidth: 800 * scale,
  pixelHeight: 600 * scale,
});
const guide = (scale = 1) => ({
  purpose: "Read the report.",
  sections: [
    {
      id: "main",
      label: "Report",
      description: "The report contains the results.",
      paragraphs: ["Sales rose."],
      rect: {
        x: 100 * scale,
        y: 90 * scale,
        width: 200 * scale,
        height: 120 * scale,
      },
    },
  ],
  steps: [
    {
      id: "read",
      note: "Read the main result.",
      regionIds: ["main"],
      arrows: [
        {
          from: { x: 80 * scale, y: 80 * scale },
          to: { x: 100 * scale, y: 90 * scale },
        },
      ],
    },
  ],
});
test("complete-screen guide schema retains paragraphs and tasks and maps pixels once", async () => {
  for (const scale of [1, 1.5, 2]) {
    const c = capture(scale);
    const parsed = validateGuide(guide(scale), c);
    const drawings = await drawGuide(parsed, c);
    assert.deepEqual(drawings[0].rect, {
      x: 100,
      y: 90,
      width: 200,
      height: 120,
    });
    assert.equal(parsed.sections[0].paragraphs[0], "Sales rose.");
    assert.ok(captureMatchesDisplay(c, { ...c.display, id: 2 }));
    assert.equal(
      captureMatchesDisplay(c, { ...c.display, scaleFactor: scale + 0.5 }),
      false,
    );
    assert.equal(
      captureMatchesDisplay(c, {
        ...c.display,
        bounds: { ...c.display.bounds, x: 0 },
      }),
      false,
    );
  }
});
test("rejects stale/unsafe/out-of-bounds model output and missing main content", () => {
  for (const mutate of [
    (g) => (g.sections[0].rect.x = 799),
    (g) => (g.sections[0].rect.width = NaN),
    (g) => (g.steps[0].regionIds = ["invented"]),
    (g) => g.sections.push(g.sections[0]),
    (g) => (g.purpose = ""),
    (g) => (g.sections = []),
    (g) => (g.steps = []),
    (g) => (g.steps[0].arrows[0].to.x = -1),
  ]) {
    const g = guide();
    mutate(g);
    assert.throws(() => validateGuide(g, capture()));
  }
  assert.equal(
    parseGuide("```json\n" + JSON.stringify(guide()) + "\n```", capture())
      .purpose,
    "Read the report.",
  );
  assert.throws(() => parseGuide("<script>alert(1)</script>", capture()));
});

const shot = { pixelWidth: 1000, pixelHeight: 800 };
const region = (id, y) => ({
  id,
  rect: { x: 10, y, width: 100, height: 40 },
  label: id,
  description: `${id} part`,
  paragraphs: [],
});
test("a guide keeps a short tour: at most ten steps, only the regions steps point at, numbered in the order the tour visits them", () => {
  const sections = Array.from({ length: 30 }, (_, i) =>
    region(`s${i}`, i * 20),
  );
  const steps = Array.from({ length: 14 }, (_, i) => ({
    id: `t${i}`,
    note: `Step ${i}`,
    // The tour starts at the lowest region on the screen.
    regionIds: [`s${20 - i}`],
  }));
  const guide = parseGuide(
    JSON.stringify({ purpose: "A page", sections, steps }),
    shot,
  );
  assert.equal(guide.steps.length, 10);
  assert.deepEqual(
    guide.sections.map((s) => s.id),
    steps.slice(0, 10).map((s) => s.regionIds[0]),
    "marks follow the steps, so mark 1 is where step 1 points",
  );
  assert.equal(guideRefs(guide).length, 10);
  assert.ok(guideRefs(guide).every((ref) => ref.kind === "frame"));
  assert.deepEqual(stepNumbers(guide, 3), [4]);
});
