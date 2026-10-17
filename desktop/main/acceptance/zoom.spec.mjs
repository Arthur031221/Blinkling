import { test, expect } from "@playwright/test";
import { launch, native, key } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const viewerPage = (app) =>
  app.windows().find((p) => p.url().includes("/viewer/index.html"));
const viewerWin = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("/viewer/index.html"),
    );
    return { visible: w.isVisible(), bounds: w.getBounds() };
  });
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
/** A 1600 x 1000 picture with a grid and a mark in each corner, so a zoom and
 * a pan can be told apart by eye. */
const picture = (page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 1600, 1000);
    sky.addColorStop(0, "#2f6fed");
    sky.addColorStop(1, "#f2994a");
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 1000);
    g.strokeStyle = "rgba(255,255,255,.45)";
    g.lineWidth = 2;
    for (let x = 0; x <= 1600; x += 100) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 1000);
      g.stroke();
    }
    for (let y = 0; y <= 1000; y += 100) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1600, y);
      g.stroke();
    }
    g.fillStyle = "#fff";
    g.font = "bold 120px sans-serif";
    g.fillText("Blink 1600", 420, 540);
    return c.toDataURL("image/png").split(",")[1];
  });
const scale = (app) =>
  viewerPage(app).evaluate(() =>
    Number(document.querySelector("#picture").dataset.scale),
  );
const shift = (app) =>
  viewerPage(app).evaluate(() => {
    const m = new DOMMatrix(
      getComputedStyle(document.querySelector("#picture")).transform,
    );
    return { x: m.e, y: m.f };
  });
const centreOf = async (app) => {
  const { bounds } = await viewerWin(app);
  return {
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2),
  };
};
/** The thumbnail in the card, in screen pixels. */
async function thumbnail(app) {
  const page = cardPage(app);
  const box = await page.locator(".gl-user .gl-message-image").boundingBox();
  const at = await app.evaluate(() =>
    globalThis.blinklingTest.composer.getBounds(),
  );
  return { x: at.x + box.x + box.width / 2, y: at.y + box.y + box.height / 2 };
}
const openViewer = async (app, page) => {
  // The card retires after its reading time; a click on Blink brings it back.
  if (
    !(await app.evaluate(() => globalThis.blinklingTest.composer.isVisible()))
  )
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
  await expect(
    cardPage(app).locator(".gl-user .gl-message-image"),
  ).toBeVisible();
  await cardPage(app).waitForTimeout(700);
  await cardPage(app).evaluate(() =>
    document
      .querySelector(".gl-user .gl-message-image")
      .scrollIntoView({ block: "center" }),
  );
  await cardPage(app).waitForTimeout(200);
  const at = await thumbnail(app);
  native([{ type: "move", ...at }, { type: "down" }, { type: "up" }]);
  await expect
    .poll(() => viewerPage(app)?.locator("#picture").getAttribute("data-scale"))
    .toBeTruthy();
  await expect.poll(async () => (await viewerWin(app)).visible).toBe(true);
  await viewerPage(app).waitForTimeout(500);
};

