import { test, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, nativeClick } from "./support.mjs";
import {
  background,
  native,
  rigPoint,
  desktopShot,
  report,
} from "../main/e2e/support.mjs";

/** A window that logs a CSP violation or throws did not draw; fail on both. */
const watch = (page, errors) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
const find = (app, pattern) => app.windows().find((p) => pattern.test(p.url()));

async function wake(app) {
  const page = await app.firstWindow();
  await expect(page.getByRole("img", { name: "Blink" })).toBeVisible();
  await expect
    .poll(() => app.evaluate(() => Boolean(globalThis.blinklingTest)))
    .toBe(true);
  native(30, 30);
  await page.waitForFunction(() => window.desktop.inspect().anchor);
  return page;
}
/** Rest the pointer on Blink's body until the fan is open and settled. Blink
 * walks to meet the pointer, so the point is measured live, not once. */
async function rest(page) {
  const on = await rigPoint(page);
  native(on.x, on.y);
  await page.waitForFunction(() => window.desktop.inspect().fan.open);
  await page.waitForTimeout(500);
  return rigPoint(page);
}
const shown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".action-bubble")].map((b) => ({
      id: b.dataset.action,
      named: b.classList.contains("expanded"),
      label: (() => {
        const l = b.querySelector(".action-label");
        const r = l.getBoundingClientRect();
        return {
          text: l.querySelector("strong").textContent,
          opacity: Number(getComputedStyle(l).opacity),
          width: r.width,
          height: r.height,
        };
      })(),
    })),
  );

