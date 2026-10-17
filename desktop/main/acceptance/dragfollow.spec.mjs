import { test, expect } from "@playwright/test";
import { launch, native, bodyBox } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";
import { CHARACTER, MOUTH, TAIL_REACH } from "../placement.mjs";

/** `inspect().anchor` is the renderer's point 62 above Blink's feet. */
const FEET_ABOVE = 62;
const SLACK = 10;

const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );

const stats = (list) => {
  const a = list.slice().sort((p, q) => p - q);
  return {
    n: a.length,
    median: a[a.length >> 1],
    p90: a[Math.floor(a.length * 0.9)],
  };
};

async function openCard(app, page) {
  await page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
  await expect
    .poll(
      () =>
        app.evaluate(() => globalThis.blinklingTest.composer.getBounds().width),
      { timeout: 8000 },
    )
    .toBeGreaterThan(200);
  await page.waitForTimeout(900);
}

/** The pointer goes left in steps of 5 px every ~16 ms. */
const STEP = 5;
const grabbed = async (b, page) => {
  const body = await bodyBox(page);
  return {
    x: b.x + body.x + body.width * 0.35,
    y: b.y + body.y + body.height * 0.72,
  };
};

test("while Blink is dragged the card is placed from the same pointer events, within a frame of Blink", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(app, page);
    // Log when the card window is moved and when Blink is drawn somewhere new.
    await app.evaluate(() => {
      const c = globalThis.blinklingTest.composer,
        log = (globalThis.cardLog = []),
        set = c.setBounds.bind(c);
      c.setBounds = (r) => {
        log.push([Date.now(), r.x]);
        return set(r);
      };
    });
    await page.evaluate(() => {
      window.blinkLog = [];
      const f = () => {
        const a = window.desktop.inspect().anchor;
        if (a) window.blinkLog.push([Date.now(), a.x]);
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const grab = await grabbed(b, page);
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 8, y: grab.y, wait: 0.3 },
    ]);
    const events = [];
    for (let i = 1; i <= 120; i++)
      events.push({
        type: "move",
        x: grab.x - 8 - i * STEP,
        y: grab.y,
        wait: 0.016,
      });
    const stamps = native(events, { stamp: true });
    native([{ type: "up" }]);
    const card = await app.evaluate(() => globalThis.cardLog);
    const blink = await page.evaluate(() => window.blinkLog);
    const pointerAt = (i) => grab.x - 8 - (i + 1) * STEP;
    const within = (log) =>
      log.filter(([t]) => t >= stamps[0] && t <= stamps.at(-1) + 100);
    // How long after the pointer reached a place a surface was shown there.
    // The constant offset between the pointer and the surface is taken from
    // where the drag ended.
    const lags = (log) => {
      const offset = log.at(-1)[1] - pointerAt(119);
      const out = [];
      for (const [t, x] of log) {
        const k = stamps.findIndex(
          (_, i) => pointerAt(i) <= x - offset + STEP / 2,
        );
        if (k >= 0) out.push(t - stamps[k]);
      }
      return out;
    };
    const blinkLag = stats(lags(within(blink))),
      cardLag = stats(lags(within(card)));
    console.log("lag ms", JSON.stringify({ blinkLag, cardLag }));
    expect(
      card.length,
      "the card is moved on the drag's own events",
    ).toBeGreaterThan(90);
    expect(blinkLag.median, "Blink follows the pointer").toBeLessThanOrEqual(
      24,
    );
    expect(blinkLag.p90).toBeLessThanOrEqual(33);
    expect(
      blinkLag.median - cardLag.median,
      "Blink never trails the card",
    ).toBeLessThanOrEqual(8);
  } finally {
    await app.close();
  }
});

test("a continuous drag across the screen, recorded, never leaves the card behind", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("card_follow_drag", { fps: 30, suffix: "-322" });
  try {
    const b = await background(app);
    await place(app, "right", 0.6);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(app, page);
    const grab = await grabbed(b, page);
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 8, y: grab.y - 2, wait: 0.3 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    const route = [
      [-300, 40],
      [-520, -60],
      [-340, 180],
      [-420, 300],
      [-200, 120],
    ];
    const events = [];
    let from = { x: grab.x - 8, y: grab.y - 2 };
    for (const [dx, dy] of route) {
      const to = { x: grab.x + dx, y: grab.y + dy };
      for (let s = 1; s <= 28; s++) {
        const t = s / 28,
          e = t * t * (3 - 2 * t);
        events.push({
          type: "move",
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          wait: 0.016,
        });
      }
      from = to;
    }
    native(events);
    native([{ type: "up" }]);
    await page.waitForTimeout(600);
    await rec.stop();
    expect(rec.sequence().length).toBeGreaterThan(40);
  } finally {
    await app.close();
  }
});

