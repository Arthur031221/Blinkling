import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, native, rigPoint, desktopShot, report } from "./support.mjs";
const randr = (...args) => execFileSync("xrandr", args);
const state = (c) => c.app.evaluate(() => globalThis.blinklingTest.snapshot());
async function hover(c) {
  const p = await rigPoint(c.page),
    s = await state(c);
  native(s.display.bounds.x + p.x, s.display.bounds.y + p.y);
  await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "hover");
  await c.page.waitForTimeout(550);
}
async function dragTo(c, x, y) {
  await hover(c);
  const p = await rigPoint(c.page),
    s = await state(c);
  native(s.display.bounds.x + p.x, s.display.bounds.y + p.y, "down");
  native(s.display.bounds.x + p.x - 10, s.display.bounds.y + p.y - 10);
  await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
  native(x, y);
  await c.page.waitForTimeout(300);
  expect((await state(c)).drag).not.toBeNull();
  await desktopShot(c.app, "cross-display-drag");
  native(x, y, "up");
  await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drop");
  await c.page.waitForTimeout(600);
}
test("native RandR hotplug, cross-display dragging, per-display restart and resolution recovery", async () => {
  randr(
    "--output",
    "DUMMY1",
    "--off",
    "--output",
    "DUMMY0",
    "--mode",
    "1280x800",
  );
  const data = await mkdtemp(join(tmpdir(), "blink-displays-"));
  let c = await launch(1, "light", data);
  try {
    await dragTo(c, 40, 500);
    const first = await state(c);
    expect(first.position.edge).toBe("left");
    randr("--output", "DUMMY1", "--mode", "800x600", "--right-of", "DUMMY0");
    await writeFile(
      join(report, "randr-monitors.txt"),
      execFileSync("xrandr", ["--listmonitors"]),
    );
    await writeFile(
      join(report, "randr-displays.json"),
      JSON.stringify(
        await c.app.evaluate(({ screen }) => screen.getAllDisplays()),
        null,
        2,
      ),
    );
    await expect
      .poll(() =>
        c.app.evaluate(({ screen }) => screen.getAllDisplays().length),
      )
      .toBe(2);
    await dragTo(c, 2035, 475);
    const second = await state(c);
    expect(second.display.id).not.toBe(first.display.id);
    expect(second.display.bounds.x).toBe(1280);
    expect(second.position.edge).toBe("right");
    await desktopShot(c.app, "second-display-drop");
    await c.app.close();
    c = await launch(1, "dark", data);
    const restored = await state(c);
    expect(restored.display.id).toBe(second.display.id);
    expect(restored.position.ratio).toBeCloseTo(second.position.ratio, 6);
    await c.page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: true }),
    );
    randr("--output", "DUMMY1", "--off");
    await expect
      .poll(async () => (await state(c)).display.id)
      .toBe(first.display.id);
    expect((await state(c)).position.ratio).toBeCloseTo(
      first.position.ratio,
      6,
    );
    const card = await c.app.evaluate(() =>
      globalThis.blinklingTest.composer.getBounds(),
    );
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(1280);
    await c.page.waitForTimeout(550);
    const body = await c.page.locator('rect[fill="#3ddc97"]').boundingBox();
    expect(body.x + body.width).toBeLessThan(card.x);
    await desktopShot(c.app, "display-removed-pinned-card");
    randr("--output", "DUMMY0", "--mode", "800x600");
    await expect
      .poll(async () => (await state(c)).display.bounds.width)
      .toBe(800);
    expect((await state(c)).position.ratio).toBeCloseTo(
      first.position.ratio,
      6,
    );
    await c.page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
    await hover(c);
    const bounds = await c.page.locator(".action-bubble").evaluateAll((bs) =>
      bs.map((b) => {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
    );
    expect(bounds).toHaveLength(4);
    expect(
      bounds.every(
        (r) => r.x >= 0 && r.y >= 0 && r.right <= 800 && r.bottom <= 600,
      ),
    ).toBe(true);
    await desktopShot(c.app, "resolution-recovered-menu");
    const positions = await c.app.evaluate(
      () => globalThis.blinklingTest.positionStore.positions,
    );
    expect(Object.keys(positions)).toHaveLength(2);
    await writeFile(
      join(report, "display-test.json"),
      JSON.stringify({ first, second, restored, positions }, null, 2),
    );
  } finally {
    await c.app.close();
    await rm(data, { recursive: true, force: true });
    randr(
      "--output",
      "DUMMY1",
      "--off",
      "--output",
      "DUMMY0",
      "--mode",
      "1280x800",
    );
  }
});
