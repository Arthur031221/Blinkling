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
const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
/** Remembers every pose the figure played, frame by frame. */
const watch = (page) =>
  page.evaluate(() => {
    window.__poses = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__poses.at(-1) !== key) window.__poses.push(key);
      requestAnimationFrame(step);
    };
    step();
  });
const played = (page) => page.evaluate(() => window.__poses);
const miniPage = (app) =>
  app.windows().find((p) => /\/mini\/index\.html$/.test(p.url()));
const mini = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      /\/mini\/index\.html$/.test(w.webContents.getURL()),
    );
    return Boolean(w?.isVisible() && w.isFocused());
  });

test("the full screen bubble takes the whole screen, plays eat, clears the menu and asks in the mini composer with the picture attached", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("fullscreen_shot");
  try {
    const origin = await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await watch(page);
    await reveal(page);
    await expect.poll(async () => (await read(app)).menu).toBe(true);
    rec.frame("menu");
    const box = await bubble(page, "capture").boundingBox();
    const at = {
      x: origin.x + box.x + box.width / 2,
      y: origin.y + box.y + box.height / 2,
    };
    move(at.x, at.y);
    await page.waitForTimeout(300);
    const clicked = Date.now();
    click(at.x, at.y);

    // The click is answered at once: the menu has gone before the picture is.
    await expect
      .poll(async () => (await read(app)).menu, { intervals: [10] })
      .toBe(false);
    const answered = Date.now() - clicked;
    expect(answered).toBeLessThan(400);
    rec.frame("clicked");

    // Blink eats the picture, then the mini composer opens with it attached
    // and the cursor in the text box.
    await expect
      .poll(async () => (await played(page)).includes("eat"), {
        timeout: 3000,
      })
      .toBe(true);
    rec.frame("eat");
    await expect
      .poll(() => miniPage(app)?.locator(".mini-entry-image").count(), {
        timeout: 8000,
      })
      .toBe(1);
    await expect.poll(() => mini(app)).toBe(true);
    expect(
      await miniPage(app).evaluate(
        () => document.activeElement === document.querySelector(".mini-input"),
      ),
    ).toBe(true);
    // Nothing of the menu is left over the composer.
    await page.waitForTimeout(500);
    expect((await read(app)).menu).toBe(false);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Math.max(
              ...[...document.querySelectorAll("[data-action]")].map((e) =>
                Math.max(
                  Number(getComputedStyle(e).opacity),
                  Number(
                    getComputedStyle(e.querySelector(".action-label")).opacity,
                  ),
                ),
              ),
            ),
          ),
        { timeout: 2000 },
      )
      .toBeLessThan(0.05);
    rec.frame("asks");

    // Click outside; the picture stays in the draft.
    click(40, 40);
    await page.waitForTimeout(1500);
    await expect(miniPage(app).locator(".mini-entry-image")).toHaveCount(1);
  } finally {
    await rec.stop();
    await app.close();
  }
});
