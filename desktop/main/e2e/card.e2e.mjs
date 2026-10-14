import { test, expect } from "@playwright/test";
import { launch, native, moveOn, activeWindow } from "./support.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const visible = (app) =>
  app.evaluate(() => !!globalThis.glimpseletTest.composer?.isVisible());
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Open the card the way hovering Blink does: visible, but not focused. */
async function hoverOpen(c) {
  await moveOn(c.page);
  await c.page.evaluate(() =>
    window.glimpselet.shell({ type: "visibility", value: true }),
  );
  await expect.poll(() => visible(c.app)).toBe(true);
  await expect.poll(() => cardPage(c.app)).toBeTruthy();
  return cardPage(c.app);
}
/** Pointer leaves Blink and the card, and Blink goes back to peek. */
async function leave(c) {
  native(20, 20);
  await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
    timeout: 4000,
  });
  await c.page.waitForTimeout(800);
}
async function unfocus(c) {
  await c.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getFocusedWindow()?.blur();
  });
}

test("H-4 an empty card opened by hover closes when the pointer leaves", async () => {
  const c = await launch();
  try {
    await hoverOpen(c);
    await leave(c);
    await expect.poll(() => visible(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});

test("H-4 a non-empty draft keeps the card open after the pointer leaves", async () => {
  const c = await launch();
  try {
    const card = await hoverOpen(c);
    await card.locator(".gl-input").fill("half a thought");
    await unfocus(c);
    await leave(c);
    expect(await visible(c.app)).toBe(true);
    await card.locator(".gl-input").fill("");
    await expect.poll(() => visible(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});

test("H-4 a pending attachment chip keeps the card open after the pointer leaves", async () => {
  const c = await launch();
  try {
    const card = await hoverOpen(c);
    await card.evaluate(
      (data) =>
        window.conversation.composer.attach({
          id: "chip",
          name: "capture.png",
          mediaType: "image/png",
          data,
        }),
      png,
    );
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await unfocus(c);
    await leave(c);
    expect(await visible(c.app)).toBe(true);
    await card.getByRole("button", { name: "移除 capture.png" }).click();
    await expect.poll(() => visible(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});

test("H-4 an open file dialog keeps the card open after the pointer leaves", async () => {
  const c = await launch();
  try {
    const card = await hoverOpen(c);
    // Stand in for the native chooser, which cannot be driven under Xvfb.
    await card.evaluate(() => {
      HTMLInputElement.prototype.click = function () {};
    });
    await card.getByRole("button", { name: "加入附件" }).click();
    await unfocus(c);
    await leave(c);
    expect(await visible(c.app)).toBe(true);
    await card.evaluate(() =>
      document
        .querySelector("input[type=file]")
        .dispatchEvent(new Event("cancel")),
    );
    await expect.poll(() => visible(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});

test("H-4 a focused empty card stays open until Esc", async () => {
  const c = await launch();
  try {
    const card = await hoverOpen(c);
    // A real click, so the window itself takes the keyboard focus.
    const box = await card.locator(".gl-input").boundingBox();
    const bounds = await c.app.evaluate(() =>
      globalThis.glimpseletTest.composer.getBounds(),
    );
    native(bounds.x + box.x + 20, bounds.y + box.y + 20, "click");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.glimpseletTest.composer.isFocused()),
      )
      .toBe(true);
    await leave(c);
    expect(await visible(c.app)).toBe(true);
    await card.locator(".gl-input").fill("keep me");
    await card.keyboard.press("Escape");
    await expect.poll(() => visible(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});
