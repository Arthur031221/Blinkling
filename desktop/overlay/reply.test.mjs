import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGuide,
  guideDrawings,
  guidePrompt,
  GuideError,
} from "./schema.mjs";
const capture = (
  scale = 1,
  region = { x: 0, y: 0, width: 800, height: 600 },
) => ({
  display: {
    id: "2",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    scaleFactor: scale,
  },
  region,
  pixelWidth: Math.round(region.width * scale),
  pixelHeight: Math.round(region.height * scale),
});
const model = () => ({
  purpose: "這是一份銷售報告。",
  sections: [
    {
      id: "title",
      label: "標題",
      description: "報告的標題。",
      paragraphs: ["2025 年度銷售"],
      rect: { x: 20, y: 20, width: 300, height: 60 },
    },
    {
      id: "table",
      label: "數據表",
      description: "各季銷售數字。",
      paragraphs: [],
      rect: { x: 40, y: 120, width: 500, height: 300 },
    },
    {
      id: "export",
      label: "匯出",
      description: "匯出報告。",
      paragraphs: [],
      rect: { x: 600, y: 520, width: 120, height: 40 },
    },
  ],
  steps: [
    {
      id: "s1",
      note: "先看標題。",
      regionIds: ["title"],
      arrows: [{ from: { x: 400, y: 40 }, to: { x: 320, y: 50 } }],
    },
    { id: "s2", note: "再看數據表。", regionIds: ["table"], arrows: [] },
    { id: "s3", note: "最後按匯出。", regionIds: ["export"], arrows: [] },
  ],
});
const json = (g) => JSON.stringify(g);
// Replies as they were recorded from the model: prose, fences and commentary.
const replies = {
  prose: (g) => `好的，以下是導覽：\n${json(g)}\n希望對你有幫助！`,
  fenceWithProse: (g) =>
    `Here you go:\n\n\`\`\`json\n${json(g)}\n\`\`\`\n\nLet me know {if} you need more.`,
  bracesInText: (g) => `Note {this} first. ${json(g)} Then {more}.`,
  bracesInStrings: (g) => json({ ...g, purpose: "支援 {json} 與 } 括號" }),
};
test("a reply with prose, fences or stray braces around the JSON still yields the guide", () => {
  for (const [name, wrap] of Object.entries(replies)) {
    const guide = parseGuide(wrap(model()), capture());
    assert.equal(guide.steps.length, 3, name);
    assert.equal(guide.sections.length, 3, name);
  }
  assert.equal(
    parseGuide(replies.bracesInStrings(model()), capture()).purpose,
    "支援 {json} 與 } 括號",
  );
});
test("one invalid region is dropped and the rest of the guide still renders", () => {
  for (const mutate of [
    (g) => (g.sections[1].rect = { x: 900, y: 900, width: 50, height: 50 }),
    (g) => (g.sections[1].rect.width = NaN),
    (g) => delete g.sections[1].rect,
    (g) => (g.sections[1].label = ""),
    (g) => g.sections.push({ ...g.sections[0] }),
    (g) => g.sections.push("junk"),
  ]) {
    const g = model();
    mutate(g);
    const parsed = parseGuide(replies.prose(g), capture());
    assert.deepEqual(
      parsed.sections.map((s) => s.id).filter((id) => id !== "table"),
      ["title", "export"],
    );
    // The step that named the dropped region goes with it; the others stay.
    if (!parsed.sections.some((s) => s.id === "table"))
      assert.deepEqual(
        parsed.steps.map((s) => s.id),
        ["s1", "s3"],
      );
    assert.ok(parsed.warnings.length > 0 || parsed.sections.length === 3);
  }
});
test("a region that only slightly leaves the capture is clamped, not dropped", () => {
  const g = model();
  g.sections[2].rect = { x: 700, y: 560, width: 120, height: 60 };
  const parsed = parseGuide(json(g), capture());
  assert.deepEqual(parsed.sections[2].rect, {
    x: 700,
    y: 560,
    width: 100,
    height: 40,
  });
});
test("one invalid step is dropped; arrows and unknown region ids are pruned", () => {
  const g = model();
  g.steps[1].note = "";
  g.steps[2].regionIds = ["ghost", "export"];
  g.steps[0].arrows.push({ from: { x: -5, y: 0 }, to: { x: 1, y: 1 } }, "bad");
  const parsed = parseGuide(json(g), capture());
  assert.deepEqual(
    parsed.steps.map((s) => s.id),
    ["s1", "s3"],
  );
  assert.deepEqual(parsed.steps[1].regionIds, ["export"]);
  assert.equal(parsed.steps[0].arrows.length, 1);
});
test("a missing or unusable purpose falls back to the first step instead of failing", () => {
  const g = model();
  delete g.purpose;
  assert.equal(parseGuide(json(g), capture()).purpose, "先看標題。");
});
test("only a reply with no usable step fails, with a GuideError", () => {
  for (const bad of [
    "抱歉，我看不到畫面。",
    "{}",
    json({ ...model(), steps: [] }),
    json({ ...model(), sections: [] }),
    json({
      ...model(),
      steps: [{ id: "x", note: "n", regionIds: ["ghost"], arrows: [] }],
    }),
    json({
      ...model(),
      sections: [
        {
          ...model().sections[0],
          rect: { x: 5000, y: 5000, width: 1, height: 1 },
        },
      ],
    }),
    "x".repeat(100001),
  ]) {
    assert.throws(
      () => parseGuide(bad, capture()),
      GuideError,
      bad.slice(0, 30),
    );
  }
});
test("boxes stay within 8 px of the target at 100/125/150/200% and with the window off the origin", () => {
  const target = { x: 40, y: 120, width: 400, height: 300 }; // DIP inside the region
  for (const scale of [1, 1.25, 1.5, 2])
    for (const region of [
      { x: 0, y: 0, width: 800, height: 600 },
      { x: 300, y: 140, width: 640, height: 480 },
      { x: 0, y: 0, width: 853, height: 480 }, // 1280x720 at 150% rounds the DIP size
    ]) {
      const c = capture(scale, region);
      const g = model();
      // The model reports physical pixels of the screenshot.
      const px = (v, axis) =>
        (v * c[axis === "x" ? "pixelWidth" : "pixelHeight"]) /
        region[axis === "x" ? "width" : "height"];
      g.sections[1].rect = {
        x: px(target.x, "x"),
        y: px(target.y, "y"),
        width: px(target.width, "x"),
        height: px(target.height, "y"),
      };
      const box = guideDrawings(parseGuide(json(g), c), c)[1].rect;
      const want = {
        x: region.x + target.x,
        y: region.y + target.y,
        width: target.width,
        height: target.height,
      };
      for (const k of ["x", "y", "width", "height"])
        assert.ok(
          Math.abs((box[k] - want[k]) * scale) <= 8,
          `${scale} ${JSON.stringify(region)} ${k}`,
        );
      for (const a of guideDrawings(parseGuide(json(g), c), c).flatMap(
        (d) => d.arrows,
      )) {
        assert.ok(a.from.x >= 0 && a.to.y <= 600 + region.y);
      }
    }
});
test("a region reaching the far edge of a fractional display never exceeds its bounds", () => {
  const c = capture(1.5, { x: 0, y: 0, width: 853, height: 480 });
  const g = model();
  g.sections[0].rect = {
    x: 0,
    y: 0,
    width: c.pixelWidth,
    height: c.pixelHeight,
  };
  const [d] = guideDrawings(parseGuide(json(g), c), c);
  assert.ok(d.rect.x + d.rect.width <= 853 && d.rect.y + d.rect.height <= 480);
});
test("the prompt pins the reply language to the user's, including proper Traditional Chinese", () => {
  const c = capture();
  const zh = guidePrompt(c, "", "zh-TW");
  assert.match(zh, /Traditional Chinese/);
  assert.match(
    zh,
    /the purpose and every label, description, paragraph and note/i,
  );
  assert.match(zh, /never mix languages/i);
  assert.match(guidePrompt(c, "", "ja-JP"), /Japanese/);
  assert.match(guidePrompt(c, "", "en-US"), /English/);
  assert.match(guidePrompt(c, "", "zh-CN"), /Simplified Chinese/);
  // An unknown tag still pins to the screen's own language rather than leaving it open.
  assert.match(
    guidePrompt(c, "", ""),
    /language of the text visible on the screen/i,
  );
});
test("labels in the recorded zh-TW reply are carried through to the drawings unchanged", () => {
  const c = capture();
  const drawings = guideDrawings(parseGuide(json(model()), c), c);
  assert.deepEqual(
    drawings.map((d) => d.label),
    ["標題", "數據表", "匯出"],
  );
});
