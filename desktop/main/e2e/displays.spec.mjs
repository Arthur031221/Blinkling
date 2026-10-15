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
  test(`every bubble, the open-in-chat bubble included, stays clear of Blink and its fan along the ${edge} of a narrow display beside the primary`, async () => {
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
      const text = Array.from({ length: 9 }, (_, n) => `Sentence ${n}.`);
      await c.app.evaluate((_electron, text) => {
        globalThis.blinklingTest.send({
          type: "message",
          id: "seam-long",
          role: "assistant",
          content: [{ type: "text", text: text.join(" ") }],
          complete: true,
        });
      }, text);
      const deck = c.app
        .windows()
        .find(
          (p) =>
            p.url().includes("composer/index.html") &&
            !p.url().includes("surface=card"),
        );
      const rows = deck.locator("[data-kind]");
      await expect(
        deck.locator('[data-kind="open-chat"] button'),
      ).toBeVisible();
      await hover(c);
      await c.page.waitForTimeout(400);
      const win = await c.app.evaluate(() =>
        globalThis.blinklingTest.bubbles.getBounds(),
      );
      const boxes = (
        await rows.evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        )
      )
        .map((r) => ({ ...r, x: win.x + r.x, y: win.y + r.y }))
        // Older rows scroll out of the bubbles window; only what is shown counts.
        .map((r) => {
          const x = Math.max(r.x, win.x),
            y = Math.max(r.y, win.y);
          return {
            x,
            y,
            width: Math.min(r.x + r.width, win.x + win.width) - x,
            height: Math.min(r.y + r.height, win.y + win.height) - y,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0);
      expect(boxes.length).toBeGreaterThan(2);
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
      // The fan opens on hover; no answer row may sit under one of its pills.
      const fan = (
        await c.page.locator(".action-bubble").evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        )
      ).map((r) => ({ ...r, x: d.x + r.x, y: d.y + r.y }));
      expect(fan).toHaveLength(5);
      for (const r of boxes)
        for (const pill of fan)
          expect(
            r.x < pill.x + pill.width &&
              pill.x < r.x + r.width &&
              r.y < pill.y + pill.height &&
              pill.y < r.y + r.height,
            JSON.stringify({ r, pill }),
          ).toBe(false);
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

const deckPage = (c) =>
  c.app
    .windows()
    .find(
      (p) =>
        p.url().includes("composer/index.html") &&
        !p.url().includes("surface=card"),
    );
/** Screen boxes of the answer rows that can be seen right now. */
async function shownRows(c) {
  const win = await c.app.evaluate(() =>
    globalThis.blinklingTest.bubbles.getBounds(),
  );
  const rows = await deckPage(c)
    .locator("[data-kind]")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        const deck = n.closest(".gl-bubble-deck");
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          opacity:
            Number(getComputedStyle(n).opacity) *
            Number(getComputedStyle(deck).opacity),
        };
      }),
    );
  return rows
    .filter((r) => r.opacity > 0.05 && r.width > 0)
    .map((r) => ({ ...r, x: win.x + r.x, y: win.y + r.y }));
}
const crosses = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test("dragging Blink takes the answer bubbles with it: none is left over the old spot, none floats over the page mid-drag", async () => {
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
      globalThis.blinklingTest.send({
        type: "message",
        id: "drag-a",
        role: "assistant",
        content: [{ type: "text", text: "First one. Second one. Third one." }],
        complete: true,
      });
    });
    await expect.poll(async () => (await shownRows(c)).length).toBe(3);
    const before = await shownRows(c);
    await hover(c);
    const p = await rigPoint(c.page),
      s = await state(c);
    native(s.display.bounds.x + p.x, s.display.bounds.y + p.y, "down");
    native(s.display.bounds.x + p.x - 10, s.display.bounds.y + p.y - 10);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native(40, 500);
    await c.page.waitForTimeout(500);
    await desktopShot(c.app, "drag-answers-hidden");
    // While Blink is carried, the stack is out of the way of the page.
    expect(await shownRows(c)).toEqual([]);
    native(40, 500, "up");
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drop");
    // It comes back beside Blink's new place, and nothing stays at the old one.
    await expect.poll(async () => (await shownRows(c)).length).toBe(3);
    await c.page.waitForTimeout(400);
    await desktopShot(c.app, "drag-answers-returned");
    const after = await shownRows(c);
    expect((await state(c)).position.edge).toBe("left");
    for (const a of after)
      for (const b of before) expect(crosses(a, b)).toBe(false);
  } finally {
    await c.app.close();
    await rm(data, { recursive: true, force: true });
  }
});
