import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";
import { say } from "../../session/strings.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardOpen = (app) =>
  app.evaluate(() => globalThis.blinklingTest.composer.isVisible());

/** What the hook script of the terminal session does: one authenticated call
 * to the running Blink. */
const SESSION = "terminal-one";
const address = (app) =>
  app.evaluate(() => globalThis.blinklingCompanion.address);
const rpc = async (app, message) => {
  const { url, token } = await address(app);
  const response = await fetch(url + "/rpc", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(message),
  });
  return response.status;
};
const mirror = (app, line) =>
  rpc(app, { method: "mirror", session: SESSION, ...line });
/** The terminal session's open line to Blink, as its server keeps it. */
const link = async (app) => {
  const { url, token } = await address(app);
  const stop = new AbortController();
  const response = await fetch(
    `${url}/link?session=${SESSION}&pid=1&cwd=/tmp/project&channel=1`,
    { headers: { Authorization: `Bearer ${token}` }, signal: stop.signal },
  );
  const reader = response.body.getReader();
  await reader.read();
  return () => {
    reader.cancel().catch(() => {});
    stop.abort();
  };
};

test("what is typed and answered in the terminal session appears in Blink's chat, as it happened", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("sync");
  let unlink;
  try {
    await background(app);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(600);
    rec.frame("empty");
    unlink = await link(app);
    // The session that opened Blink has the card.
    await rpc(app, { method: "open", session: SESSION });

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
    unlink?.();
    await rec.stop();
    await app.close();
  }
});

test("a question the linked terminal session never takes is answered by Blink with one line saying so, and the late terminal answer is dropped", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("sync", { suffix: "-323" });
  let unlink;
  try {
    await background(app);
    await reveal(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    unlink = await link(app);
    await rpc(app, { method: "open", session: SESSION });
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    await expect.poll(() => cardOpen(app)).toBe(true);
    const card = cardPage(app);
    await card.waitForTimeout(600);
    // The line is open, but the terminal session never starts on the question.
    const input = card.locator(".gl-input");
    await input.fill("what is on my screen?");
    await input.press("Enter");
    await card.waitForTimeout(800);
    rec.frame("waiting");
    await expect(card.locator(".gl-assistant").first()).toContainText(
      say("zh-TW")("undelivered"),
      { timeout: 20000 },
    );
    await expect(card.locator(".gl-assistant")).toHaveCount(2, {
      timeout: 15000,
    });
    await expect(card.locator(".gl-assistant").last()).toContainText("OK.");
    rec.frame("answered");
    // The terminal answers late: Blink does not show a second answer.
    const count = await card.locator(".gl-assistant").count();
    await rpc(app, {
      method: "reply",
      session: SESSION,
      turn: "",
      text: "Late.",
    });
    await card.waitForTimeout(900);
    expect(await card.locator(".gl-assistant").count()).toBe(count);
    await expect(card.locator(".gl-input")).toBeEnabled();
    rec.frame("one answer");
  } finally {
    unlink?.();
    await rec.stop();
    await app.close();
  }
});