test("a picture in the card opens in a viewer that zooms from fit to 800% with the wheel, pans by dragging, toggles fit and 100% on a double click, and closes with Esc, the backdrop or the button", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("zoom");
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    const data = await picture(cardPage(app));
    await cardPage(app).evaluate(
      (data) =>
        window.blinkling.sendTurn({
          id: crypto.randomUUID(),
          text: "slow: here is a chart",
          attachments: [
            {
              id: crypto.randomUUID(),
              name: "chart.png",
              mediaType: "image/png",
              data,
            },
          ],
          source: "composer",
        }),
      data,
    );
    await expect(
      cardPage(app).locator(".gl-user .gl-message-image"),
    ).toBeVisible({ timeout: 8000 });
    await expect(cardPage(app).locator(".gl-assistant").last()).toContainText(
      "And a third.",
      { timeout: 8000 },
    );
    // Pinned, so the card stays while the picture is looked at in turn.
    await cardPage(app).evaluate(() => window.blinkling.pin(true));
    await page.waitForTimeout(500);
    rec.frame("card");

    // A click on the picture opens the viewer over the whole display.
    await openViewer(app, page);
    const display = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().bounds,
    );
    expect((await viewerWin(app)).bounds).toEqual(display);
    const fit = await scale(app);
    expect(fit).toBeLessThan(1);
    rec.frame("fit");

    // The wheel zooms around the pointer, up to 800% and no further.
    const centre = await centreOf(app);
    // A reader's hand takes a moment between reaching the picture and the
    // first turn of the wheel.
    native([
      { type: "move", ...centre },
      { type: "wait", seconds: 0.3 },
      { type: "wheel", notches: -6 },
    ]);
    await page.waitForTimeout(300);
    const some = await scale(app);
    expect(some).toBeGreaterThan(fit * 1.5);
    rec.frame("wheel-in");
    native([{ type: "wheel", notches: -60 }]);
    await page.waitForTimeout(300);
    expect(await scale(app)).toBeCloseTo(8, 2);
    rec.frame("800");
    native([{ type: "wheel", notches: 80 }]);
    await page.waitForTimeout(300);
    expect(await scale(app)).toBeCloseTo(fit, 3);

    // Dragging pans a zoomed picture.
    native([{ type: "wheel", notches: -14 }]);
    await page.waitForTimeout(300);
    expect(await scale(app)).toBeGreaterThan(1.5);
    const before = await shift(app);
    native([
      { type: "move", ...centre },
      { type: "down" },
      ...Array.from({ length: 6 }, (_, i) => ({
        type: "move",
        x: centre.x - 30 * (i + 1),
        y: centre.y - 20 * (i + 1),
        wait: 0.04,
      })),
      { type: "up" },
    ]);
    await page.waitForTimeout(300);
    const after = await shift(app);
    expect(before.x - after.x).toBeGreaterThan(120);
    expect(before.y - after.y).toBeGreaterThan(60);
    rec.frame("panned");

    // Back to the fit, then a double click toggles 100% and the fit.
    native([{ type: "wheel", notches: 80 }]);
    await page.waitForTimeout(300);
    native([
      { type: "move", ...centre },
      { type: "down" },
      { type: "up" },
      { type: "down" },
      { type: "up" },
    ]);
    await page.waitForTimeout(300);
    expect(await scale(app)).toBeCloseTo(1, 3);
    rec.frame("100");
    native([
      { type: "down" },
      { type: "up" },
      { type: "down" },
      { type: "up" },
    ]);
    await page.waitForTimeout(300);
    expect(await scale(app)).toBeCloseTo(fit, 3);

    // Esc closes it.
    key(0xff1b);
    await expect.poll(async () => (await viewerWin(app)).visible).toBe(false);
    rec.frame("closed");

    // A click on the backdrop closes it.
    await openViewer(app, page);
    const { bounds } = await viewerWin(app);
    native([
      { type: "move", x: bounds.x + 30, y: bounds.y + 30 },
      { type: "down" },
      { type: "up" },
    ]);
    await expect.poll(async () => (await viewerWin(app)).visible).toBe(false);

    // The close button closes it.
    await openViewer(app, page);
    const button = await viewerPage(app).locator("#viewer-close").boundingBox();
    const b2 = (await viewerWin(app)).bounds;
    native([
      { type: "move", x: b2.x + button.x + 18, y: b2.y + button.y + 18 },
      { type: "down" },
      { type: "up" },
    ]);
    await expect.poll(async () => (await viewerWin(app)).visible).toBe(false);
  } finally {
    await rec.stop();
    await app.close();
  }
});

