import { test, expect } from "@playwright/test";
import { launch, native } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });
const emit = (app, event) =>
  app.evaluate(
    (_e, event) => globalThis.blinklingTest.session.emit(event),
    event,
  );
const clickAway = (b) =>
  native([
    { type: "move", x: b.x + 120, y: b.y + 160, wait: 0.2 },
    { type: "down" },
    { type: "up", wait: 0.1 },
  ]);
const answer = (app, id, text) =>
  emit(app, {
    type: "message",
    id,
    role: "assistant",
    content: [{ type: "text", text }],
  });

/** Blink is faint, and the card is shut, while a capture takes the picture. */
test("a capture started with the card open closes the card first and Blink goes faint, and the card comes back with the picture", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("r7_capture_hide", { fps: 30, suffix: "-327" });
  try {
    await background(app);
    await app.evaluate(({ screen }) => {
      const t = globalThis.blinklingTest,
        c = t.features.capture,
        b = screen.getPrimaryDisplay().bounds;
      t.features.setSession({
        subscribe: () => () => {},
        send: async () => {},
        stop: async () => {},
      });
      c.list = async () => [
        {
          id: "w1",
          title: "Docs - Google Chrome",
          bounds: { x: 0, y: 0, width: b.width, height: b.height },
        },
      ];
      c.companion = () => false;
      // The reader is still choosing, so the capture is under way for a while.
      c.overlays.open = async () => {
        await new Promise((r) => setTimeout(r, 2500));
        return { kind: "screen" };
      };
    });
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(600);
    rec.frame("card-open");
    await app.evaluate(() => void globalThis.blinklingTest.features.select());
    await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(getComputedStyle(document.documentElement).opacity),
          ),
        { timeout: 3000 },
      )
      .toBeLessThan(0.4);
    rec.frame("card-shut-blink-faint");
    await expect.poll(() => cardOpen(app), { timeout: 15000 }).toBe(true);
    rec.frame("card-back");
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(getComputedStyle(document.documentElement).opacity),
          ),
        { timeout: 4000 },
      )
      .toBeGreaterThan(0.9);
  } finally {
    await rec.stop();
    await app.close();
  }
});

for (const [id, label, start] of [
  [
    "typed",
    "a typed question",
    async (app) =>
      emit(app, { type: "delta", id: "q1", text: "Working on it. " }),
  ],
  [
    "capture",
    "a question asked about a capture",
    async (app) => {
      await app.evaluate(({ screen }) => {
        const t = globalThis.blinklingTest,
          c = t.features.capture,
          b = screen.getPrimaryDisplay().bounds;
        c.list = async () => [
          {
            id: "w1",
            title: "Docs",
            bounds: { x: 0, y: 0, width: b.width, height: b.height },
          },
        ];
        c.companion = () => false;
        c.overlays.open = async () => ({ kind: "screen" });
      });
      await app.evaluate(() => void globalThis.blinklingTest.features.select());
      await expect.poll(() => cardOpen(app), { timeout: 15000 }).toBe(true);
      await app.evaluate(() => {});
      await emit(app, { type: "delta", id: "q1", text: "About the picture. " });
    },
  ],
]) {
  test(`${label}: the card opens by itself when the answer is done, also after a click away while it was written`, async () => {
    test.setTimeout(120000);
    const { app, page } = await launch();
    const rec = record(`r7_card_autoopen_${id}`, { fps: 30, suffix: "-327" });
    try {
      const b = await background(app);
      await app.evaluate(() => {
        globalThis.blinklingTest.features.setSession({
          subscribe: () => () => {},
          send: async () => {},
          stop: async () => {},
        });
      });
      await reveal(page);
      await clickBlink(page);
      await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
      await page.waitForTimeout(500);
      if (id === "capture") {
        await app.evaluate(() => globalThis.blinklingTest.composer.hide?.());
      }
      await start(app);
      await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
      rec.frame("card-open-streaming");
      await page.waitForTimeout(500);
      clickAway(b);
      await expect.poll(() => cardOpen(app), { timeout: 3000 }).toBe(false);
      rec.frame("card-closed");
      await page.waitForTimeout(800);
      expect(await cardOpen(app), "not mid-way").toBe(false);
      await answer(app, "q1", "About the picture. All done.");
      await emit(app, { type: "done", id: "q1" });
      await expect.poll(() => cardOpen(app), { timeout: 4000 }).toBe(true);
      rec.frame("card-open-at-end");
    } finally {
      await rec.stop();
      await app.close();
    }
  });
}