test("in every frame of a drag, also down to the bottom edge, the card keeps its place at Blink's mouth and never covers Blink", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await place(app, "right", 0.35);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(app, page);
    // The card window as it really is, sampled every few milliseconds, and
    // where Blink is drawn in every frame.
    await app.evaluate(() => {
      const c = globalThis.blinklingTest.composer,
        log = (globalThis.cardSamples = []);
      globalThis.cardSampler = setInterval(
        () => log.push([Date.now(), c.getBounds()]),
        4,
      );
    });
    await page.evaluate(() => {
      window.blinkFrames = [];
      const f = () => {
        const a = window.desktop.inspect().anchor;
        if (a) window.blinkFrames.push([Date.now(), a.x, a.y]);
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const grab = await grabbed(b, page);
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 8, y: grab.y, wait: 0.3 },
    ]);
    const legs = [
      [-200, 90],
      [-120, 150],
      [90, 260],
    ];
    const events = [];
    let from = { x: grab.x - 8, y: grab.y };
    for (const [dx, dy] of legs) {
      const to = { x: from.x + dx, y: from.y + dy };
      const steps = Math.ceil(Math.hypot(dx, dy) / 8);
      for (let s = 1; s <= steps; s++)
        events.push({
          type: "move",
          x: from.x + (dx * s) / steps,
          y: from.y + (dy * s) / steps,
          wait: 0.016,
        });
      from = to;
    }
    const stamps = native(events, { stamp: true });
    native([{ type: "up" }]);
    const samples = await app.evaluate(() => {
      clearInterval(globalThis.cardSampler);
      return globalThis.cardSamples;
    });
    const frames = (await page.evaluate(() => window.blinkFrames)).filter(
      ([t]) => t >= stamps[0] && t <= stamps.at(-1) + 60,
    );
    const cardAt = (t) => {
      let found = null;
      for (const [s, r] of samples) if (s <= t) found = r;
      return found;
    };
    // The card's near edge and its bottom, against Blink, in every frame.
    const rows = frames
      .map(([t, x, y]) => ({ x, y, card: cardAt(t) }))
      .filter((r) => r.card);
    const paper = (r) => ({
      left: r.card.x + 12,
      right: r.card.x + r.card.width - 12,
      top: r.card.y + 12,
      bottom: r.card.y + r.card.height - 12,
    });
    const body = (r) => ({
      left: r.x - 34,
      right: r.x + 34,
      top: r.y - 20,
      bottom: r.y + 50,
    });
    const covered = rows.filter((r) => {
      const p = paper(r),
        k = body(r);
      return (
        p.left < k.right &&
        k.left < p.right &&
        p.top < k.bottom &&
        k.top < p.bottom
      );
    });
    console.log(
      "frames",
      rows.length,
      "covering",
      covered.length,
      "lowest",
      Math.max(...rows.map((r) => r.y)),
    );
    expect(rows.length, "a frame for the whole drag").toBeGreaterThan(60);
    expect(covered, "the card never covers Blink in a frame").toEqual([]);
    // Beside Blink: how far the paper's near edge sits from the mouth.
    const beside = rows.filter((r) => {
      const p = paper(r);
      return p.top < r.y && r.y < p.bottom;
    });
    const gaps = beside.map((r) => {
      const p = paper(r);
      return p.left >= r.x ? p.left - r.x : r.x - p.right;
    });
    const median = stats(gaps).median;
    const worst = Math.max(...gaps.map((g) => Math.abs(g - median)));
    console.log(
      "tail gap",
      median,
      "worst deviation",
      worst,
      "of",
      gaps.length,
    );
    expect(beside.length).toBeGreaterThan(rows.length * 0.6);
    expect(
      worst,
      "the tail stays on the mouth in every frame",
    ).toBeLessThanOrEqual(14);
  } finally {
    await app.close();
  }
});

/** The card window as it really is, sampled every few milliseconds, and where
 * Blink is drawn in every frame, from now on. */
