import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return Boolean(c && c.isVisible());
  });
const link = (app, session, cwd) =>
  app.evaluate(
    (_e, a) =>
      globalThis.blinklingTest.session.link({
        session: a.session,
        cwd: a.cwd,
        channel: true,
      }) && true,
    { session, cwd },
  );
const unlink = (app, session) =>
  app.evaluate(
    (_e, session) => globalThis.blinklingTest.session.unlink(session),
    session,
  );
const tabs = (card) =>
  card
    .locator(".gl-chat-tab")
    .evaluateAll((els) => els.map((el) => el.textContent));
const shown = (card, selector) =>
  card
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
    });

async function open(app, page) {
  await background(app);
  await reveal(page);
  await clickBlink(page);
  await expect.poll(() => cardOpen(app), { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(800);
  return cardPage(app);
}

test("picker_buttons: the model picker, the effort picker and the quick chips are in every live chat", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("picker_buttons", { suffix: "-324" });
  try {
    const card = await open(app, page);
    rec.frame("blink-own-chat");
    await link(app, "s1", "/work/alpha");
    await expect.poll(() => tabs(card)).toEqual([]);
    await page.waitForTimeout(600);
    for (const selector of [
      ".gl-picker-trigger",
      ".gl-quick-chip",
      ".gl-input",
    ])
      expect(await shown(card, selector), selector).toBe(true);
    expect(await card.locator(".gl-picker-trigger").count()).toBeGreaterThanOrEqual(2);
    expect(await card.locator(".gl-quick-chip").count()).toBe(3);
    rec.frame("session-one");
    // A second, newer session: its chat has them too.
    await link(app, "s2", "/work/beta");
    await expect.poll(() => tabs(card)).toEqual(["alpha", "beta"]);
    for (const selector of [".gl-picker-trigger", ".gl-quick-chip"])
      expect(await shown(card, selector), selector).toBe(true);
    // The model picker opens and its choice is Blink's own.
    await card.locator(".gl-picker-trigger").first().click();
    await expect(card.locator(".gl-picker-menu:not([hidden])")).toHaveCount(1);
    rec.frame("model-menu");
    await page.waitForTimeout(500);
    await card.keyboard.press("Escape");
    // A chip sends its words into the terminal session's chat.
    await card.locator('.gl-quick-chip[data-chip="what"]').click();
    await expect(card.locator(".gl-chat-message").first()).toBeVisible();
    rec.frame("chip-sent");
    await page.waitForTimeout(600);
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("live_sessions_only and multi_session: one chat per live session, none for a session that ended, one session has no switcher", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("multi_session", { suffix: "-324" });
  const only = record("live_sessions_only", { suffix: "-324" });
  try {
    const card = await open(app, page);
    expect(await tabs(card)).toEqual([]);
    await link(app, "s1", "/work/alpha");
    await page.waitForTimeout(500);
    expect(await tabs(card), "one live session: no switcher").toEqual([]);
    rec.frame("one-session");
    await link(app, "s2", "/work/beta");
    await expect.poll(() => tabs(card)).toEqual(["alpha", "beta"]);
    const selected = () =>
      card
        .locator('.gl-chat-tab[aria-selected="true"]')
        .evaluateAll((els) => els.map((e) => e.textContent));
    expect(await selected(), "the later session has the card at once").toEqual([
      "beta",
    ]);
    rec.frame("two-sessions");
    await link(app, "s3", "/work/gamma");
    await expect.poll(() => tabs(card)).toEqual(["alpha", "beta", "gamma"]);
    expect(await selected()).toEqual(["gamma"]);
    rec.frame("three-sessions");
    // The reader looks at the first one; a capture still belongs to the last.
    await card.locator('.gl-chat-tab[data-chat="s1"]').click();
    await expect.poll(selected).toEqual(["alpha"]);
    await app.evaluate(() => globalThis.blinklingTest.session.follow());
    await expect.poll(selected).toEqual(["gamma"]);
    rec.frame("capture-goes-to-newest");
    // Sessions end: they leave the switcher.
    await unlink(app, "s2");
    await expect.poll(() => tabs(card)).toEqual(["alpha", "gamma"]);
    only.frame("beta-left");
    await unlink(app, "s3");
    await expect.poll(() => tabs(card), { message: "one left" }).toEqual([]);
    await expect(card.locator(".gl-chat-tabs")).toBeHidden();
    only.frame("one-left");
    expect(
      await card.locator('.gl-chat-tab[data-live="false"]').count(),
      "no closed chat is offered",
    ).toBe(0);
    await unlink(app, "s1");
    await page.waitForTimeout(700);
    expect(await tabs(card)).toEqual([]);
    only.frame("none-left-blinks-own");
    await page.waitForTimeout(600);
  } finally {
    await rec.stop();
    await only.stop();
    await app.close();
  }
});
