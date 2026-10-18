import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.isVisible());
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
const closeCard = async (app) => {
  await cardPage(app).evaluate(() => window.blinkling.close());
  await expect.poll(() => cardOpen(app)).toBe(false);
};
const reopen = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
/** A message that arrives while the card is closed (the terminal, the quick box). */
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
/** A message typed into the open card, as the reader does; resolves when the
 * whole answer is in. */
async function ask(app, text) {
  const page = cardPage(app);
  const before = await page.locator(".gl-assistant").count();
  const input = page.locator(".gl-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator(".gl-assistant")).toHaveCount(before + 1, {
    timeout: 8000,
  });
  await expect(page.locator(".gl-assistant").last()).toContainText(
    "And a third.",
    { timeout: 8000 },
  );
  await page.waitForTimeout(250);
}
/** The whole answer is in and the card is ready for the next question. */
const settled = async (app) => {
  const page = cardPage(app);
  await expect(page.locator(".gl-assistant").last()).toContainText(
    "And a third.",
    { timeout: 8000 },
  );
  await page.waitForTimeout(400);
};

/** The card's history, its composer and its messages, measured on the page. */
const layout = (app) =>
  cardPage(app).evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const history = document.querySelector(".gl-chat-history");
    const rgb = (el) => {
      const c = getComputedStyle(el).backgroundColor;
      const n = c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      // A mixed colour is reported as color(srgb r g b) in 0..1.
      return c.startsWith("color(") ? n.map((v) => v * 255) : n;
    };
    const messages = [...history.querySelectorAll(".gl-chat-message")];
    return {
      history: box(history),
      composer: box(document.querySelector(".gl-composer")),
      scrolled: history.scrollHeight - history.clientHeight - history.scrollTop,
      scrollable: history.scrollHeight > history.clientHeight + 1,
      mask: getComputedStyle(history).maskImage,
      padBottom: parseFloat(getComputedStyle(history).paddingBottom),
      messages: messages.map((el) => ({
        ...box(el),
        user: el.classList.contains("gl-user"),
        color: rgb(el),
      })),
    };
  });

test("an answer opens the card by itself with the thinking indicator, the card is the only surface, and the conversation sits tight with the newest above the composer", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("answer_layout", {
    suffix: "-324",
    also: ["card_surface"],
  });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    // The card is closed; a message from elsewhere (the terminal, the quick
    // box) starts an answer and the card opens by itself.
    await expect.poll(() => cardPage(app)).toBeTruthy();
    expect(await cardOpen(app)).toBe(false);
    rec.frame("closed");
    void askFromElsewhere(app, "think: first question");
    await expect.poll(() => cardOpen(app), { timeout: 1500 }).toBe(true);
    // Thinking: three dots and an English -ing word.
    const thinking = cardPage(app).locator(".gl-thinking");
    await expect(thinking).toBeVisible();
    expect(await thinking.locator(".gl-dots i").count()).toBe(3);
    await expect(thinking.locator(".gl-think-word")).toHaveText(/ing/);
    rec.frame("thinking");
    await settled(app);
    // One surface: no separate answer window exists.
    const urls = app.windows().map((p) => p.url());
    expect(urls.filter((u) => /deck|answer/.test(u))).toEqual([]);
    // Enough turns to overflow the history.
    for (const q of ["second", "third", "fourth", "fifth", "sixth"]) {
      await ask(app, `slow: ${q} question that is a little longer to wrap`);
      await settled(app);
    }
    await cardPage(app).waitForTimeout(600);
    rec.frame("answers");
    const l = await layout(app);
    expect(l.scrollable).toBe(true);
    // The history ends above the composer, the last message clear of it.
    expect(l.history.bottom).toBeLessThanOrEqual(l.composer.top + 1);
    expect(l.padBottom).toBeGreaterThanOrEqual(10);
    const last = l.messages.at(-1);
    expect(last.bottom).toBeLessThanOrEqual(l.history.bottom - 10);
    expect(l.scrolled).toBeLessThanOrEqual(2);
    // The top fades out.
    expect(l.mask).toContain("linear-gradient");
    // Tight: neighbouring bubbles are 8 px or less apart.
    const gaps = l.messages
      .slice(1)
      .map((m, i) => m.top - l.messages[i].bottom)
      .filter((g) => g > -2);
    expect(gaps.length).toBeGreaterThan(3);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(8);
    // You on the right in a green tint, Blink on the left on a neutral card.
    const mine = l.messages.find((m) => m.user);
    const theirs = l.messages.find((m) => !m.user);
    const middle = (l.history.left + l.history.right) / 2;
    expect(mine.left + (mine.right - mine.left) / 2).toBeGreaterThan(middle);
    expect(theirs.left + (theirs.right - theirs.left) / 2).toBeLessThan(
      middle + 40,
    );
    expect(l.history.right - mine.right).toBeLessThanOrEqual(16);
    expect(theirs.left - l.history.left).toBeLessThanOrEqual(16);
    const [r, g, b] = mine.color;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b - 10);
    const [nr, ng, nb] = theirs.color;
    expect(Math.max(nr, ng, nb) - Math.min(nr, ng, nb)).toBeLessThan(
      Math.max(r, g, b) - Math.min(r, g, b),
    );
    // Both themes.
    await cardPage(app).emulateMedia({ colorScheme: "dark" });
    await cardPage(app).evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await cardPage(app).waitForTimeout(300);
    rec.frame("dark");
    const d = await layout(app);
    const dm = d.messages.find((m) => m.user);
    expect(Math.max(...dm.color)).toBeLessThan(140);
    expect(dm.color[1]).toBeGreaterThan(dm.color[0]);
    await cardPage(app).evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await cardPage(app).emulateMedia({ colorScheme: "light" });
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("every time the card opens, the history is above the composer and scrolled to the newest", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("history_on_open", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    void askFromElsewhere(app, "slow: first");
    await expect.poll(() => cardOpen(app), { timeout: 1500 }).toBe(true);
    await settled(app);
    for (const q of ["two", "three", "four", "five", "six", "seven"]) {
      await ask(app, `slow: ${q} question that is a little longer to wrap`);
      await settled(app);
    }
    for (let i = 0; i < 3; i++) {
      await closeCard(app);
      // Scroll the hidden history to the top; the next open must not keep it.
      await cardPage(app).evaluate(() => {
        document.querySelector(".gl-chat-history").scrollTop = 0;
      });
      await reopen(page);
      await expect.poll(() => cardOpen(app)).toBe(true);
      await page.waitForTimeout(900);
      const l = await layout(app);
      rec.frame(`open-${i + 1}`);
      expect(l.messages.length).toBeGreaterThan(8);
      expect(l.scrolled).toBeLessThanOrEqual(2);
      expect(l.history.bottom).toBeLessThanOrEqual(l.composer.top + 1);
      expect(l.messages.at(-1).bottom).toBeLessThanOrEqual(
        l.history.bottom - 10,
      );
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