test("first use names the four bubbles once; Settings opens, changes the hotkey and replays the welcome", async () => {
  test.setTimeout(120000);
  await mkdir(report, { recursive: true });
  process.env.BLINKLING_TEST_DATA = await mkdtemp(
    join(tmpdir(), "blinkling-ms-"),
  );
  const data = process.env.BLINKLING_TEST_DATA;
  const app = await launch();
  try {
    const errors = [];
    const page = await wake(app);
    watch(page, errors);
    // NS-4: the first fan carries all four names.
    await rest(page);
    const first = await shown(page);
    expect(first.map((b) => b.named)).toEqual([true, true, true, true]);
    expect(
      first.every((b) => b.label.opacity > 0.9 && b.label.height < 51),
    ).toBe(true);
    await desktopShot(app, "menu-windows-first-fan");
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.uiOnce.seen("fan-labels")),
      )
      .toBe(true);
    // Leave: the fan closes and the next opening is the quiet one.
    native(600, 500);
    await page.waitForFunction(() => !window.desktop.inspect().fan.open);
    await page.waitForTimeout(600);
    await rest(page);
    expect((await shown(page)).map((b) => b.named)).toEqual([
      false,
      false,
      false,
      false,
    ]);

    // NS-1: the Settings bubble opens the window.
    const bubble = await page.locator('[data-action="settings"]').boundingBox();
    nativeClick(
      Math.round(bubble.x + bubble.width / 2),
      Math.round(bubble.y + bubble.height / 2),
    );
    await expect.poll(() => !!find(app, /\/settings\/index\.html$/)).toBe(true);
    const settings = find(app, /\/settings\/index\.html$/);
    watch(settings, errors);
    await expect(settings.locator("#settings")).toHaveClass(/is-open/);
    await expect(settings.locator("#settings-title")).toHaveText("設定");
    await expect(settings.locator("#row-pick")).toBeHidden();
    await expect(settings.locator("#about-version")).toContainText(
      /\d+\.\d+\.\d+/,
    );
    await expect(
      settings.locator("[data-wordmark] svg, [data-wordmark] *").first(),
    ).toBeAttached();
    await desktopShot(app, "menu-windows-settings");

    // NS-5: the hotkey shows and changes.
    const before = await app.evaluate(
      () => globalThis.blinklingTest.features.hotkey,
    );
    await expect(settings.locator("#hotkey-label")).toContainText(/[A-Za-z]/);
    await settings.locator("#hotkey-change").click();
    await settings.keyboard.press("Control+Alt+J");
    await expect(settings.locator("#hotkey-note")).toHaveAttribute(
      "data-kind",
      "info",
    );
    const after = await app.evaluate(
      () => globalThis.blinklingTest.features.hotkey,
    );
    expect(after).not.toBe(before);
    expect(after).toMatch(/J$/);
    await desktopShot(app, "menu-windows-hotkey");
    // A bare key is refused and the saved one stays.
    await settings.locator("#hotkey-change").click();
    await settings.keyboard.press("J");
    await settings.keyboard.press("Escape");
    expect(
      await app.evaluate(() => globalThis.blinklingTest.features.hotkey),
    ).toBe(after);

    // Start with Claude Code is stored where the launcher reads it.
    await settings.locator("#start-switch").click();
    await expect
      .poll(
        async () =>
          JSON.parse(
            await readFile(join(data, "settings.json"), "utf8").catch(
              () => "{}",
            ),
          ).startWithClaudeCode,
      )
      .toBe(false);
    await expect(settings.locator("#start-switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // NS-2: Help replays the welcome; Settings steps aside.
    await settings.locator('[data-help="welcome"]').click();
    await expect.poll(() => !!find(app, /\/welcome\/index\.html$/)).toBe(true);
    const welcome = find(app, /\/welcome\/index\.html$/);
    watch(welcome, errors);
    await expect(welcome.locator("#welcome")).toHaveClass(/is-open/);
    await expect(welcome.locator("section.welcome-step")).toHaveCount(3);
    await expect(welcome.locator("[data-wordmark] *").first()).toBeAttached();
    await welcome.waitForTimeout(600);
    await desktopShot(app, "menu-windows-welcome-1");
    await welcome.locator("#welcome-next").click();
    await expect(welcome.locator('section[data-step="2"]')).toHaveClass(
      /is-current/,
    );
    await expect(welcome.locator("[data-safety]")).not.toBeEmpty();
    await welcome.waitForTimeout(600);
    await desktopShot(app, "menu-windows-welcome-2");
    await welcome.locator("#welcome-next").click();
    await expect(welcome.locator("#pick-host *").first()).toBeAttached();
    await welcome.waitForTimeout(1500);
    await desktopShot(app, "menu-windows-welcome-3");
    await welcome.keyboard.press("Escape");
    await expect(welcome.locator("#welcome")).not.toHaveClass(/is-open/);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("the welcome opens by itself on the first start only, and the fan closes over the mini composer", async () => {
  test.setTimeout(120000);
  process.env.BLINKLING_TEST_DATA = await mkdtemp(
    join(tmpdir(), "blinkling-mw-"),
  );
  process.env.BLINKLING_WELCOME = "1";
  let app = await launch();
  try {
    await wake(app);
    await expect.poll(() => !!find(app, /\/welcome\/index\.html$/)).toBe(true);
    const welcome = find(app, /\/welcome\/index\.html$/);
    await expect(welcome.locator("#welcome")).toHaveClass(/is-open/);
    await welcome.waitForTimeout(600);
    await desktopShot(app, "menu-windows-first-start");
    await welcome.locator("#welcome-close").click();
    await expect(welcome.locator("#welcome")).not.toHaveClass(/is-open/);
  } finally {
    await app.close();
  }
  app = await launch();
  try {
    await background(app);
    const page = await wake(app);
    await page.waitForTimeout(1500);
    expect(
      await app.evaluate(
        () => globalThis.blinklingTest.welcome.test.controller.isOpen,
      ),
    ).toBe(false);
    // NS-3: with the mini composer open the fan stays shut while Blink is hovered.
    const point = await rest(page);
    expect((await shown(page)).map((b) => b.named)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    native(point.x, point.y, "click");
    await page.waitForFunction(() => window.desktop.inspect().shell.miniOpen);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => !window.desktop.inspect().fan.open);
    expect(await page.evaluate(() => window.desktop.inspect().fan.open)).toBe(
      false,
    );
    await desktopShot(app, "menu-windows-mini-no-fan");
  } finally {
    delete process.env.BLINKLING_WELCOME;
    await app.close();
  }
});
