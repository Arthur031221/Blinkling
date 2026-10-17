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
/** A session that answers a guide request with a guide of the test page and
 * anything else with one line, after `delay` ms. */
const fakeSession = (app, delay = 150) =>
  app.evaluate((_, delay) => {
    const listeners = new Set();
    const guide = {
      purpose: "A blue page with a sentence on it.",
      title: "Test page",
      sections: [
        {
          id: "s1",
          rect: { x: 20, y: 20, width: 500, height: 120 },
          label: "Heading",
          description: "The sentence at the top",
          paragraphs: ["It names the page."],
        },
        {
          id: "s2",
          rect: { x: 20, y: 300, width: 600, height: 300 },
          label: "Body",
          description: "The empty area",
          paragraphs: ["Nothing is written here."],
        },
      ],
      steps: [
        { id: "t1", note: "Read the heading.", regionIds: ["s1"] },
        { id: "t2", note: "Look at the empty body.", regionIds: ["s2"] },
      ],
    };
    globalThis.fakeTurns = [];
    globalThis.blinklingTest.features.setSession({
      subscribe: (f) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      send: async (turn) => {
        globalThis.fakeTurns.push({ ...turn, at: Date.now() });
        const text =
          turn.source === "guide"
            ? JSON.stringify(guide)
            : "This is a blue test page.\n\nIt has one sentence.";
        setTimeout(() => {
          for (const f of listeners) {
            f({
              type: "message",
              role: "assistant",
              content: [{ type: "text", text }],
            });
            f({ type: "done", turnId: turn.id });
          }
        }, delay);
      },
      stop: async () => {},
    });
  }, delay);
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardWindow = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.isVisible() && w.webContents.getURL().includes("surface=card"),
    );
    return w ? w.getBounds() : null;
  });
const cardShown = async (app) => Boolean(await cardWindow(app));
const overlayShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("/overlay/"),
    ),
  );
const regions = (app, kinds) =>
  app.evaluate(
    (_, kinds) =>
      globalThis.blinklingTest.features.overlay.regions?.(kinds) ?? [],
    kinds,
  );
const guideButton = (app, action) =>
  cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);
const turnCount = (app) => app.evaluate(() => globalThis.fakeTurns.length);
/** A real click on the middle of something in the card. */
async function clickIn(app, locator) {
  const win = await cardWindow(app);
  const box = await locator.boundingBox();
  const at = {
    x: win.x + box.x + box.width / 2,
    y: win.y + box.y + box.height / 2,
  };
  move(at.x, at.y);
  await new Promise((r) => setTimeout(r, 250));
  click(at.x, at.y);
}
const clickAt = async (at) => {
  move(at.x, at.y);
  await new Promise((r) => setTimeout(r, 250));
  click(at.x, at.y);
};
async function ready(app, page, delay) {
  const frame = await background(app);
  await fakeSession(app, delay);
  await place(app, "right", 0.5);
  await page.waitForTimeout(800);
  await reveal(page);
  const box = await bubble(page, "guide").boundingBox();
  const at = {
    x: frame.x + box.x + box.width / 2,
    y: frame.y + box.y + box.height / 2,
  };
  return { frame, start: () => clickAt(at) };
}
const emptySpot = (frame) => ({ x: frame.x + 140, y: frame.y + 170 });

