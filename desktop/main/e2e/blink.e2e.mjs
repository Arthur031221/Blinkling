import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  report,
  native,
  launch,
  desktopShot,
  moveOn,
  rigPoint,
  background,
} from "./support.mjs";

const hooks = (app) =>
  app.evaluate(() => Object.keys(globalThis.blinklingTest.nBlinkMenuFaces));
const cardPage = (c) =>
  c.app.windows().find((p) => p.url().includes("surface=card"));
const composerOpen = (c) =>
  c.app.evaluate(() => !!globalThis.blinklingTest.composer?.isVisible());
const emit = (c, event) =>
  c.app.evaluate((_, event) => globalThis.blinklingTest.send(event), event);

/** Highest number of bubbles that were at least a little visible at any frame
 * of the next `ms`, so a fan that flashes open and shut is still caught. */
const sampleOpen = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let most = 0;
        const start = performance.now();
        const frame = (now) => {
          const shown = [...document.querySelectorAll("[data-action]")].filter(
            (b) => Number(getComputedStyle(b).opacity) > 0.1,
          ).length;
          most = Math.max(most, shown);
          if (now - start < ms) requestAnimationFrame(frame);
          else resolve(most);
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );
const place = async (c, edge, ratio = 0.5) => {
  await c.app.evaluate(
    async ({ screen }, { edge, ratio }) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    { edge, ratio },
  );
  await expect
    .poll(() =>
      c.app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
    )
    .toBe(edge);
};
const rects = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-action]")]
      .filter((b) => Number(getComputedStyle(b).opacity) > 0.1)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          id: b.dataset.action,
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
        };
      }),
  );
const overlaps = (list) =>
  list.some((a, i) =>
    list
      .slice(i + 1)
      .some(
        (b) =>
          a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom,
      ),
  );

test("the fan has four bubbles and nothing beside Blink to pin", async () => {
  const c = await launch();
  try {
    expect(await hooks(c.app)).toContain("escapeKeys");
    await background(c.app);
    native(20, 20);
    await moveOn(c.page);
    await expect(c.page.locator("[data-action]")).toHaveCount(4);
    expect(
      await c.page.evaluate(() =>
        [...document.querySelectorAll("[data-action]")].map(
          (b) => b.dataset.action,
        ),
      ),
    ).toEqual(["capture", "guide", "auto-explain", "settings"]);
    await expect(c.page.locator("#pin, #auto-badge")).toHaveCount(0);
    await expect(
      c.page.locator('[data-action="auto-explain"]'),
    ).toHaveAttribute("role", "switch");
    await desktopShot(c.app, "blink-fan-four");
  } finally {
    await c.close();
  }
});

test("the fan opens after a 300 ms rest, not on a pass-by or a wake", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    const p = await rigPoint(c.page);
    // A pass-by: the pointer is on Blink for well under 200 ms.
    const passing = sampleOpen(c.page, 1200);
    native(p.x, p.y);
    native(20, 20);
    expect(await passing).toBe(0);
    // A rest does.
    const resting = sampleOpen(c.page, 1500);
    native(p.x, p.y);
    expect(await resting).toBe(4);
    native(20, 20);
    await expect.poll(() => sampleOpen(c.page, 100)).toBe(0);
    // Blink waking for a permission request or an answer does not open it.
    const waking = sampleOpen(c.page, 1500);
    await emit(c, { type: "activity", state: "permission" });
    await emit(c, { type: "delta", id: "wake", text: "Hello there." });
    expect(await waking).toBe(0);
  } finally {
    await c.close();
  }
});

test("a click on Blink opens the focused composer; a drag past 4 px does not", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    // A press that travels 3 px is still a click.
    native(p.x, p.y, "down");
    native(p.x + 3, p.y);
    native(p.x + 3, p.y, "up");
    await expect.poll(() => composerOpen(c)).toBe(true);
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
      )
      .toBe(true);
    await cardPage(c).keyboard.press("Escape");
    await expect.poll(() => composerOpen(c)).toBe(false);
    await moveOn(c.page);
    const q = await rigPoint(c.page);
    native(q.x, q.y, "down");
    native(q.x + 30, q.y - 10);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native(q.x + 30, q.y - 10, "up");
    await c.page.waitForTimeout(400);
    expect(await composerOpen(c)).toBe(false);
  } finally {
    await c.close();
  }
});

test("Esc closes only the topmost layer: the mini composer, then guide mode", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await c.app.evaluate(({ globalShortcut }) => {
      const keys = globalThis.blinklingTest.nBlinkMenuFaces;
      globalThis.closed = [];
      keys.escapeKeys.set("guide", () => globalThis.closed.push("guide"));
      globalThis.guideShortcut = () => globalShortcut.isRegistered("Escape");
    });
    expect(await c.app.evaluate(() => globalThis.guideShortcut())).toBe(true);
    await c.app.evaluate(() =>
      globalThis.blinklingTest.nBlinkMenuFaces.openCard(true),
    );
    await expect.poll(() => composerOpen(c)).toBe(true);
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
      )
      .toBe(true);
    await cardPage(c).keyboard.press("Escape");
    await expect.poll(() => composerOpen(c)).toBe(false);
    expect(await c.app.evaluate(() => globalThis.closed)).toEqual([]);
    // Guide mode is now the top layer; the global key closes it.
    expect(await c.app.evaluate(() => globalThis.guideShortcut())).toBe(true);
    expect(
      await c.app.evaluate(() =>
        globalThis.blinklingTest.nBlinkMenuFaces.escapeKeys.press(),
      ),
    ).toBe("guide");
    expect(await c.app.evaluate(() => globalThis.closed)).toEqual(["guide"]);
    expect(await c.app.evaluate(() => globalThis.guideShortcut())).toBe(false);
  } finally {
    await c.close();
  }
});

