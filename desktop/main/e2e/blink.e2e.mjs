import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
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
  miniBounds,
  miniFocused,
  miniPage,
} from "./support.mjs";
import { recordFrames, verdict } from "../../e2e/frames.mjs";
import { input, poll } from "../../pick/e2e/support.mjs";
import {
  openFixture,
  record,
  domRect,
  log as pickLog,
} from "../../pick/e2e/harness.mjs";

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
      .filter((b) => !b.hidden && Number(getComputedStyle(b).opacity) > 0.1)
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

test("the fan has five bubbles and nothing beside Blink to pin", async () => {
  const c = await launch();
  try {
    expect(await hooks(c.app)).toContain("escapeKeys");
    await background(c.app);
    native(20, 20);
    await moveOn(c.page);
    await expect(c.page.locator("[data-action]")).toHaveCount(5);
    expect(
      await c.page.evaluate(() =>
        [...document.querySelectorAll("[data-action]")].map(
          (b) => b.dataset.action,
        ),
      ),
    ).toEqual(["capture", "guide", "auto-explain", "settings", "quit"]);
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
    expect(await resting).toBe(5);
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

test("touching Blink's head or belly gets its own reaction, and leaving ends it", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    // Reveal Blink first: a peeking Blink is mostly off screen.
    await moveOn(c.page);
    const spot = (fx, fy) =>
      c.page.evaluate(
        ([fx, fy]) => {
          const r = document
            .querySelector(".blink-body")
            .getBoundingClientRect();
          return { x: r.x + r.width * fx, y: r.y + r.height * fy };
        },
        [fx, fy],
      );
    const rig = (read) =>
      c.page.evaluate(
        (read) =>
          new Function("p", "svg", `return ${read}`)(
            window.desktop.character.last,
            window.desktop.character.svg,
          ),
        read,
      );
    const head = await spot(0.5, 0.3);
    native(head.x, head.y);
    // A pat on the head raises both hands; a poke in the belly rocks Blink and
    // pulls them in; leaving restores the plain face.
    await expect.poll(() => rig("Math.round(p.L[0])")).toBe(70);
    await expect.poll(() => rig("p.eyes")).toBe("happy");
    const belly = await spot(0.5, 0.92);
    native(belly.x, belly.y);
    await expect.poll(() => rig("Math.round(p.L[0])")).toBe(40);
    await expect.poll(() => rig("p.mouth")).toBe("open");
    native(20, 20);
    await expect.poll(() => rig("p.eyes")).not.toBe("happy");
    await expect.poll(() => rig("p.mouth")).not.toBe("open");
  } finally {
    await c.close();
  }
});

test("while picking, Blink's eyes follow the cursor, and they let go when picking ends", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    await moveOn(c.page);
    const look = (axis) => () =>
      c.page.evaluate(
        (axis) => (window.desktop.character.last.look ?? [0, 0])[axis],
        axis,
      );
    await c.app.evaluate(() => globalThis.blinklingTest.picking(true));
    // Blink grips the right edge with its head turned a quarter turn, so a
    // pointer far to its left is "up" for its eyes, and one far above is "forward".
    native(20, 400);
    await expect.poll(look(1)).toBeLessThan(-0.4);
    native(1100, 10);
    await expect.poll(look(0)).toBeGreaterThan(0.4);
    await c.app.evaluate(() => globalThis.blinklingTest.picking(false));
    await expect.poll(look(0)).toBeLessThan(0.4);
  } finally {
    await c.close();
  }
});

