import { test, expect } from "@playwright/test";
import { execFileSync } from "../e2e/exec.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  launch,
  native,
  rigPoint,
  bodyBox,
  desktopShot,
  report,
} from "./support.mjs";
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
    const body = await bodyBox(c.page);
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
    expect(bounds).toHaveLength(5);
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
for (const [edge, y] of [
  ["top", 20],
  ["bottom", 590],
])
  test(`the answer card stays clear of Blink and inside the display along the ${edge} of a narrow display beside the primary`, async () => {
    randr(
      "--output",
      "DUMMY1",
      "--mode",
      "800x600",
      "--right-of",
      "DUMMY0",
      "--output",
      "DUMMY0",
      "--mode",
      "1280x800",
    );
    const data = await mkdtemp(join(tmpdir(), "blink-seam-"));
    const c = await launch(1, "light", data);
    try {
      await expect
        .poll(() =>
          c.app.evaluate(({ screen }) => screen.getAllDisplays().length),
        )
        .toBe(2);
      // Midway along the top or bottom of the second display neither side of
      // Blink has room for a full card.
      await dragTo(c, 1280 + 400, y);
      const s = await state(c);
      expect(s.display.bounds.x).toBe(1280);
      expect(s.position.edge).toBe(edge);
      await c.app.evaluate(() => {
        globalThis.blinklingTest.session.emit({
          type: "delta",
          id: "seam-long",
          text: Array.from({ length: 9 }, (_, n) => `Sentence ${n}.`).join(" "),
        });
      });
      await expect
        .poll(() =>
          c.app.evaluate(() => globalThis.blinklingTest.composer?.isVisible()),
        )
        .toBe(true);
      await c.page.waitForTimeout(400);
      const win = await c.app.evaluate(() =>
        globalThis.blinklingTest.composer.getBounds(),
      );
      const boxes = [win];
      const body = await bodyBox(c.page);
      const blink = {
        x: s.display.bounds.x + body.x,
        y: s.display.bounds.y + body.y,
        width: body.width,
        height: body.height,
      };
      await desktopShot(c.app, `seam-open-in-chat-${edge}`);
      const apart = (r) =>
        r.x + r.width <= blink.x ||
        blink.x + blink.width <= r.x ||
        r.y + r.height <= blink.y ||
        blink.y + blink.height <= r.y;
      const d = s.display.bounds;
      for (const r of boxes) {
        expect(apart(r), JSON.stringify({ r, blink })).toBe(true);
        expect(r.x).toBeGreaterThanOrEqual(d.x);
        expect(r.x + r.width).toBeLessThanOrEqual(d.x + d.width);
        expect(r.y).toBeGreaterThanOrEqual(d.y);
        expect(r.y + r.height).toBeLessThanOrEqual(d.y + d.height);
      }
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

/** The card's window box while it is shown, else null. */
const shownCard = (c) =>
  c.app.evaluate(() => {
    const w = globalThis.blinklingTest.composer;
    return w?.isVisible() ? w.getBounds() : null;
  });
const crosses = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test("dragging Blink takes the open card with it: it ends beside Blink's new place and nothing stays at the old one", async () => {
  randr(
    "--output",
    "DUMMY1",
    "--off",
    "--output",
    "DUMMY0",
    "--mode",
    "1280x800",
  );
  const data = await mkdtemp(join(tmpdir(), "blink-drag-"));
  const c = await launch(1, "light", data);
  try {
    await c.app.evaluate(() => {
      globalThis.blinklingTest.session.emit({
        type: "delta",
        id: "drag-a",
        text: "First one. Second one. Third one.",
      });
    });
    await expect.poll(() => shownCard(c)).not.toBeNull();
    const before = await shownCard(c);
    await hover(c);
    const p = await rigPoint(c.page),
      s = await state(c);
    native(s.display.bounds.x + p.x, s.display.bounds.y + p.y, "down");
    await c.page.waitForTimeout(150);
    native(s.display.bounds.x + p.x - 10, s.display.bounds.y + p.y - 10);
    await c.page.waitForTimeout(300);

    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native(40, 500);
    await c.page.waitForTimeout(500);
    await desktopShot(c.app, "drag-card-moving");
    native(40, 500, "up");
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drop");
    expect((await state(c)).position.edge).toBe("left");
    // It sits beside Blink's new place, and nothing stays at the old one.
    const want = await c.app.evaluate(() =>
      globalThis.blinklingTest.cardBounds(),
    );
    await expect.poll(() => shownCard(c)).toEqual(want);
    await c.page.waitForTimeout(400);
    await desktopShot(c.app, "drag-card-returned");
    expect(crosses(await shownCard(c), before)).toBe(false);
  } finally {
    await c.app.close();
    await rm(data, { recursive: true, force: true });
  }
});
