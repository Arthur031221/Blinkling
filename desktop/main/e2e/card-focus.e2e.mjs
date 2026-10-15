import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activate,
  launch,
  native,
  moveOn,
  activeWindow,
  typeKeys,
} from "./support.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const composerFocused = (app) =>
  app.evaluate(() => !!globalThis.blinklingTest.composer?.isFocused());

/** Another application holds the keyboard, as it does when the user works. */
async function otherApp() {
  const other = spawn("xmessage", ["-geometry", "500x300+100+100", "other"]);
  await new Promise((resolve) => setTimeout(resolve, 800));
  native(250, 250, "click");
  await expect.poll(activeWindow).toBeGreaterThan(1);
  return { id: activeWindow(), stop: () => other.kill() };
}

/** A browser with a text field, which keeps its own keyboard handling. */
async function browserForm() {
  const dir = mkdtempSync(join(tmpdir(), "blinkling-chrome-"));
  const page =
    "data:text/html," +
    encodeURIComponent(
      '<body style="margin:0"><input id=f style="font:40px sans-serif;width:90%;margin:60px" autofocus>',
    );
  const chrome = spawn("google-chrome", [
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--no-sandbox",
    "--window-position=60,60",
    "--window-size=700,400",
    `--app=${page}`,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  native(300, 140, "click");
  await expect.poll(activeWindow).toBeGreaterThan(1);
  return {
    id: activeWindow(),
    stop: () => {
      chrome.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

for (const [label, open] of [
  [
    "the chat action",
    (c) => c.page.evaluate(() => window.blinkling.action("chat")),
  ],
  [
    "open in chat",
    async (c) => {
      await c.app.evaluate(() =>
        globalThis.blinklingTest.send({
          type: "delta",
          id: "answer",
          text: "One sentence. Another sentence.",
        }),
      );
      const answers = async () => {
        for (const w of c.app.windows())
          if (await w.locator(".gl-bubble-deck").count()) return w;
        return null;
      };
      await expect.poll(async () => !!(await answers())).toBe(true);
      await (await answers()).evaluate(() => window.blinkling.openChat());
    },
  ],
  [
    "a real click on the chat pill",
    async (c) => {
      await moveOn(c.page);
      const pill = c.page.locator('[data-action="chat"]');
      await expect(pill).toBeVisible();
      await c.page.waitForTimeout(600);
      const r = await pill.boundingBox();
      native(r.x + r.width / 2, r.y + r.height / 2, "click");
      await expect.poll(() => cardPage(c.app)).toBeTruthy();
    },
  ],
  [
    "the chat action after hovering opened the card unfocused",
    async (c) => {
      await c.page.evaluate(() =>
        window.blinkling.shell({ type: "visibility", value: true }),
      );
      await expect.poll(() => cardPage(c.app)).toBeTruthy();
      await c.page.evaluate(() => window.blinkling.action("chat"));
    },
  ],
]) {
  test(`E-1 opening the full composer from ${label} gives it the keyboard`, async () => {
    const c = await launch();
    const other = await (label.includes("real click")
      ? browserForm()
      : otherApp());
    try {
      await open(c);
      // One frame at 60 fps after the open request has returned.
      await new Promise((resolve) => setTimeout(resolve, 17));
      expect(await composerFocused(c.app)).toBe(true);
      await expect(cardPage(c.app).locator(".gl-input")).toBeFocused();
      typeKeys("typed here");
      await expect(cardPage(c.app).locator(".gl-input")).toHaveValue(
        "typed here",
      );
      expect(activeWindow()).not.toBe(other.id);
    } finally {
      other.stop();
      await c.close();
    }
  });
}

test("E-1 closing the full composer hands the keyboard back to the previous application", async () => {
  const c = await launch();
  const other = await otherApp();
  try {
    await c.page.evaluate(() => window.blinkling.action("chat"));
    await expect
      .poll(() => composerFocused(c.app), { timeout: 1500 })
      .toBe(true);
    await cardPage(c.app).keyboard.press("Escape");
    await expect.poll(activeWindow, { timeout: 1500 }).toBe(other.id);
  } finally {
    other.stop();
    await c.close();
  }
});

test("E-1 the full composer wins the keyboard back when the window manager hands it to the previous window right after opening", async () => {
  const c = await launch();
  const other = await otherApp();
  try {
    const opened = c.page.evaluate(() => window.blinkling.action("chat"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    activate(other.id);
    await opened;
    await expect
      .poll(() => composerFocused(c.app), { timeout: 1500 })
      .toBe(true);
    typeKeys("recovered");
    await expect(cardPage(c.app).locator(".gl-input")).toHaveValue("recovered");
  } finally {
    other.stop();
    await c.close();
  }
});

test("E-1 a click on another application once the card has settled is respected", async () => {
  const c = await launch();
  const other = await otherApp();
  try {
    await c.page.evaluate(() => window.blinkling.action("chat"));
    await expect
      .poll(() => composerFocused(c.app), { timeout: 1500 })
      .toBe(true);
    // The card re-claims the keyboard for a quarter second to beat a window
    // manager's focus revert; a click after that is the user's decision.
    await new Promise((resolve) => setTimeout(resolve, 400));
    activate(other.id);
    await expect.poll(activeWindow, { timeout: 1500 }).toBe(other.id);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(activeWindow()).toBe(other.id);
  } finally {
    other.stop();
    await c.close();
  }
});

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("E-1 a seeded open carries the draft and chips into a focused card, and typing continues the draft", async () => {
  const c = await launch();
  const other = await otherApp();
  try {
    await c.app.evaluate(
      (_, seed) => globalThis.blinklingTest.openComposer({ seed }),
      {
        conversationId: "c1",
        draft: "look at this",
        attachments: [
          { id: "a", name: "pick.png", mediaType: "image/png", data: png },
        ],
      },
    );
    await expect
      .poll(() => composerFocused(c.app), { timeout: 1500 })
      .toBe(true);
    const card = cardPage(c.app);
    await expect(card.locator(".gl-input")).toHaveValue("look at this");
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    typeKeys(" now");
    await expect(card.locator(".gl-input")).toHaveValue("look at this now");
    expect(activeWindow()).not.toBe(other.id);
  } finally {
    other.stop();
    await c.close();
  }
});

test("E-1 a bad seed is refused and opens nothing", async () => {
  const c = await launch();
  try {
    const refused = await c.app.evaluate(async () => {
      try {
        await globalThis.blinklingTest.openComposer({ seed: { draft: 5 } });
        return false;
      } catch {
        return true;
      }
    });
    expect(refused).toBe(true);
    expect(
      await c.app.evaluate(
        () => !!globalThis.blinklingTest.composer?.isVisible(),
      ),
    ).toBe(false);
  } finally {
    await c.close();
  }
});

test("E-1 sending from the card closes it and hands the keyboard back to the previous application", async () => {
  const c = await launch();
  const other = await otherApp();
  try {
    await c.page.evaluate(() => window.blinkling.action("chat"));
    await expect
      .poll(() => composerFocused(c.app), { timeout: 1500 })
      .toBe(true);
    const card = cardPage(c.app);
    typeKeys("hello");
    await expect(card.locator(".gl-input")).toHaveValue("hello");
    native(20, 20);
    await card.locator(".gl-input").press("Enter");
    await expect
      .poll(() =>
        c.app.evaluate(() => !!globalThis.blinklingTest.composer?.isVisible()),
      )
      .toBe(false);
    await expect.poll(activeWindow, { timeout: 1500 }).toBe(other.id);
  } finally {
    other.stop();
    await c.close();
  }
});

test("E-2 unpinning with the pointer on the card keeps it open", async () => {
  const c = await launch();
  try {
    await c.page.evaluate(() =>
      window.blinkling.shell({ type: "visibility", value: true }),
    );
    await expect.poll(() => cardPage(c.app)).toBeTruthy();
    const card = cardPage(c.app);
    const pin = card.locator(".gl-card-header button[aria-pressed]");
    await pin.click();
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await pin.click();
    await expect(pin).toHaveAttribute("aria-pressed", "false");
    // It used to fold half a second after unpinning, under the pointer.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(
      await c.app.evaluate(
        () => !!globalThis.blinklingTest.composer?.isVisible(),
      ),
    ).toBe(true);
  } finally {
    await c.close();
  }
});