async function watch(app, page) {
  await app.evaluate(() => {
    const c = globalThis.blinklingTest.composer,
      log = (globalThis.cardSamples = []);
    globalThis.cardSampler = setInterval(
      () => log.push([Date.now(), c.getBounds()]),
      4,
    );
  });
  await page.evaluate(() => {
    window.blinkFrames = [];
    const f = () => {
      const a = window.desktop.inspect().anchor;
      if (a) window.blinkFrames.push([Date.now(), a.x, a.y]);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}
async function readWatch(app, page, from, to) {
  const samples = await app.evaluate(() => {
    clearInterval(globalThis.cardSampler);
    return globalThis.cardSamples;
  });
  const frames = (await page.evaluate(() => window.blinkFrames)).filter(
    ([t]) => t >= from && t <= to,
  );
  const cardAt = (t) => {
    let found = null;
    for (const [s, r] of samples) if (s <= t) found = r;
    return found;
  };
  return {
    samples,
    rows: frames
      .map(([t, x, y]) => ({ t, x, y, card: cardAt(t) }))
      .filter((r) => r.card),
  };
}

test("after a drop the card glides with Blink to its place, and is never ahead of it", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("card_follow_drop", { fps: 30, suffix: "-323" });
  try {
    const b = await background(app);
    await place(app, "right", 0.4);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(app, page);
    await watch(app, page);
    const grab = await grabbed(b, page);
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 8, y: grab.y, wait: 0.3 },
    ]);
    const events = [];
    for (let i = 1; i <= 40; i++)
      events.push({
        type: "move",
        x: grab.x - 8 - i * 9,
        y: grab.y + i * 3,
        wait: 0.016,
      });
    native(events);
    // Hold still a moment so the card has settled at the drop.
    native([{ type: "move", x: grab.x - 8 - 360, y: grab.y + 120, wait: 0.4 }]);
    const dropped = Date.now();
    native([{ type: "up" }]);
    await page.waitForTimeout(900);
    const { rows } = await readWatch(app, page, dropped - 50, dropped + 900);
    await rec.stop();
    // Everything from the drop on, Blink falls to its edge: the tail has to end
    // on its mouth in every frame, and the card moves with it, not ahead of it.
    const after = rows.filter((r) => r.t >= dropped);
    const mouthDrop = MOUTH.y - CHARACTER.foot;
    const off = after.filter((r) => {
      const mouth = r.y + FEET_ABOVE + mouthDrop;
      return (
        mouth < r.card.y + TAIL_REACH - SLACK ||
        mouth > r.card.y + r.card.height - TAIL_REACH + SLACK
      );
    });
    const ys = new Set(after.map((r) => r.card.y));
    if (process.env.DEBUG_ROWS)
      console.log(
        after
          .map((r) => `${r.t - dropped} y${Math.round(r.y)} card${r.card.y}`)
          .join("\n"),
      );
    console.log(
      "frames",
      after.length,
      "tail off",
      off.length,
      "card places",
      ys.size,
    );
    expect(after.length, "frames of the glide").toBeGreaterThan(5);
    expect(
      off,
      "the tail reaches the mouth in every frame of the glide",
    ).toEqual([]);
    expect(
      ys.size,
      "the card moves through the glide, not at once",
    ).toBeGreaterThan(5);
  } finally {
    await app.close();
  }
});

test("at the top of the screen the tail stays on the mouth in every frame", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("card_follow_top", { fps: 30, suffix: "-323" });
  try {
    const b = await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(500);
    await reveal(page);
    await openCard(app, page);
    await watch(app, page);
    const grab = await grabbed(b, page);
    native([
      { type: "move", ...grab, wait: 0.05 },
      { type: "down" },
      { type: "move", x: grab.x - 8, y: grab.y, wait: 0.3 },
    ]);
    const events = [];
    const steps = Math.ceil(grab.y / 8);
    for (let i = 1; i <= steps; i++)
      events.push({
        type: "move",
        x: grab.x - 8 - i * 2,
        y: Math.max(1, grab.y - i * 8),
        wait: 0.016,
      });
    const stamps = native(events, { stamp: true });
    native([{ type: "move", x: grab.x - 8 - steps * 2, y: 1, wait: 0.4 }]);
    native([{ type: "up" }]);
    await page.waitForTimeout(700);
    const { rows } = await readWatch(app, page, stamps[0], stamps.at(-1) + 400);
    await rec.stop();
    // The mouth is where the tail has to end: inside the card's side, clear of
    // its corners, in every frame (a frame of this drag is 8 px, which the card window may trail by).
    const mouthDrop = MOUTH.y - CHARACTER.foot;
    const off = rows.filter((r) => {
      const mouth = r.y + FEET_ABOVE + mouthDrop;
      return (
        mouth < r.card.y + TAIL_REACH - SLACK ||
        mouth > r.card.y + r.card.height - TAIL_REACH + SLACK
      );
    });
    if (process.env.DEBUG_ROWS)
      console.log(
        rows
          .map(
            (r) =>
              `${r.t % 100000} y${Math.round(r.y)} card${r.card.y}/${r.card.height}`,
          )
          .join("\n"),
      );
    if (process.env.DEBUG_ROWS)
      console.log(
        "OFF",
        off
          .map(
            (r) =>
              `${Math.round(r.y + FEET_ABOVE + mouthDrop)} card${r.card.y}`,
          )
          .join(" | "),
      );
    console.log(
      "frames",
      rows.length,
      "tail off the mouth",
      off.length,
      "highest mouth",
      Math.min(...rows.map((r) => r.y + FEET_ABOVE + mouthDrop)),
    );
    expect(rows.length).toBeGreaterThan(30);
    expect(off, "the tail reaches the mouth in every frame").toEqual([]);
  } finally {
    await app.close();
  }
});