test("hovering Blink at the top edge does not make it lunge", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await place(c, "top");
    native(20, 400);
    await c.page.waitForTimeout(700);
    const before = (await rigPoint(c.page)).y;
    const moved = c.page.evaluate(
      () =>
        new Promise((resolve) => {
          const body = document.querySelector('rect[fill="#3ddc97"]');
          const y0 = body.getBoundingClientRect().y;
          let far = 0;
          const start = performance.now();
          const frame = (now) => {
            far = Math.max(far, Math.abs(body.getBoundingClientRect().y - y0));
            if (now - start < 1500) requestAnimationFrame(frame);
            else resolve(far);
          };
          requestAnimationFrame(frame);
        }),
    );
    const p = await rigPoint(c.page);
    expect(Math.abs(p.y - before)).toBeLessThan(1);
    native(p.x, p.y);
    expect(await moved).toBeLessThanOrEqual(90);
  } finally {
    await c.close();
  }
});

for (const edge of ["left", "right", "top", "bottom"])
  test(`at 200% the fan fits and never overlaps on the ${edge} edge`, async () => {
    const c = await launch(2);
    try {
      await background(c.app);
      await place(c, edge, 0.5);
      await c.page.waitForTimeout(900);
      await moveOn(c.page, 2);
      await c.page.waitForTimeout(500);
      const list = await rects(c.page);
      expect(list).toHaveLength(4);
      const size = await c.page.evaluate(() => [innerWidth, innerHeight]);
      expect(
        list.every(
          (r) =>
            r.x >= 0 && r.y >= 0 && r.right <= size[0] && r.bottom <= size[1],
        ),
      ).toBe(true);
      expect(overlaps(list)).toBe(false);
      await desktopShot(c.app, `blink-fan-200-${edge}`);
    } finally {
      await c.close();
    }
  });

test("dropping Blink with the fan open leaves no overlapping frame", async () => {
  const c = await launch(2);
  try {
    await background(c.app);
    await moveOn(c.page, 2);
    await c.page.waitForTimeout(500);
    expect(await rects(c.page)).toHaveLength(4);
    const viewport = await c.page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const sampling = c.page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = [];
          const start = performance.now();
          const frame = (now) => {
            frames.push(
              [...document.querySelectorAll("[data-action]")]
                .filter((b) => Number(getComputedStyle(b).opacity) > 0.8)
                .map((b) => {
                  const r = b.getBoundingClientRect();
                  return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
                }),
            );
            if (now - start < 1600) requestAnimationFrame(frame);
            else resolve(frames);
          };
          requestAnimationFrame(frame);
        }),
    );
    const p = await rigPoint(c.page);
    native(p.x * 2, p.y * 2, "down");
    native(p.x * 2 - 100, p.y * 2 - 40);
    native(40, 700);
    native(40, 700, "up");
    const frames = await sampling;
    expect(frames.some((f) => f.length > 0)).toBe(true);
    expect(frames.filter(overlaps)).toEqual([]);
    const outside = frames
      .flat()
      .filter(
        (r) =>
          r.x < 0 ||
          r.y < 0 ||
          r.right > viewport.width ||
          r.bottom > viewport.height,
      );
    expect(outside).toEqual([]);
  } finally {
    await c.close();
  }
});

test("the answer deck follows Blink after a drag and after a display change", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await emit(c, { type: "delta", id: "answer", text: "One. Two. Three." });
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.bubbles.isVisible()),
      )
      .toBe(true);
    const expected = () =>
      c.app.evaluate(() => {
        const t = globalThis.blinklingTest,
          s = t.snapshot();
        return { deck: t.bubbles.getBounds(), want: t.cardBounds(s) };
      });
    const same = async () => {
      const { deck, want } = await expected();
      expect(deck).toEqual(want);
    };
    await same();
    const p = await rigPoint(c.page);
    native(p.x, p.y, "down");
    native(p.x - 60, p.y - 20);
    native(30, 520);
    native(30, 520, "up");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
      )
      .toBe("left");
    await c.page.waitForTimeout(500);
    await same();
    await place(c, "right", 0.3);
    await c.page.waitForTimeout(400);
    await same();
  } finally {
    await c.close();
  }
});

