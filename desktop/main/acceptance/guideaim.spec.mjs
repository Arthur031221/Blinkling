import { test, expect } from "@playwright/test";
import { launch, move, click } from "./support.mjs";
import { background, reveal, bubble } from "./helpers.mjs";
import { record } from "./record.mjs";

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );
// Three regions in three corners of the 1280 x 800 test screen.
const REGIONS = [
  {
    id: "s1",
    label: "Address bar",
    rect: { x: 20, y: 20, width: 300, height: 80 },
  },
  { id: "s2", label: "Logo", rect: { x: 960, y: 20, width: 300, height: 80 } },
  {
    id: "s3",
    label: "Footer",
    rect: { x: 20, y: 660, width: 300, height: 120 },
  },
];
const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const fakeSession = (app) =>
  app.evaluate((_, regions) => {
    const listeners = new Set();
    const guide = {
      purpose: "A page with three parts.",
      title: "Test page",
      sections: regions.map((r) => ({
        ...r,
        description: r.label,
        paragraphs: [r.label],
      })),
      steps: regions.map((r) => ({
        id: `t-${r.id}`,
        note: `Look at the ${r.label}.`,
        regionIds: [r.id],
      })),
    };
    globalThis.blinklingTest.features.setSession({
      subscribe: (f) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      send: async (turn) => {
        setTimeout(() => {
          for (const f of listeners) {
            f({
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: JSON.stringify(guide) }],
            });
            f({ type: "done", turnId: turn.id });
          }
        }, 300);
      },
      stop: async () => {},
    });
  }, REGIONS);
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
/** The drawn stick as the screen sees it: where it starts and where it ends. */
const stick = (page) =>
  page.evaluate(() => {
    const path = document.querySelector('#blink path[stroke="#f1c75b"]');
    if (!path) return null;
    const m = path.ownerSVGElement.getScreenCTM();
    const [a, b] = path
      .getAttribute("d")
      .match(/-?[\d.]+/g)
      .map(Number)
      .reduce(
        (acc, n, i) =>
          i % 2 ? (acc.at(-1).push(n), acc) : (acc.push([n]), acc),
        [],
      );
    const at = ([x, y]) => ({
      x: m.a * x + m.c * y + m.e,
      y: m.b * x + m.d * y + m.f,
    });
    return { from: at(a), to: at(b) };
  });
const degrees = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("the pointer stick aims at the box of the step being shown, on every step", async () => {
  test.setTimeout(150000);
  const { app, page } = await launch();
  const rec = record("guide_aim", { suffix: "-323" });
  try {
    const frame = await background(app);
    await fakeSession(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await reveal(page);
    const box = await bubble(page, "guide").boundingBox();
    const at = {
      x: frame.x + box.x + box.width / 2,
      y: frame.y + box.y + box.height / 2,
    };
    move(at.x, at.y);
    await page.waitForTimeout(300);
    click(at.x, at.y);
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
      /1.*3/,
      { timeout: 10000 },
    );
    const button = (action) =>
      cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);
    // The step header is readable: solid paper of its own, and no mask from the
    // history's top fade over it.
    const head = await cardPage(app).evaluate(() => {
      const node = document.querySelector(".gl-guide-head");
      const alpha = (c) => {
        const m = c.match(/[\d.]+/g).map(Number);
        return m.length > 3 ? m[3] : 1;
      };
      const masked = [];
      for (let e = node; e; e = e.parentElement)
        if (getComputedStyle(e).maskImage !== "none") masked.push(e.className);
      return {
        alpha: alpha(getComputedStyle(node).backgroundColor),
        masked,
      };
    });
    expect(head.alpha, "the header has solid paper").toBeGreaterThanOrEqual(
      0.9,
    );
    expect(head.masked, "no fade mask over the header").toEqual([]);
    const wrong = [];
    let shown = 0;
    for (const [edge, ratio] of [
      ["right", 0.5],
      ["right", 0.85],
      ["left", 0.5],
      ["bottom", 0.5],
      ["top", 0.5],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(1200);
      for (let i = 0; i < REGIONS.length; i++) {
        await cardPage(app)
          .locator(".gl-guide-head")
          .waitFor({ timeout: 5000 });
        for (; shown < i; shown++) await button("guide-next").click();
        for (; shown > i; shown--) await button("guide-back").click();
        await expect(cardPage(app).locator(".gl-guide")).toContainText(
          `Look at the ${REGIONS[i].label}.`,
        );
        await page.waitForTimeout(900);
        const s = await stick(page);
        const origin = await app.evaluate(() =>
          globalThis.blinklingTest.blink.getBounds(),
        );
        if (!s) {
          wrong.push(`${edge} ${ratio} step ${i + 1}: no stick`);
          continue;
        }
        const from = { x: origin.x + s.from.x, y: origin.y + s.from.y };
        const c = centre(REGIONS[i].rect);
        const want = degrees({ x: c.x - from.x, y: c.y - from.y });
        const got = degrees({ x: s.to.x - s.from.x, y: s.to.y - s.from.y });
        console.log(
          `${edge} ${ratio} step ${i + 1}: stick ${got.toFixed(0)} deg, box ${want.toFixed(0)} deg`,
        );
        if (apart(got, want) > 20)
          wrong.push(
            `${edge} ${ratio} step ${i + 1}: stick ${got.toFixed(0)}, box ${want.toFixed(0)}`,
          );
        rec.frame(`${edge}-${ratio}-step-${i + 1}`);
      }
    }
    expect(wrong, "the stick points at each step's box").toEqual([]);
  } finally {
    await rec.stop();
    await app.close();
  }
});
