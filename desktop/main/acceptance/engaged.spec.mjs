import { test, expect } from "@playwright/test";
import { launch, move, click, key } from "./support.mjs";
import { background, onBlink, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
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
/** Every window of the app that could be left on screen, and whether it is. */
const visible = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => w.isVisible())
      .map((w) =>
        w.webContents.getURL().replace(/^.*\/(\w+)\/index\.html.*$/, "$1"),
      ),
  );
const askFromElsewhere = (app, text) =>
  cardPage(app).evaluate(
    (text) =>
      window.blinkling.sendTurn({
        id: crypto.randomUUID(),
        text,
        attachments: [],
        source: "composer",
      }),
    text,
  );
const cardPoint = async (app) => {
  const at = await app.evaluate(() =>
    globalThis.blinklingTest.composer.getBounds(),
  );
  return { x: at.x + at.width / 2, y: at.y + at.height / 2 };
};
/** Samples the machine every 200 ms for `ms` and returns what it said. */
async function watch(app, ms) {
  const seen = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    seen.push(await read(app));
    await new Promise((r) => setTimeout(r, 200));
  }
  return seen;
}
/** Waits for the machine to say `peek` and returns how long that took. */
async function untilPeek(app, limit) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if ((await read(app)).state === "peek") return Date.now() - start;
    await new Promise((r) => setTimeout(r, 100));
  }
  return Infinity;
}

