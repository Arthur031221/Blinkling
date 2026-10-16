import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { launch, native, click, key, bodyPoint, wheel } from "./support.mjs";
import { background, onBlink } from "./helpers.mjs";
import { PNG } from "pngjs";
import { r3 } from "./record.mjs";

const BUDGET = { frameP95: 16.7, jitter: 0.8, frameMax: 50, response: 100 };

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
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

/** In a page: the gap between animation frames and every long task, by the name
 * of the interaction going on, and when the page first drew after a change. A
 * hidden window draws nothing, so its pause is not a gap. */
const install = (page) =>
  page.evaluate(() => {
    if (window.__perf) return;
    const perf = (window.__perf = {
      mark: "idle",
      marks: {},
      first: null,
      stamps: [],
    });
    const bucket = () =>
      (perf.marks[perf.mark] ??= { gaps: [], ends: [], long: [] });
    let previous = 0;
    const step = (now) => {
      if (previous) {
        bucket().gaps.push(now - previous);
        bucket().ends.push(Date.now());
      }
      previous = now;
      perf.stamps.push(Date.now());
      if (perf.stamps.length > 400) perf.stamps.shift();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) bucket().long.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
    // What counts as the figure having answered, by interaction: the first
    // frame in which the page shows it.
    const shown = {
      reveal: () => document.querySelector("#blink").dataset.mode !== "peek",
      carry: () => document.querySelector("#blink").dataset.mode === "drag",
      menu: () =>
        [...document.querySelectorAll("[data-action]")].some(
          (el) =>
            el.getBoundingClientRect().width > 0 &&
            Number(getComputedStyle(el).opacity) > 0.02,
        ),
    };
    window.__arm = (name) => {
      perf.first = null;
      const look = () => {
        if (perf.first !== null) return;
        if (shown[name]?.()) perf.first = Date.now();
        else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    };
  });

const marks = (pages, name) =>
  Promise.all(
    pages.map((p) =>
      p?.evaluate((name) => window.__perf && (window.__perf.mark = name), name),
    ),
  );

const percentile = (list, q) =>
  list.length
    ? [...list].sort((a, b) => a - b)[
        Math.min(list.length - 1, Math.floor(list.length * q))
      ]
    : 0;
const r2 = (n) => Math.round(n * 100) / 100;

/** Times the card window was not on screen, sampled in the main process. A
 * window that is not shown draws nothing (Chromium slows its frames to one a
 * second), so a gap that overlaps one of these is a pause, not a slow frame. */
const shownGaps = (m, hidden) =>
  m.gaps.filter(
    (gap, i) =>
      !hidden.some((t) => t >= m.ends[i] - gap - 40 && t <= m.ends[i]),
  );

async function collect(pages, name, hidden) {
  const gaps = [],
    long = [];
  for (const p of pages) {
    const m = await p?.evaluate((name) => window.__perf?.marks[name], name);
    if (!m) continue;
    gaps.push(...shownGaps(m, p.url().includes("surface=card") ? hidden : []));
    long.push(...m.long);
  }
  return {
    frames: gaps.length,
    frame_p95_ms: r2(percentile(gaps, 0.95)),
    frame_max_ms: r2(Math.max(0, ...gaps)),
    frames_over_50_ms: gaps.filter((g) => g > 50).length,
    long_tasks: long.length,
    long_task_max_ms: r2(Math.max(0, ...long)),
  };
}

const results = {};

/** The same run at 100% and 200%: each is its own row set in perf.json. */
for (const scale of [1, 2])
  test(`every interaction keeps to the frame budget and answers within 100 ms at ${scale * 100}%`, async () => {
    test.setTimeout(300000);
    const rows = (results[`${scale * 100}%`] = {});
    const at = (p) => p && { x: p.x * scale, y: p.y * scale };
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      await place(app, "right", 0.5);
      await page.waitForTimeout(600);
      const card = () => cardPage(app);
      await app.evaluate(() => {
        const { composer } = globalThis.blinklingTest;
        globalThis.__hidden = [];
        setInterval(() => {
          if (!composer.isVisible()) globalThis.__hidden.push(Date.now());
        }, 20);
      });
      const hidden = () => app.evaluate(() => globalThis.__hidden);
      await install(page);
      await install(card());
      const pages = () => [page, card()];
      await app.evaluate(() => {
        const c = globalThis.blinklingTest.composer;
        globalThis.__shownAt = null;
        c.on("show", () => (globalThis.__shownAt ??= Date.now()));
      });

      /** Marks the interaction, arms what counts as the figure's answer and plays
       * the input; `sent` is when the input reached the X server. */
      const start = async (name, answer) => {
        await marks(pages(), name);
        await page.evaluate((a) => a && window.__arm(a), answer ?? null);
      };
      const finish = async (name, sent, answer) => {
        const stat = await collect(pages(), name, await hidden());
        let at = null;
        if (answer === "card") {
          const shownAt = await app.evaluate(() => globalThis.__shownAt);
          const stamps = await card().evaluate(() => window.__perf.stamps);
          at = stamps.find((t) => t >= shownAt) ?? null;
        } else if (answer) at = await page.evaluate(() => window.__perf.first);
        rows[name] = {
          ...stat,
          ...(answer ? { response_ms: at && at - sent } : {}),
        };
      };

      // 0. Nothing is going on: Blink at rest at the edge.
      await expect.poll(async () => (await read(app)).state).toBe("peek");
      await start("idle");
      await page.waitForTimeout(2500);
      await finish("idle");

      // 1. The pointer arrives on Blink at the edge: it comes out.
      const spot = at(await bodyPoint(page));
      await start("reveal", "reveal");
      let stamps = native(
        [{ type: "move", x: spot.x, y: spot.y, wait: 0.05 }],
        {
          stamp: true,
        },
      );
      await page.waitForTimeout(1400);
      await finish("reveal", stamps[0], "reveal");

      // 1b. The pointer moves about on Blink while it is out.
      const around = at(await bodyPoint(page));
      await start("hover");
      native(
        Array.from({ length: 40 }, (_, i) => ({
          type: "move",
          x: around.x + Math.sin(i / 4) * 6 * scale,
          y: around.y + Math.cos(i / 4) * 4 * scale,
          wait: 0.03,
        })),
      );
      await finish("hover");

      // 2. A click on Blink opens the card.
      await onBlink(page);
      const here = at(await bodyPoint(page));
      await start("open_card");
      await app.evaluate(() => (globalThis.__shownAt = null));
      stamps = native(
        [
          { type: "move", x: here.x, y: here.y },
          { type: "down", wait: 0.01 },
          { type: "up", wait: 0.01 },
        ],
        { stamp: true },
      );
      await expect.poll(async () => (await read(app)).card).toBe(true);
      await page.waitForTimeout(1200);
      await finish("open_card", stamps[1], "card");

      // 3. An answer streams into the card.
      await start("stream");
      await app.evaluate(async () => {
        const { session } = globalThis.blinklingTest;
        for (let i = 0; i < 12; i++)
          session.emit({
            type: "message",
            id: `h-${i}`,
            role: i % 2 ? "assistant" : "user",
            content: [
              { type: "text", text: `Message number ${i} of the chat.` },
            ],
          });
        for (let i = 0; i < 60; i++) {
          session.emit({
            type: "delta",
            id: "latest",
            text: `Word number ${i} of a long streamed answer that wraps. `,
          });
          await new Promise((r) => setTimeout(r, 30));
        }
        session.emit({ type: "done", turnId: "latest" });
      });
      await page.waitForTimeout(600);
      await finish("stream");

      // 3b. The history is scrolled by the wheel with the pointer over the card.
      const cardBox = await card().evaluate(() => ({
        x: window.screenX + innerWidth / 2,
        y: window.screenY + innerHeight / 2,
      }));
      await start("chat_scroll");
      for (let i = 0; i < 6; i++) {
        wheel(cardBox.x * scale, cardBox.y * scale, i % 2 ? 3 : -3);
        await page.waitForTimeout(150);
      }
      await finish("chat_scroll");

      // 4. A second click turns the card into the menu.
      const again = at(await bodyPoint(page));
      await start("menu", "menu");
      stamps = native(
        [
          { type: "move", x: again.x, y: again.y },
          { type: "down", wait: 0.01 },
          { type: "up", wait: 0.01 },
        ],
        { stamp: true },
      );
      await expect.poll(async () => (await read(app)).menu).toBe(true);
      await page.waitForTimeout(1200);
      await finish("menu", stamps[1], "menu");

      // 5. Blink is picked up by a press and a first step, and carried across.
      await onBlink(page);
      const grab = at(await bodyPoint(page));
      await start("carry");
      native([
        { type: "move", x: grab.x, y: grab.y },
        { type: "down", wait: 0 },
      ]);
      await page.evaluate(() => window.__arm("carry"));
      stamps = native(
        [
          ...Array.from({ length: 60 }, (_, i) => ({
            type: "move",
            x: grab.x - (6 + i * 9) * scale,
            y: grab.y + Math.sin(i / 6) * 90 * scale,
            wait: 0.016,
          })),
          { type: "wait", seconds: 0.2 },
          { type: "up" },
        ],
        { stamp: true },
      );
      await finish("carry", stamps[0], "carry");

      // 6. A click elsewhere puts the menu away and Blink goes back to the edge.
      key(0xff1b);
      click(120 * scale, 720 * scale);
      await start("retreat");
      await expect
        .poll(async () => (await read(app)).state, { timeout: 12000 })
        .toBe("peek");
      await finish("retreat");

      // 7. A capture is sucked into Blink's mouth: the pick layer draws the flight.
      const layer = app.windows().find((p) => p.url().includes("layer.html"));
      await install(layer);
      const png = new PNG({ width: 360, height: 240 });
      for (let i = 0; i < png.data.length; i += 4)
        png.data.set([40 + ((i / 4) % 200), 160, 90, 255], i);
      await marks([layer], "eat");
      await app.evaluate(
        async ({ screen }, [data, region]) => {
          await globalThis.blinklingTest.attachCapture({
            image: { id: "perf-eat", mediaType: "image/png", data },
            display: screen.getPrimaryDisplay(),
            region,
          });
        },
        [
          PNG.sync.write(png).toString("base64"),
          { x: 300, y: 160, width: 360, height: 240 },
        ],
      );
      rows.eat = await collect([layer], "eat", []);
    } finally {
      await app.close();
    }

    const report = {
      budget: {
        frame_p95_ms: BUDGET.frameP95,
        frame_p95_tolerance_ms: BUDGET.jitter,
        frame_max_ms: BUDGET.frameMax,
        response_ms: BUDGET.response,
        note: "The virtual display refreshes at 60 Hz, so a frame is 16.7 ms plus the timer's jitter; the tolerance is that jitter and nothing more.",
      },
      scales: results,
      pick_frame: existsSync(`${r3}/perf-pick-frame.json`)
        ? JSON.parse(readFileSync(`${r3}/perf-pick-frame.json`, "utf8"))
        : null,
    };
    mkdirSync(r3, { recursive: true });
    writeFileSync(`${r3}/perf.json`, JSON.stringify(report, null, 2) + "\n");
    console.log("PERF " + JSON.stringify(results));
    for (const [name, r] of Object.entries(rows)) {
      expect.soft(r.frames, `${name}: frames seen`).toBeGreaterThan(10);
      expect
        .soft(r.frame_p95_ms, `${name}: p95 frame`)
        .toBeLessThanOrEqual(BUDGET.frameP95 + BUDGET.jitter);
      expect
        .soft(r.frame_max_ms, `${name}: slowest frame`)
        .toBeLessThanOrEqual(BUDGET.frameMax);
      if ("response_ms" in r)
        expect
          .soft(r.response_ms, `${name}: input to first response`)
          .toBeLessThanOrEqual(BUDGET.response);
    }
  });