test("a click on a mark, a label, the step panel or a button is never a background click, and a real background click ends the guide, also while it still looks and while all the marks show", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("guide_clicks", { suffix: "-324" });
  try {
    const { frame, start } = await ready(app, page, 3500);
    // 1. While "Looking at this screen..." shows: a background click ends it.
    await start();
    await expect(cardPage(app).locator(".gl-guide")).toContainText("…", {
      timeout: 4000,
    });
    rec.frame("looking");
    await clickAt(emptySpot(frame));
    await expect.poll(() => cardShown(app), { timeout: 3000 }).toBe(false);
    rec.frame("looking-closed");
    // The answer that arrives later draws nothing.
    await page.waitForTimeout(4200);
    expect(await overlayShown(app), "nothing drawn after the close").toBe(
      false,
    );
    expect(await cardShown(app)).toBe(false);
  } finally {
    await rec.stop();
    await app.close();
  }
  const second = await launch();
  const rec2 = record("guide_clicks_marks", { suffix: "-324" });
  try {
    const { app, page } = second;
    const { frame, start } = await ready(app, page, 300);
    await start();
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
      /1.*2/,
      {
        timeout: 8000,
      },
    );
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(true);
    // Every mark at once.
    await clickIn(app, guideButton(app, "guide-overview"));
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(2);
    await page.waitForTimeout(600);
    rec2.frame("all-marks");
    const parts = await regions(app);
    const kinds = new Set(parts.map((r) => r.kind));
    console.log(
      `guide clicks: regions ${[...kinds].join(", ")} (${parts.length})`,
    );
    expect(kinds.has("badge") || kinds.has("label")).toBe(true);
    // A click on each kind of thing the guide draws leaves everything up.
    for (const kind of ["badge", "label"]) {
      const one = parts.find((r) => r.kind === kind);
      if (!one) continue;
      await clickAt({ x: one.x + one.width / 2, y: one.y + one.height / 2 });
      await page.waitForTimeout(600);
      expect(await overlayShown(app), `${kind}: marks stay`).toBe(true);
      expect(await cardShown(app), `${kind}: card stays`).toBe(true);
      rec2.frame(`after-${kind}`);
    }
    // A click on a mark shows the step it is about; the list comes back by its button.
    await clickIn(app, guideButton(app, "guide-overview"));
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(2);
    // The step panel and its buttons, too.
    await clickIn(app, cardPage(app).locator(".gl-guide-step").nth(1));
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/2.*2/);
    await clickIn(app, cardPage(app).locator(".gl-guide-head"));
    await page.waitForTimeout(500);
    expect(await overlayShown(app), "panel: marks stay").toBe(true);
    expect(await cardShown(app), "panel: card stays").toBe(true);
    await clickIn(app, guideButton(app, "guide-back"));
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/1.*2/);
    rec2.frame("after-panel");
    // Back on the overview: a click on the page behind ends everything.
    await clickIn(app, guideButton(app, "guide-overview"));
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(2);
    await clickAt(emptySpot(frame));
    await expect.poll(() => cardShown(app), { timeout: 3000 }).toBe(false);
    await expect.poll(() => overlayShown(app), { timeout: 3000 }).toBe(false);
    rec2.frame("closed");
  } finally {
    await rec2.stop();
    await second.app.close();
  }
});

test("a closed guide comes back from the card with no new run of the model, from step 1 and with its place in the tour", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("guide_reopen", { suffix: "-324" });
  try {
    const { start } = await ready(app, page, 300);
    await start();
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
      /1.*2/,
      {
        timeout: 8000,
      },
    );
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(true);
    const asked = await turnCount(app);
    expect(asked).toBe(1);
    await clickIn(app, guideButton(app, "guide-next"));
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/2.*2/);
    rec.frame("step-2");
    await clickIn(app, guideButton(app, "guide-dismiss"));
    await expect.poll(() => overlayShown(app), { timeout: 4000 }).toBe(false);
    await expect(guideButton(app, "guide-again")).toBeVisible({
      timeout: 3000,
    });
    await page.waitForTimeout(400);
    rec.frame("offer");
    await clickIn(app, guideButton(app, "guide-again"));
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
      /1.*2/,
      {
        timeout: 5000,
      },
    );
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(600);
    rec.frame("again");
    expect(await turnCount(app), "no new run of the model").toBe(asked);
    // The same works after Esc.
    await guideButton(app, "guide-dismiss").click();
    await expect(guideButton(app, "guide-again")).toBeVisible({
      timeout: 3000,
    });
    expect(await turnCount(app)).toBe(asked);
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a guide opens on step 1 of N, shown in the card's language, and every step at once is one clear button away", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("guide_steps", { suffix: "-324" });
  try {
    const { start } = await ready(app, page, 300);
    await start();
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
      /1.*2/,
      {
        timeout: 8000,
      },
    );
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "Read the heading.",
    );
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(0);
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(true);
    // Only the first step's mark is up.
    await page.waitForTimeout(700);
    const first = await regions(app, ["badge", "label"]);
    console.log(`guide steps: ${first.length} badges and labels on step 1`);
    expect(first.length).toBeGreaterThan(0);
    rec.frame("step-1");
    await clickIn(app, guideButton(app, "guide-overview"));
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(2);
    await page.waitForTimeout(700);
    const all = await regions(app, ["badge", "label"]);
    console.log(`guide steps: ${all.length} badges and labels on show all`);
    expect(all.length).toBeGreaterThan(first.length);
    rec.frame("all-steps");
  } finally {
    await rec.stop();
    await app.close();
  }
});