test("a held Blink is nervous, and two circles in the air leave it dizzy", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    const rig = (read) =>
      c.page.evaluate(
        (read) =>
          new Function("p", "svg", `return ${read}`)(
            window.desktop.character.last,
            window.desktop.character.svg,
          ),
        read,
      );
    native(p.x, p.y, "down");
    native(p.x + 40, p.y + 10);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    expect(await rig('svg.innerHTML.includes("#9fd8ff")')).toBe(true);
    // Each native move takes longer than a real hand, so the three circles are
    // fed to the detector in one go instead of being drawn with the mouse.
    await c.page.evaluate(() => {
      const spin = window.desktop.spin;
      const now = performance.now();
      spin.reset();
      for (let i = 0; i <= 90; i++) {
        const a = (i / 30) * Math.PI * 2;
        spin.add(
          { x: 400 + Math.cos(a) * 90, y: 400 + Math.sin(a) * 90 },
          now + i * 20,
        );
      }
    });
    native(p.x + 40, p.y + 10, "up");
    await expect.poll(() => rig("p.eyes")).toBe("dizzy");
    // Then it recovers.
    await expect.poll(() => rig("p.eyes"), { timeout: 6000 }).not.toBe("dizzy");
  } finally {
    await c.close();
  }
});

test("after a quiet minute Blink thinks out loud in a bubble that never takes a click", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    const bubble = c.page.locator("#grumble");
    await expect(bubble).toHaveAttribute("data-shown", "false");
    // Jump the grumbler's clock past the quiet minute instead of waiting it out.
    await c.page.evaluate(() =>
      window.desktop.grumbler.tick(performance.now() + 120_000, false),
    );
    await expect(bubble).toHaveAttribute("data-shown", "true");
    await expect(bubble).not.toHaveText("");
    await expect(bubble).toHaveCSS("pointer-events", "none");
    await expect(bubble).toHaveAttribute("aria-hidden", "true");
    const box = await bubble.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    // Work in the session sends the thought away.
    await emit(c, { type: "activity", state: "thinking" });
    await expect(bubble).toHaveAttribute("data-shown", "false");
  } finally {
    await c.close();
  }
});

test("a click on Blink opens the focused mini composer; a drag past 4 px does not", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    // A press that travels 3 px is still a click.
    native(p.x, p.y, "down");
    native(p.x + 3, p.y);
    native(p.x + 3, p.y, "up");
    await expect.poll(() => miniFocused(c.app)).toBe(true);
    await expect(miniPage(c.app).locator(".mini-input")).toBeFocused();
    expect(await composerOpen(c)).toBe(false);
    await miniPage(c.app).keyboard.press("Escape");
    await expect.poll(() => miniFocused(c.app)).toBe(false);
    await moveOn(c.page);
    const q = await rigPoint(c.page);
    native(q.x, q.y, "down");
    native(q.x + 30, q.y - 10);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native(q.x + 30, q.y - 10, "up");
    await c.page.waitForTimeout(400);
    expect(await miniFocused(c.app)).toBe(false);
    expect(await composerOpen(c)).toBe(false);
  } finally {
    await c.close();
  }
});

test("the mini composer has the add button, model, effort and permission lists, and a pick reaches the session", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    native(p.x, p.y, "down");
    native(p.x, p.y, "up");
    await expect.poll(() => miniFocused(c.app)).toBe(true);
    const mini = miniPage(c.app);
    await expect(mini.locator(".mini-add")).toBeVisible();
    const triggers = mini.locator(".mini-toolbar .gl-picker-trigger");
    await expect(triggers).toHaveCount(3);
    // The session answers once connected; until then the lists are shut.
    await expect(triggers.nth(2)).toBeEnabled({ timeout: 20000 });
    await expect(triggers.nth(2)).toContainText(/Ask first|先詢問/);
    const before = await mini.locator(".mini-card").boundingBox();
    await triggers.nth(2).click();
    const menu = mini.locator(".mini-toolbar .gl-picker-menu:visible");
    await expect(menu).toBeVisible();
    // The window grew to hold the list instead of clipping it.
    const box = await menu.boundingBox();
    const viewport = await mini.evaluate(() => window.innerHeight);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport);
    expect(
      (await mini.locator(".mini-card").boundingBox()).height,
    ).toBeGreaterThan(before.height);
    await mini.screenshot({ path: "test-results/mini-toolbar.png" });
    await menu.locator('[data-value="plan"]').click();
    await expect(triggers.nth(2)).toContainText(/Plan only|只做規劃/);
    await expect(mini.locator(".mini-notice")).toBeHidden();
    // A list is closed by Escape before the box is.
    await triggers.nth(0).click();
    await mini.keyboard.press("Escape");
    expect(await miniFocused(c.app)).toBe(true);
    await mini.locator(".mini-input").focus();
    await mini.keyboard.press("Escape");
    await expect.poll(() => miniFocused(c.app)).toBe(false);
  } finally {
    await c.close();
  }
});