test("every window is titled Blinkling", async () => {
  const c = await launch();
  try {
    await c.app.evaluate(() =>
      globalThis.blinklingTest.nBlinkMenuFaces.openCard(true),
    );
    await expect.poll(() => composerOpen(c)).toBe(true);
    const titles = await c.app.evaluate(() =>
      globalThis.blinklingTest.nBlinkMenuFaces.titles(),
    );
    expect(titles.length).toBeGreaterThan(1);
    expect([...new Set(titles)]).toEqual(["Blinkling"]);
  } finally {
    await c.close();
  }
});

test("Blink looks thinking within 100 ms of a send and only shows a dot when offline", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await emit(c, { type: "status", state: "connected" });
    await expect(c.page.locator('[data-connection="ok"]')).toBeHidden();
    await c.page.evaluate(() => {
      window.thinkingAt = null;
      new MutationObserver(() => {
        if (
          window.thinkingAt === null &&
          document.querySelector("#blink").dataset.expression === "thinking"
        )
          window.thinkingAt = Date.now();
      }).observe(document.querySelector("#blink"), { attributes: true });
    });
    const sent = await c.app.evaluate(() => {
      const at = Date.now();
      globalThis.blinklingTest.send({ type: "sending" });
      return at;
    });
    await expect
      .poll(() => c.page.evaluate(() => window.thinkingAt))
      .not.toBeNull();
    const at = await c.page.evaluate(() => window.thinkingAt);
    expect(at - sent).toBeLessThanOrEqual(100);
    await writeFile(
      join(report, "blink-thinking-latency.json"),
      JSON.stringify({ ms: at - sent }),
    );
    for (const state of ["retrying", "blocked"]) {
      await emit(c, { type: "status", state });
      await expect(
        c.page.locator(`[data-connection="${state}"]`),
      ).toBeVisible();
    }
    await emit(c, { type: "status", state: "connected" });
    await expect(c.page.locator('[data-connection="ok"]')).toBeHidden();
  } finally {
    await c.close();
  }
});

/** Pixels that differ between two shots, over one rectangle. */
const changed = (a, b, box) => {
  let count = 0;
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * a.width + x) * 4;
      if (
        Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]) >
        48
      )
        count++;
    }
  return count;
};
const faces = {
  thinking: { type: "activity", state: "thinking" },
  permission: { type: "activity", state: "permission" },
  error: { type: "status", state: "blocked" },
  watching: { type: "watching", on: true },
  lock: { type: "guard", lock: true },
  "usage-limit": { type: "usage-limit", resetAt: Date.now() + 3600_000 },
};
for (const scale of [1, 2])
  for (const theme of ["light", "dark"])
    test(`each face reads at peek, ${scale * 100}% ${theme}`, async () => {
      test.setTimeout(120000);
      const c = await launch(scale, theme);
      try {
        await background(c.app);
        native(20, 20);
        await c.page.waitForTimeout(800);
        const r = await c.page.evaluate(() => {
          const b = document
            .querySelector('rect[fill="#3ddc97"]')
            .getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        });
        const box = {
          x: Math.max(0, Math.round((r.x - 20) * scale)),
          y: Math.max(0, Math.round((r.y - 20) * scale)),
          width: Math.round((r.width + 40) * scale),
          height: Math.round((r.height + 40) * scale),
        };
        const idle = await desktopShot(c.app, `face-idle-${scale}-${theme}`);
        const seen = {};
        for (const [name, event] of Object.entries(faces)) {
          await emit(c, event);
          await c.page.waitForTimeout(450);
          const shot = await desktopShot(
            c.app,
            `face-${name}-${scale}-${theme}`,
          );
          seen[name] = changed(idle, shot, box);
          // The face is not the idle one, and not by a stray pixel or two.
          expect(seen[name], name).toBeGreaterThan(40 * scale);
          if (name === "lock") await emit(c, { type: "guard", lock: false });
          if (name === "watching")
            await emit(c, { type: "watching", on: false });
          if (name === "usage-limit")
            await emit(c, { type: "usage-limit", resetAt: null });
          if (name === "error")
            await emit(c, { type: "status", state: "connected" });
          await emit(c, { type: "activity", state: "idle" });
          await c.page.waitForTimeout(300);
        }
        await writeFile(
          join(report, `faces-${scale}-${theme}.json`),
          JSON.stringify(seen, null, 2),
        );
        expect(PNG).toBeTruthy();
      } finally {
        await c.close();
      }
    });

test("the fan logs its frames and they never skip a beat", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    await moveOn(c.page);
    await c.page.waitForTimeout(600);
    native(20, 20);
    await c.page.waitForTimeout(900);
    const log = await c.page.evaluate(() => globalThis.__blinklingFrames);
    const fan = log.filter((f) => f.surface === "fan" && f.box);
    expect(fan.length).toBeGreaterThan(10);
    const gaps = fan.slice(1).map((f, i) => f.t - fan[i].t);
    // Gaps inside one open or close are frames; the long one is the pause
    // between them.
    expect(gaps.filter((g) => g < 1000).every((g) => g <= 50)).toBe(true);
    await writeFile(
      join(report, "blink-fan-frames.json"),
      JSON.stringify(fan, null, 2),
    );
  } finally {
    await c.close();
  }
});
