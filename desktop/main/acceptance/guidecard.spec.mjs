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
// Targets in the part of the 1280 x 800 test screen a card beside a Blink on
// the left edge opens over.
const REGIONS = [
  {
    id: "s1",
    label: "Logo",
    rect: { x: 180, y: 110, width: 140, height: 120 },
  },
  {
    id: "s2",
    label: "Headline",
    rect: { x: 330, y: 300, width: 330, height: 180 },
  },
  {
    id: "s3",
    label: "Read more",
    rect: { x: 200, y: 520, width: 260, height: 60 },
  },
];
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
const noteText = (app) =>
  app
    .windows()
    .find((p) => p.url().includes("/overlay/"))
    ?.evaluate(() => document.querySelector(".note p")?.textContent ?? "") ??
  "";
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardWindow = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.isVisible() && w.webContents.getURL().includes("surface=card"),
    );
    return w ? w.getBounds() : null;
  });
const overlayShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("/overlay/"),
    ),
  );
const meet = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function startGuide(app, page) {
  const frame = await background(app);
  await fakeSession(app);
  await place(app, "left", 0.55);
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
  await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/1.*3/, {
    timeout: 10000,
  });
}

test("during a guide the card keeps off the step's target, fits its window and takes a real click on End tour", async () => {
  test.setTimeout(150000);
  const { app, page } = await launch();
  const rec = record("guide_card", { suffix: "-324" });
  try {
    await startGuide(app, page);
    const button = (action) =>
      cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);
    const covered = [];
    const clipped = [];
    for (let i = 0; i < REGIONS.length; i++) {
      if (i > 0) await button("guide-next").click();
      // The step's words sit under its mark, not in the card.
      await expect
        .poll(() => noteText(app), { timeout: 5000 })
        .toContain(`Look at the ${REGIONS[i].label}.`);
      await page.waitForTimeout(900);
      const card = await cardWindow(app);
      console.log(
        `step ${i + 1}: card ${JSON.stringify(card)} target ${JSON.stringify(REGIONS[i].rect)}`,
      );
      if (meet(card, REGIONS[i].rect))
        covered.push(`step ${i + 1}: the card is over ${REGIONS[i].label}`);
      const fit = await cardPage(app).evaluate(() => {
        const edge = innerHeight;
        const last = [...document.querySelectorAll("textarea, button")]
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .reduce((m, r) => Math.max(m, r.bottom), 0);
        return { edge, last };
      });
      if (fit.last > fit.edge + 1)
        clipped.push(
          `step ${i + 1}: content ends ${fit.last}, window ${fit.edge}`,
        );
      rec.frame(`step-${i + 1}`);
    }
    expect(covered, "the card is out of the way of each target").toEqual([]);
    expect(clipped, "nothing in the card is cut off").toEqual([]);
    // A real press on End tour, through the window the pointer is over.
    const end = await button("guide-dismiss").boundingBox();
    const win = await cardWindow(app);
    click(win.x + end.x + end.width / 2, win.y + end.y + end.height / 2);
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(false);
    rec.frame("ended");
  } finally {
    await rec.stop();
    await app.close();
  }
});