test("the mini composer stays at Blink's mouth when Blink moves", async () => {
  const c = await launch();
  try {
    await background(c.app);
    await place(c, "right", 0.8);
    await c.page.waitForTimeout(400);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    native(p.x, p.y, "down");
    native(p.x, p.y, "up");
    await expect.poll(() => miniFocused(c.app)).toBe(true);
    // The mouth sits 108 px below the top of Blink's box; the box rises from 40 px under it.
    const bottomWanted = () =>
      c.app.evaluate(() => {
        const s = globalThis.blinklingTest.snapshot();
        return Math.round(
          s.position.reveal.y + s.display.bounds.y - 142 + 108 + 40,
        );
      });
    const bottom = async () => {
      const b = await miniBounds(c.app);
      return b.y + b.height;
    };
    await expect.poll(bottom).toBe(await bottomWanted());
    const low = await bottom();
    await place(c, "right", 0.5);
    await expect.poll(bottom).not.toBe(low);
    await expect.poll(bottom).toBe(await bottomWanted());
    const b = await miniBounds(c.app);
    const rig = await rigPoint(c.page);
    expect(b.x + b.width).toBeLessThanOrEqual(rig.x);
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
          const body = document.querySelector(".blink-body");
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
            .querySelector(".blink-body")
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

// N6.8: the frames of every moving surface, at 100 and 200 percent. The surface
// logs its own box on each frame it draws (shared/motion.mjs frameLog); the gate
// fails on a slow 95th percentile, any long frame, or a box that jumps.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const scale of [1, 2]) {
  test(`the motion gate at ${scale * 100}%: peek, fan, pick effects, flight, mini composer and pointing keep their frames`, async () => {
    const c = await launch(scale);
    const seen = {};
    const gate = async (name, surfaces, action) => {
      const result = await recordFrames(c.app, action);
      seen[name] = result.surfaces;
      for (const surface of surfaces)
        expect(
          result.surfaces[surface]?.frames ?? 0,
          `${name}: frames of ${surface}`,
        ).toBeGreaterThan(5);
      expect(verdict(result), name).toEqual([]);
    };
    try {
      await background(c.app);
      native(20, 20);
      await c.page.waitForTimeout(600);
      await gate("peek", ["peek"], async () => {
        await moveOn(c.page, scale);
        native(20, 20);
        await c.page.waitForTimeout(900);
      });
      await gate("fan", ["fan"], async () => {
        const p = await rigPoint(c.page);
        native(p.x * scale, p.y * scale);
        await c.page.waitForTimeout(1500);
        native(20, 20);
        await c.page.waitForTimeout(900);
      });
      await gate("mini composer", ["mini-composer"], async () => {
        const p = await rigPoint(c.page);
        native(p.x * scale, p.y * scale);
        await c.page.waitForTimeout(550);
        // Blink has come out of the edge: the click goes where it stands now.
        const q = await rigPoint(c.page);
        native(q.x * scale, q.y * scale, "down");
        native(q.x * scale, q.y * scale, "up");
        await expect.poll(() => miniFocused(c.app)).toBe(true);
        await c.page.waitForTimeout(600);
        await miniPage(c.app).keyboard.press("Escape");
        await expect.poll(() => miniFocused(c.app)).toBe(false);
        await c.page.waitForTimeout(400);
        native(20, 20);
      });
      // One arrival is only about fifteen frames, and a 95th percentile of that
      // few is just its slowest frame: step through three marks in one overlay.
      await gate("pointing", ["pointing"], async () => {
        const id = await c.app.evaluate(
          (_electron, rects) => {
            return globalThis.blinklingTest.overlay(
              rects.map((rect, i) => ({ rect, steps: [i] })),
            );
          },
          [
            { x: 400, y: 200, width: 100, height: 80 },
            { x: 250, y: 120, width: 100, height: 80 },
            { x: 100, y: 220, width: 100, height: 80 },
          ],
        );
        for (const index of [0, 1, 2]) {
          await c.app.evaluate(
            ({ BrowserWindow }, [windowId, step]) =>
              BrowserWindow.fromId(windowId).webContents.send(
                "blinkling:overlay:step",
                step,
              ),
            [id, index],
          );
          await c.page.waitForTimeout(1000);
        }
      });
      // The pick: a Ctrl+click on an image loops the outline, flies it into
      // Blink, and opens the mini composer with it.
      const display = await c.app.evaluate(
        () => globalThis.blinklingTest.snapshot().display.bounds,
      );
      // Both test hooks share one property; neither may displace the other.
      expect(
        await c.app.evaluate(() =>
          ["pick", "privacy"].filter((k) => globalThis.blinklingTest[k]),
        ),
      ).toEqual(["pick", "privacy"]);
      await openFixture(c.app, {
        x: 20,
        y: 20,
        width: Math.min(640, display.width - 140),
        height: Math.min(620, display.height - 40),
      });
      await record(c.app);
      const photo = await domRect(c.app, "#photo");
      await gate(
        "pick effects and flight",
        ["pick-effect", "flight", "mini-composer"],
        async () => {
          input([
            [
              "move",
              Math.round((photo.x + 30) * scale),
              Math.round((photo.y + 30) * scale),
            ],
            ["down", "ctrl"],
          ]);
          await poll(
            async () =>
              (await pickLog(c.app)).layer.some((m) => m.channel === "outline"),
            4000,
            "the first outline",
          );
          await pause(150);
          input([["press"], ["release"]]);
          await pause(600);
          input([["up", "ctrl"]]);
          await poll(
            async () => (await pickLog(c.app)).flights.length > 0,
            4000,
            "the flight",
          );
          await expect
            .poll(() => miniFocused(c.app), { timeout: 5000 })
            .toBe(true);
          await pause(600);
        },
      );
      await writeFile(
        join(report, `blink-frames-${scale * 100}.json`),
        JSON.stringify(seen, null, 2),
      );
    } finally {
      input([["release"], ["up", "ctrl"]]);
      await c.close();
    }
  });
}

// N6.2 / NM-3: the pointer jumps onto Blink and away again (or clicks) while the
// fan is still opening. Every bubble in flight turns around from where it is:
// its opacity rises, peaks short of fully open, and only falls afterwards.
// A process that already holds the X connection and fires its pointer events
// the moment it is told to, so the interrupt lands within a few milliseconds
// instead of after a Python start-up (the fan opens in about 300 ms).
function armPointer(events) {
  const lines = events.map(([op, a = 0, b = 0]) =>
    op === "move"
      ? `t.XTestFakeMotionEvent(d,-1,X+${a},Y+${b},0)`
      : `t.XTestFakeButtonEvent(d,1,${op === "down" ? 1 : 0},0)`,
  );
  const child = spawn(
    "python3",
    [
      "-I",
      "-c",
      `import ctypes,sys,time
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
x.XFlush.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
print('ready',flush=True)
X,Y=map(round,map(float,sys.stdin.readline().split()))
${lines.map((l) => `${l};x.XFlush(d);time.sleep(.04)`).join("\n")}
x.XFlush(d);time.sleep(.1)`,
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const done = new Promise((resolve) => child.on("close", resolve));
  const ready = new Promise((resolve) => child.stdout.once("data", resolve));
  return {
    ready,
    fire: async (x, y) => {
      child.stdin.write(`${x} ${y}\n`);
      await done;
    },
  };
}

async function traceFan(page) {
  await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll("[data-action]")];
    const trace = (window.__fanTrace = {
      samples: [],
      seen: false,
      stop: false,
    });
    const frame = () => {
      const opacities = bubbles.map((b) => Number(getComputedStyle(b).opacity));
      trace.samples.push(opacities);
      if (!trace.seen && Math.max(...opacities) > 0.05) {
        trace.seen = true;
        // Where Blink stands now that it is revealed.
        const r = document.querySelector(".blink-body").getBoundingClientRect();
        trace.stand = {
          x: r.x + r.width * (r.x < 0 ? 0.8 : 0.2),
          y: r.y + r.height * 0.72,
        };
      }
      if (!trace.stop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
const finishTrace = (page) =>
  page.evaluate(() => {
    window.__fanTrace.stop = true;
    return window.__fanTrace.samples;
  });

// A click closes the fan only after its IPC round trip (release, drag end,
// click, mini window), by when the fan has finished opening; the grab starts
// closing it inside the renderer, so it is the interrupt that lands mid-open.
test("the fan reverses from where it is when the pointer grabs Blink mid-open", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.waitForTimeout(600);
    let peaks = [];
    // The pointer is native input, so the moment it lands is only known to
    // within a frame or two; try again if the fan had already finished.
    for (let attempt = 0; attempt < 4 && !peaks.length; attempt++) {
      await expect
        .poll(() =>
          c.page.evaluate(() =>
            [...document.querySelectorAll("[data-action]")].every(
              (b) => Number(getComputedStyle(b).opacity) < 0.02,
            ),
          ),
        )
        .toBe(true);
      const interrupter = armPointer([
        ["move"],
        ["down"],
        ["move", 30, -10],
        ["up", 30, -10],
      ]);
      await interrupter.ready;
      const p = await rigPoint(c.page);
      await traceFan(c.page);
      native(p.x, p.y);
      await c.page.waitForFunction(() => window.__fanTrace.seen, null, {
        polling: "raf",
      });
      const stand = await c.page.evaluate(() => window.__fanTrace.stand);
      await interrupter.fire(stand.x, stand.y);
      await c.page.waitForTimeout(900);
      const samples = await finishTrace(c.page);
      const bubbles = samples[0].map((_, i) => samples.map((s) => s[i]));
      // The first wave of each bubble: from when it appears until it is gone
      // again. What happens after that (Blink dropped, the pointer resting
      // on it) is a new opening and not part of this one.
      const waves = bubbles.map((v) => {
        const start = v.findIndex((x) => x > 0.05);
        const end = v.findIndex((x, i) => i > start && x < 0.02);
        return {
          wave: start < 0 ? [] : v.slice(start, end < 0 ? v.length : end + 1),
          start,
          end,
        };
      });
      // A bubble still waiting out its stagger when the grab closed the fan
      // never appeared; one that rises after the first bubble is gone again
      // belongs to the opening that follows the drop.
      const closedAt = Math.min(
        ...waves.filter((w) => w.end > 0).map((w) => w.end),
        Infinity,
      );
      // A bubble that never reached open was turned around in flight.
      peaks = waves.filter(
        ({ wave, start }) =>
          wave.length && start < closedAt && Math.max(...wave) < 0.95,
      );
      for (const { wave, end } of peaks) {
        const after = wave.slice(wave.indexOf(Math.max(...wave)));
        expect(
          after.every((x, i) => i === 0 || x <= after[i - 1] + 0.02),
          "falls once it has turned, with no second wave",
        ).toBe(true);
        expect(end, "and is closed again").toBeGreaterThan(0);
      }
      native(20, 20);
      await c.page.waitForTimeout(700);
    }
    expect(peaks.length, "a bubble was caught in flight").toBeGreaterThan(0);
  } finally {
    await c.close();
  }
});
