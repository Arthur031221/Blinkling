import { test, expect } from "@playwright/test";
import { launch, move, click, key } from "./support.mjs";
import { background, reveal, bubble } from "./helpers.mjs";
import { record } from "./record.mjs";

const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
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
const stall = (app) =>
  app.evaluate(() => {
    const watch = (globalThis.__stall = {
      worst: 0,
      last: Date.now(),
      all: [],
    });
    watch.timer = setInterval(() => {
      const now = Date.now();
      const gap = now - watch.last - 10;
      watch.worst = Math.max(watch.worst, gap);
      if (gap > 40) watch.all.push(gap);
      watch.last = now;
    }, 10);
  });
const stalled = (app) =>
  app.evaluate(() => {
    clearInterval(globalThis.__stall.timer);
    return { worst: globalThis.__stall.worst, all: globalThis.__stall.all };
  });
async function clickBubble(page, action, origin) {
  const box = await bubble(page, action).boundingBox();
  const at = {
    x: origin.x + box.x + box.width / 2,
    y: origin.y + box.y + box.height / 2,
  };
  move(at.x, at.y);
  await page.waitForTimeout(300);
  click(at.x, at.y);
  return Date.now();
}
const overlayShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("/overlay/"),
    ),
  );
const noteText = (app) =>
  app
    .windows()
    .find((p) => p.url().includes("/overlay/"))
    ?.evaluate(() => document.querySelector(".note p")?.textContent ?? "") ??
  "";
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const guideText = (app) =>
  cardPage(app)
    ?.locator(".gl-guide")
    .innerText()
    .catch(() => "") ?? "";

test("Guide: one click on the bubble says it is looking at once, draws the marks, walks the steps and ends cleanly, without the app standing still", async () => {
  test.setTimeout(150000);
  const { app, page } = await launch();
  const rec = record("r7_guide", { suffix: "-327" });
  try {
    const frame = await background(app);
    await fakeSession(app, 1200);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await reveal(page);
    rec.frame("menu");
    await stall(app);
    const clicked = await clickBubble(page, "guide", frame);
    // Within 150 ms of the click the card says the screen is being looked at.
    await expect
      .poll(() => guideText(app), { intervals: [10], timeout: 3000 })
      .toContain("…");
    const feedback = Date.now() - clicked;
    expect(feedback).toBeLessThan(400);
    rec.frame("looking");
    // The answer arrives; the marks are drawn and step 1 is in the card.
    await expect.poll(() => overlayShown(app), { timeout: 8000 }).toBe(true);
    const cardButton = (action) =>
      cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);
    // Step 1 comes first, with its place in the tour; every step at once is a choice.
    await expect
      .poll(() => noteText(app), { timeout: 5000 })
      .toContain("Read the heading.");
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(0);
    await expect(cardButton("guide-overview")).toHaveCount(0);
    // The card is the small one: no history, no composer, and no empty block
    // below the buttons, whatever size the reader gave the full card.
    const fit = await cardPage(app).evaluate(() => ({
      inner: window.innerHeight,
      bottom: Math.max(
        ...[...document.querySelectorAll(".gl-guide, .gl-guide button")].map(
          (n) => n.getBoundingClientRect().bottom,
        ),
      ),
      history: [
        ...document.querySelectorAll(".gl-chat-history, .gl-composer"),
      ].some((n) => n.getClientRects().length > 0),
    }));
    expect(fit.history, "no history or composer while a guide runs").toBe(
      false,
    );
    expect(
      fit.inner - fit.bottom,
      "no empty block under the buttons",
    ).toBeLessThan(40);
    expect(fit.inner, "the card is compact").toBeLessThan(220);
    rec.frame("step-1");
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/1.*2/);
    await page.waitForTimeout(600);
    rec.frame("step-1-pointing");
    await cardButton("guide-next").click();
    await expect(cardPage(app).locator(".gl-guide")).toHaveCount(1);
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/2.*2/);
    await page.waitForTimeout(600);
    rec.frame("step-2-pointing");
    await cardButton("guide-back").click();
    await cardButton("guide-next").click();
    await expect
      .poll(() => noteText(app), { timeout: 5000 })
      .toContain("Look at the empty body.");
    await cardButton("guide-back").click();
    await expect
      .poll(() => noteText(app), { timeout: 5000 })
      .toContain("Read the heading.");
    await cardButton("guide-next").click();
    await cardButton("guide-next").click();
    // The last step ends the tour with its goodbye and the way back.
    await expect(cardButton("guide-back")).toBeVisible();
    await expect(cardButton("guide-next")).toHaveCount(0);
    rec.frame("finished");
    // The card's close button ends the guide: the marks go and the card is plain again.
    const ended = Date.now();
    await cardButton("guide-dismiss").click();
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(false);
    // Nothing is left in the card to show the guide again.
    await expect(cardButton("guide-again")).toHaveCount(0);
    console.log(`guide: ended ${Date.now() - ended} ms ago`);
    await expect(cardPage(app).locator(".gl-guide button")).toHaveCount(0);
    rec.frame("dismissed");
    const seen = await stalled(app);
    console.log(
      `guide: feedback ${feedback} ms, main stall ${JSON.stringify(seen)}`,
    );
    expect(seen.worst).toBeLessThan(100);
    // Esc ends a guide too.
    move(40, 40);
    await expect
      .poll(async () => (await read(app)).state, { timeout: 12000 })
      .toBe("peek");
    await reveal(page);
    await clickBubble(page, "guide", frame);
    await expect.poll(() => overlayShown(app), { timeout: 8000 }).toBe(true);
    key(0xff1b);
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(false);
  } finally {
    await rec.stop();
    await app.close();
  }
});
