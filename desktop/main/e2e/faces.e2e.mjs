import { test, expect } from "@playwright/test";
import {
  native,
  typeKeys,
  launch,
  desktopShot,
  rigPoint,
  moveOn,
  background,
} from "./support.mjs";
import { timing } from "../../shared/motion.mjs";

const send = (c, event) =>
  c.app.evaluate((_, e) => globalThis.blinklingTest.send(e), event);
const face = (c) => c.page.locator("#blink").getAttribute("data-face");
const dotOpacity = (c) =>
  c.page.evaluate(
    () => +document.querySelector("[data-connection]").getAttribute("opacity"),
  );
const fan = (c) =>
  c.page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll(".action-bubble")].map(
        (b) => +b.style.opacity,
      ),
    ),
  );
// Share of pixels that differ between two shots inside a box.
function changed(a, b, box) {
  let n = 0;
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * a.width + x) * 4;
      if (
        Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]) >
        48
      )
        n++;
    }
  return n / (box.width * box.height);
}

test("the fan waits for Blink to rest: a pass-by never opens it", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    // Revealing slides Blink inward: let it settle, then follow it.
    const first = await rigPoint(c.page);
    native(first.x, first.y);
    await expect(c.page.locator("#blink")).toHaveAttribute(
      "data-mode",
      "hover",
    );
    await c.page.waitForTimeout(900);
    const p = await rigPoint(c.page);
    native(p.x, p.y);
    await c.page.waitForTimeout(timing.menuRest - 200);
    native(20, 20);
    await c.page.waitForTimeout(100);
    expect(await fan(c), "a 200 ms pass-by").toBe(0);
    native(p.x, p.y);
    await c.page.waitForTimeout(timing.menuRest - 150);
    expect(await fan(c), "just before the rest time").toBeLessThan(0.05);
    await expect.poll(() => fan(c), { timeout: 3000 }).toBeGreaterThan(0.95);
  } finally {
    await c.close();
  }
});

test("picking Blink up closes the fan at once", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    await expect.poll(() => fan(c), { timeout: 4000 }).toBeGreaterThan(0.95);
    native(p.x, p.y, "down");
    native(p.x - 30, p.y + 10);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-drag", "true");
    expect(await fan(c)).toBe(0);
    native(p.x - 30, p.y + 10, "up");
    expect(await fan(c)).toBe(0);
  } finally {
    await c.close();
  }
});

test("thinking shows within 100 ms of sending", async () => {
  const c = await launch();
  try {
    await c.page.evaluate(() => {
      window.faceAt = new Promise((resolve) => {
        const tick = () =>
          document.querySelector("#blink").dataset.face === "thinking"
            ? resolve(Date.now())
            : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
      });
    });
    const sentAt = await c.app.evaluate(() => {
      const at = Date.now();
      globalThis.blinklingTest.send({ type: "sending" });
      return at;
    });
    const shownAt = await c.page.evaluate(() => window.faceAt);
    expect(shownAt - sentAt).toBeLessThan(timing.thinkingFace);
  } finally {
    await c.close();
  }
});

test("the connection dot shows only for trouble", async () => {
  const c = await launch();
  try {
    await send(c, { type: "status", state: "connected" });
    await expect.poll(() => dotOpacity(c)).toBe(0);
    await send(c, { type: "status", state: "retrying" });
    await expect.poll(() => dotOpacity(c)).toBeGreaterThan(0.3);
    await send(c, { type: "status", state: "blocked" });
    await expect.poll(() => dotOpacity(c)).toBe(1);
    await send(c, { type: "status", state: "connected" });
    await expect.poll(() => dotOpacity(c)).toBe(0);
  } finally {
    await c.close();
  }
});

for (const scale of [1, 2])
  for (const theme of ["light", "dark"])
    test(`each face reads at the peek, ${scale * 100}% ${theme}`, async () => {
      const c = await launch(scale, theme);
      try {
        await background(c.app);
        native(20, 20);
        await expect(c.page.locator("#blink")).toHaveAttribute(
          "data-mode",
          "peek",
        );
        await c.page.waitForTimeout(1500);
        const box = await c.page.evaluate(() => {
          const r = document.querySelector("#blink").getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        const crop = {
          x: Math.max(0, Math.round(box.x * scale)),
          y: Math.max(0, Math.round(box.y * scale)),
          width: Math.round(box.width * scale),
          height: Math.round(box.height * scale),
        };
        const idle = await desktopShot(c.app, `face-idle-${scale}-${theme}`);
        const cases = {
          thinking: { type: "sending" },
          permission: { type: "activity", state: "permission" },
          "usage-limit": { type: "usage-limit", resetAt: Date.now() + 36e5 },
          error: { type: "activity", state: "error" },
          lock: { type: "guard", locked: true },
        };
        for (const [name, event] of Object.entries(cases)) {
          await send(c, event);
          await expect.poll(() => face(c)).toBe(name);
          await c.page.waitForTimeout(700);
          const shot = await desktopShot(
            c.app,
            `face-${name}-${scale}-${theme}`,
          );
          expect(changed(idle, shot, crop), name).toBeGreaterThan(0.01);
          // Reset to idle for the next case.
          await send(c, { type: "guard", locked: false });
          await send(c, { type: "usage-limit", resetAt: null });
          await send(c, { type: "activity", state: "idle" });
          await expect.poll(() => face(c)).toBe("idle");
          await c.page.waitForTimeout(500);
        }
      } finally {
        await c.close();
      }
    });

test("every window is called Blinkling, whatever the page says", async () => {
  const c = await launch();
  try {
    await c.app.evaluate(() =>
      globalThis.blinklingTest.menuFaces.openComposer(false),
    );
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.titles()),
      )
      .toContain("Blinkling");
    const titles = await c.app.evaluate(() =>
      globalThis.blinklingTest.menuFaces.titles(),
    );
    expect(titles.length).toBeGreaterThan(1);
    expect(new Set(titles)).toEqual(new Set(["Blinkling"]));
    await c.page.evaluate(() => {
      document.title = "Blink";
    });
    await c.page.waitForTimeout(200);
    expect(
      await c.app.evaluate(() => globalThis.blinklingTest.blink.getTitle()),
    ).toBe("Blinkling");
  } finally {
    await c.close();
  }
});

test("Esc closes the topmost layer only: the mini composer, then the marks", async () => {
  const c = await launch();
  try {
    await c.app.evaluate(async () => {
      await globalThis.blinklingTest.overlay([
        { rect: { x: 100, y: 100, width: 80, height: 60 } },
      ]);
      await globalThis.blinklingTest.menuFaces.openComposer(false);
    });
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.topLayer()),
      )
      .toBe("mini");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.escapeGrabbed),
      )
      .toBe(true);
    native(300, 300);
    typeKeys("", "Escape");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.topLayer()),
      )
      .toBe("marks");
    expect(
      await c.app.evaluate(() => globalThis.blinklingTest.snapshot().chatOpen),
    ).toBe(false);
    typeKeys("", "Escape");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.topLayer()),
      )
      .toBe(null);
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.menuFaces.escapeGrabbed),
      )
      .toBe(false);
  } finally {
    await c.close();
  }
});