/** Where the history ends and the composer begins, in the card's own pixels. */
const historyEnds = (app) =>
  cardPage(app).evaluate(() => {
    const h = document.querySelector(".gl-chat-history");
    const last = [...h.querySelectorAll(".gl-user, .gl-assistant")].at(-1);
    const box = h.getBoundingClientRect();
    const tail = last.getBoundingClientRect();
    return {
      lastBottom: tail.bottom,
      historyBottom: box.bottom,
      composerTop: document.querySelector("textarea").getBoundingClientRect()
        .top,
      fromEnd: h.scrollHeight - h.clientHeight - h.scrollTop,
    };
  });

test("the wheel zooms around an off-centre pointer, and once the viewer is closed the newest answer is whole above the composer, also after a picture joins it", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("zoom_close", { suffix: "-323" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    const data = await picture(cardPage(app));
    await cardPage(app).evaluate(
      (data) =>
        window.blinkling.sendTurn({
          id: crypto.randomUUID(),
          text: "slow: here is a chart",
          attachments: [
            {
              id: crypto.randomUUID(),
              name: "chart.png",
              mediaType: "image/png",
              data,
            },
          ],
          source: "composer",
        }),
      data,
    );
    await expect(cardPage(app).locator(".gl-assistant").last()).toContainText(
      "And a third.",
      { timeout: 8000 },
    );
    await cardPage(app).evaluate(() => window.blinkling.pin(true));
    await page.waitForTimeout(700);
    const resting = await historyEnds(app);
    expect(resting.fromEnd).toBeLessThan(4);
    rec.frame("card");

    await openViewer(app, page);
    const { bounds } = await viewerWin(app);
    // The pointer is well off the centre: a third across, a third down.
    const at = {
      x: bounds.x + Math.round(bounds.width * 0.3),
      y: bounds.y + Math.round(bounds.height * 0.35),
    };
    const underPointer = async () => {
      const m = await shift(app);
      const s = await scale(app);
      return {
        px: (at.x - bounds.x - m.x) / s,
        py: (at.y - bounds.y - m.y) / s,
        s,
      };
    };
    native([
      { type: "move", ...at },
      { type: "wait", seconds: 0.3 },
    ]);
    const before = await underPointer();
    native([{ type: "wheel", notches: -4 }]);
    await page.waitForTimeout(400);
    const after = await underPointer();
    expect(after.s).toBeGreaterThan(before.s * 1.3);
    // The same point of the picture is still under the pointer.
    expect(Math.abs(after.px - before.px) * after.s).toBeLessThan(1.5);
    expect(Math.abs(after.py - before.py) * after.s).toBeLessThan(1.5);
    rec.frame("off-centre");
    native([{ type: "wheel", notches: 3 }]);
    await page.waitForTimeout(400);
    const out = await underPointer();
    expect(Math.abs(out.px - before.px) * out.s).toBeLessThan(2);
    expect(Math.abs(out.py - before.py) * out.s).toBeLessThan(2);

    key(0xff1b);
    await expect.poll(async () => (await viewerWin(app)).visible).toBe(false);
    await page.waitForTimeout(700);
    const closed = await historyEnds(app);
    expect(closed.fromEnd).toBeLessThan(4);
    expect(closed.lastBottom).toBeLessThanOrEqual(closed.composerTop + 1);
    rec.frame("closed");

    // A picture joins the composer: the history is shorter, the newest answer
    // must still be whole above it.
    await cardPage(app).evaluate(async (data) => {
      const file = new File(
        [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
        "extra.png",
        { type: "image/png" },
      );
      const input = document.querySelector("input[type=file]");
      const list = new DataTransfer();
      list.items.add(file);
      input.files = list.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, data);
    await expect(
      cardPage(app).locator(".gl-attachment-chip").first(),
    ).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(900);
    const grown = await historyEnds(app);
    expect(grown.fromEnd).toBeLessThan(4);
    expect(grown.lastBottom).toBeLessThanOrEqual(grown.composerTop + 1);
    rec.frame("composer-grown");
  } finally {
    await rec.stop();
    await app.close();
  }
});
