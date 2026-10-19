import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));

test("r7_auto_mutter: an Auto explain answer is muttered in a bubble beside Blink, the card stays shut and keeps the record, no terminal is asked, answered once", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("r7_auto_mutter", { suffix: "-327" });
  try {
    await background(app);
    await reveal(page);
    // A linked terminal session has the chat; the card is closed.
    await app.evaluate(() => {
      const t = globalThis.blinklingTest;
      t.frames = [];
      t.companionHost.toSession = (id, frame) => {
        t.frames.push({ id, frame });
        return true;
      };
      t.mainSent = [];
      const main = t.session.main;
      main.send = async (turn) => {
        t.mainSent.push(turn.id);
        const id = `auto-${turn.id}`;
        main.active = turn.id;
        setTimeout(() => {
          main.emit({ type: "delta", id, text: "A page about " });
          main.emit({ type: "delta", id, text: "the weather." });
          main.emit({
            type: "message",
            id,
            role: "assistant",
            content: [{ type: "text", text: "A page about the weather." }],
          });
          main.active = undefined;
          main.emit({ type: "done", turnId: turn.id });
        }, 400);
      };
      t.session.link({ session: "s1", cwd: "/work/alpha", channel: true });
    });
    rec.frame("before");
    expect(await cardOpen(app)).toBe(false);
    await app.evaluate(() =>
      globalThis.blinklingTest.session.send({
        id: "explain-1",
        text: "Explain what is on screen.",
        attachments: [],
        source: "auto-explain",
      }),
    );
    const bubble = page.locator("#mutter");
    await expect(bubble).toHaveAttribute("data-shown", "true", {
      timeout: 8000,
    });
    await expect(bubble).toHaveText("A page about the weather.");
    rec.frame("mutter");
    await page.waitForTimeout(1200);
    expect(await cardOpen(app), "the card stays shut").toBe(false);
    await app.evaluate(() => globalThis.blinklingTest.openComposer({}));
    await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
    const card = cardPage(app);
    await expect(card.locator(".gl-chat-message").last()).toContainText(
      "A page about the weather.",
    );
    rec.frame("record");
    await page.waitForTimeout(800);
    const seen = await app.evaluate(() => ({
      frames: globalThis.blinklingTest.frames.length,
      main: globalThis.blinklingTest.mainSent.length,
    }));
    expect(seen.frames, "the terminal was not asked").toBe(0);
    expect(seen.main, "Blink's own session answered once").toBe(1);
    expect(
      await card.locator(".gl-chat-message", { hasText: "weather" }).count(),
    ).toBe(1);
  } finally {
    await rec.stop();
    await app.close();
  }
});
