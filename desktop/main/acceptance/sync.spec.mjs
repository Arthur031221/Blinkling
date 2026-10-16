import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.isVisible());

/** What the hook script of the terminal session does: one authenticated call
 * to the running Blink. */
const mirror = async (app, line) => {
  const { url, token } = await app.evaluate(
    () => globalThis.blinklingCompanion.address,
  );
  const response = await fetch(url + "/rpc", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "mirror", ...line }),
  });
  return response.status;
};

test("what is typed and answered in the terminal session appears in Blink's chat, as it happened", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("sync");
  try {
    await background(app);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(600);
    rec.frame("empty");

    expect(
      await mirror(app, { role: "user", id: "t-1", text: "fix the build" }),
    ).toBe(200);
    expect(
      await mirror(app, {
        role: "assistant",
        id: "t-2",
        text: "The build is fixed. The failing test was a stale snapshot.",
      }),
    ).toBe(200);
    // Work in the terminal does not put a card on the screen by itself.
    await page.waitForTimeout(1200);
    expect(await cardOpen(app)).toBe(false);
    rec.frame("quiet");

    // The next time the card opens, both lines are in its history, in order.
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    await expect.poll(() => cardOpen(app)).toBe(true);
    await page.waitForTimeout(900);
    rec.frame("opened");

    const card = cardPage(app);
    const texts = await card
      .locator(".gl-chat-message")
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("fix the build");
    expect(texts[1]).toContain("The build is fixed");
    // The user line is on the user's side, the answer on Blink's.
    await expect(card.locator(".gl-user")).toHaveCount(1);
    await expect(card.locator(".gl-assistant")).toHaveCount(1);
    // Nothing was sent to the owned session: no answer is being produced.
    await expect(card.locator(".gl-input")).toBeEnabled();
    // A line that is not a line is refused.
    expect(await mirror(app, { role: "system", id: "x", text: "no" })).toBe(
      400,
    );
  } finally {
    await rec.stop();
    await app.close();
  }
});