test("Blink stays out while the reader is engaged, retreats 1.5 s after the last engagement, and one click on Blink turns the card and the menu into each other", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("stay_out");
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    expect(await untilPeek(app, 9000)).toBeLessThan(9000);
    rec.frame("peek");

    // The pointer resting on Blink keeps it out, however long.
    await onBlink(page);
    const resting = await watch(app, 3500);
    expect(resting.every((s) => s.out && s.state !== "peek")).toBe(true);
    rec.frame("hover");

    // A click opens the card, the next one swaps it for the menu, the next
    // one swaps back; the menu never sits over an open card.
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    expect((await read(app)).menu).toBe(false);
    await page.waitForTimeout(700);
    rec.frame("card");
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    expect((await read(app)).card).toBe(false);
    await page.waitForTimeout(700);
    rec.frame("menu");
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    expect((await read(app)).menu).toBe(false);

    // With the pointer on the card Blink stays out, however long.
    const at = await cardPoint(app);
    move(at.x, at.y + 40);
    const reading = await watch(app, 4000);
    expect(reading.every((s) => s.out && s.card)).toBe(true);

    // Esc closes the card; Blink waits out the grace and then retreats.
    move(40, 40);
    key(0xff1b);
    await expect.poll(async () => (await read(app)).card).toBe(false);
    const closedAt = Date.now();
    await page.waitForTimeout(900);
    expect((await read(app)).out).toBe(true);
    rec.frame("grace");
    const took = await untilPeek(app, 6000);
    const after = Date.now() - closedAt;
    expect(after).toBeGreaterThan(1300);
    expect(after).toBeLessThan(3500);
    expect(took).toBeLessThan(6000);
    rec.frame("retreated");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("no surface stays on screen without a way to close it: the card closes by reading time, Esc and a click outside, the menu when the pointer leaves", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("stuck_card-321");
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    expect(await untilPeek(app, 9000)).toBeLessThan(9000);

    // An answer that arrives by itself opens the card; left alone it closes
    // after the reading time (8 s for a short answer) and Blink goes back.
    await askFromElsewhere(app, "slow: how long do I stay");
    await expect(cardPage(app).locator(".gl-assistant").last()).toContainText(
      "And a third.",
      { timeout: 8000 },
    );
    const answeredAt = Date.now();
    expect((await read(app)).card).toBe(true);
    rec.frame("answer");
    await expect
      .poll(async () => (await read(app)).card, { timeout: 20000 })
      .toBe(false);
    const stayed = Date.now() - answeredAt;
    expect(stayed).toBeGreaterThan(6000);
    expect(stayed).toBeLessThan(16000);
    rec.frame("closed-by-time");
    expect(await visible(app)).not.toContain("composer");

    // Esc closes a card the reader opened.
    await onBlink(page);
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    await page.waitForTimeout(700);
    key(0xff1b);
    await expect.poll(async () => (await read(app)).card).toBe(false);

    // A click outside closes the card once the answer is in.
    await onBlink(page);
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    await askFromElsewhere(app, "slow: now click away");
    await expect(cardPage(app).locator(".gl-assistant").last()).toContainText(
      "And a third.",
      { timeout: 8000 },
    );
    await expect.poll(async () => (await read(app)).streaming).toBe(false);
    click(40, 40);
    await expect
      .poll(async () => (await read(app)).card, { timeout: 5000 })
      .toBe(false);
    rec.frame("closed-by-click");

    // The menu closes when the pointer leaves it.
    await onBlink(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    rec.frame("menu");
    move(40, 40);
    await expect
      .poll(async () => (await read(app)).menu, { timeout: 3000 })
      .toBe(false);

    // In the end only Blink is left.
    expect(await untilPeek(app, 6000)).toBeLessThan(6000);
    expect(await visible(app)).toEqual(
      expect.not.arrayContaining([
        "composer",
        "viewer",
        "settings",
        "welcome",
        "mini",
      ]),
    );
    rec.frame("only-blink");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("the permission bubble does not outlive its question: it stays inside the screen on every edge, opening the card or an answer takes it away", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("stuck_permission-321");
  const emit = (event) =>
    app.evaluate((_e, event) => globalThis.blinklingTest.send(event), event);
  try {
    await background(app);
    for (const [edge, ratio] of [
      ["right", 0.5],
      ["left", 0.1],
      ["right", 0.92],
      ["left", 0.9],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(500);
      await emit({ type: "activity", state: "permission" });
      await expect(page.locator("#permission-alert")).toBeVisible();
      expect(
        await page.locator("#permission-alert").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight
          );
        }),
      ).toBe(true);
      rec.frame(`permission-${edge}-${ratio}`);
      // The question is answered in the terminal: Blink goes on working.
      await emit({ type: "activity", state: "thinking" });
      await expect(page.locator("#permission-alert")).toBeHidden();
    }
    // Opening the card answers the bubble too.
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await emit({ type: "activity", state: "permission" });
    await expect(page.locator("#permission-alert")).toBeVisible();
    await onBlink(page);
    await clickBlink(page);
    await expect.poll(async () => (await read(app)).card).toBe(true);
    await expect(page.locator("#permission-alert")).toBeHidden();
    rec.frame("card-opened");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("an app killed with the card and the menu on screen starts again with nothing stuck: no card, no menu, nothing pinned, Blink at its edge", async () => {
  test.setTimeout(180000);
  const first = await launch();
  let data;
  try {
    data = first.data;
    await background(first.app);
    await place(first.app, "right", 0.5);
    await first.page.waitForTimeout(500);
    await onBlink(first.page);
    await clickBlink(first.page);
    await expect.poll(async () => (await read(first.app)).card).toBe(true);
    await clickBlink(first.page);
    await expect.poll(async () => (await read(first.app)).menu).toBe(true);
    // The process dies as a crash or a forced quit would end it.
    first.app.process().kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 1000));
  } finally {
    await first.app.close().catch(() => {});
  }
  const again = await launch({ data });
  try {
    await background(again.app);
    await expect
      .poll(async () => (await read(again.app)).state, { timeout: 8000 })
      .toBe("peek");
    const state = await read(again.app);
    expect(state.card).toBe(false);
    expect(state.menu).toBe(false);
    expect(state.pinned).toBe(false);
    expect(state.surface).toBe("none");
    await new Promise((r) => setTimeout(r, 1500));
    const shown = await visible(again.app);
    expect(
      // The page standing in for the desktop is the test's own.
      shown.filter(
        (name) =>
          name !== "blink" && name !== "renderer" && !name.startsWith("data:"),
      ),
    ).toEqual([]);
    // And it still answers: the card opens and closes on Esc.
    move(640, 400);
    await place(again.app, "right", 0.5);
    await again.page.waitForTimeout(1500);
    await onBlink(again.page);
    await clickBlink(again.page);
    await expect.poll(async () => (await read(again.app)).card).toBe(true);
    key(0xff1b);
    await expect.poll(async () => (await read(again.app)).card).toBe(false);
  } finally {
    await again.app.close();
  }
});
