import { r3 } from "./record.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const BUDGET = {
  frameP95: 16.7,
  jitter: 0.8,
  frameMax: 50,
  response: 100,
};

export const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
export const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
export const place = (app, edge, ratio) =>
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
export const install = (page) =>
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

export const marks = (pages, name) =>
  Promise.all(
    pages.map((p) =>
      p?.evaluate((name) => window.__perf && (window.__perf.mark = name), name),
    ),
  );

export const percentile = (list, q) =>
  list.length
    ? [...list].sort((a, b) => a - b)[
        Math.min(list.length - 1, Math.floor(list.length * q))
      ]
    : 0;
export const r2 = (n) => Math.round(n * 100) / 100;

/** Times the card window was not on screen, sampled in the main process. A
 * window that is not shown draws nothing (Chromium slows its frames to one a
 * second), so a gap that overlaps one of these is a pause, not a slow frame. */
export const shownGaps = (m, hidden) =>
  m.gaps.filter(
    (gap, i) =>
      !hidden.some((t) => t >= m.ends[i] - gap - 40 && t <= m.ends[i]),
  );

export async function collect(pages, name, hidden) {
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

/** Writes this run's rows into perf.json beside the rows other runs left: each
 * scale keeps the rows it already has. */
export function writeRows(results, extra = {}) {
  const file = `${r3}/perf.json`;
  const before = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const scales = { ...(before.scales ?? {}) };
  for (const [scale, rows] of Object.entries(results))
    scales[scale] = { ...(scales[scale] ?? {}), ...rows };
  const report = {
    ...before,
    budget: {
      frame_p95_ms: BUDGET.frameP95,
      frame_p95_tolerance_ms: BUDGET.jitter,
      frame_max_ms: BUDGET.frameMax,
      response_ms: BUDGET.response,
      note: "The virtual display refreshes at 60 Hz, so a frame is 16.7 ms plus the timer's jitter; the tolerance is that jitter and nothing more.",
    },
    scales,
    ...extra,
  };
  mkdirSync(r3, { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
}

/** The budget every row is held to. */
export function holdRows(expect, rows) {
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
}
