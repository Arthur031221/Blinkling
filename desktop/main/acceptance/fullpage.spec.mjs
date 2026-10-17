import { test, expect } from "@playwright/test";
import { launch, move, click } from "./support.mjs";
import { background, reveal, bubble, sleep } from "./helpers.mjs";
import { record } from "./record.mjs";
import { strings } from "../../capture/strings.mjs";

/** The line for a key in whatever language the system speaks. */
const line = (key) =>
  new RegExp(
    [...new Set(Object.values(strings).map((t) => t[key]))]
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
  );

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
/** Every message the card holds, as text. */
const cardText = (app) =>
  cardPage(app)
    ?.locator("body")
    .innerText()
    .catch(() => "") ?? "";
/** A browser in front, and a companion whose page grab takes `ms` or fails. */
const browser = (app, { connected = true, ms = 0, fail = false } = {}) =>
  app.evaluate(
    ({ screen }, { connected, ms, fail }) => {
      const c = globalThis.blinklingTest.features.capture,
        b = screen.getPrimaryDisplay().bounds;
      c.companion = () => connected;
      c.list = async () => [
        {
          id: "w1",
          title: "Docs - Google Chrome",
          bounds: { x: 0, y: 0, width: b.width, height: b.height },
        },
      ];
      c.fullPage = async () => {
        await new Promise((r) => setTimeout(r, ms));
        if (fail) throw new Error("page grab failed");
        return { tiles: [] };
      };
      globalThis.pageGrabs = 0;
    },
    { connected, ms, fail },
  );
const press = async (page, frame) => {
  const box = await bubble(page, "capture").boundingBox();
  const at = {
    x: frame.x + box.x + box.width / 2,
    y: frame.y + box.y + box.height / 2,
  };
  move(at.x, at.y);
  await page.waitForTimeout(300);
  click(at.x, at.y);
};

test("the full page bubble always answers: a slow page says it has begun, a failure says so with a retry, a second press says it is busy, and the picture takes the line away", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("fullpage_button-321");
  try {
    const frame = await background(app);
    await app.evaluate(() => {
      globalThis.blinklingTest.features.setSession({
        subscribe: () => () => {},
        send: async () => {},
        stop: async () => {},
      });
    });
    await page.waitForTimeout(800);
    // 1. A page that takes three seconds: a bubble beside Blink says so and
    // the card stays shut.
    await browser(app, { ms: 3000 });
    await reveal(page);
    rec.frame("menu");
    await press(page, frame);
    await expect(page.locator("#status")).toHaveText(line("pageWorking"), {
      timeout: 3000,
    });
    expect(await cardText(app)).not.toMatch(line("pageWorking"));
    expect(
      await app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
      "the card is not opened for progress",
    ).toBe(false);
    rec.frame("working");
    // A second press while it works says so, never silence.
    await page.evaluate(() => void window.blinkling.action("capture"));
    await expect
      .poll(() => cardText(app), { intervals: [50], timeout: 3000 })
      .toMatch(line("busy"));
    rec.frame("busy");
    // The picture arrives and the line goes.
    await expect
      .poll(
        () =>
          app.evaluate(() => !globalThis.blinklingTest.features.capture.busy),
        { timeout: 20000 },
      )
      .toBe(true);
    await expect
      .poll(() => cardText(app), { timeout: 5000 })
      .not.toMatch(line("busy"));
    await expect(page.locator("#status")).toHaveAttribute(
      "data-shown",
      "false",
    );
    rec.frame("delivered");
    // 2. A grab that fails still gives the screen, so nothing is lost.
    await sleep(500);
    await browser(app, { fail: true });
    // 3. A capture that cannot finish says it failed, with a retry.
    await app.evaluate(() => {
      globalThis.blinklingTest.features.capture.run = async () => {
        throw new Error("no screen");
      };
    });
    await page.evaluate(() => void window.blinkling.action("capture"));
    await expect
      .poll(() => cardText(app), { timeout: 5000 })
      .toMatch(line("failed"));
    rec.frame("failed");
    await expect(
      cardPage(app).locator(
        '[data-action="guide-retry"], button:has-text("再試一次"), button:has-text("Try again")',
      ),
    ).toBeVisible();
  } finally {
    await rec.stop();
    await app.close();
  }
});
