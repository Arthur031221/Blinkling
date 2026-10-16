/** The N6.8 frame gate: records what the animated surfaces log while an action
 * runs, and measures it. Surfaces call `frameLog()` from shared/motion.mjs once
 * per frame; each window keeps its own `window.__blinklingFrames`. */

/** Largest frame gap, in ms, that still belongs to the same animation run. A
 * longer pause is the surface at rest between two animations, not a dropped frame. */
export const RUN_GAP = 250;
/** A box moving more than this many CSS px between two frames may have jumped. */
export const JUMP = 160;
/** It has jumped only if that step is also this many times the step before it:
 * a fast flight that eases in and out covers a lot of ground per frame at its
 * peak, but its steps rise and fall smoothly, and a dropped frame doubles one. */
export const SURGE = 1.5;
/** The N6.8 limits: 95th percentile frame and the worst frame, in ms. */
export const LIMITS = Object.freeze({ p95: 20, max: 50 });

/** Frame gaps and box jumps of one surface's log, in time order. */
export function measure(frames, surface = null) {
  const mine = frames
    .filter((f) => surface === null || f.surface === surface)
    .sort((a, b) => a.t - b.t);
  const gaps = [];
  const jumps = [];
  let before = 0;
  for (let i = 1; i < mine.length; i++) {
    const gap = mine[i].t - mine[i - 1].t;
    if (gap > RUN_GAP) {
      before = 0;
      continue;
    }
    gaps.push(gap);
    const a = mine[i - 1].box;
    const b = mine[i].box;
    if (!a || !b) {
      before = 0;
      continue;
    }
    const moved = Math.max(
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
      Math.abs(b.x + b.width - (a.x + a.width)),
      Math.abs(b.y + b.height - (a.y + a.height)),
    );
    const previous = before;
    before = moved;
    if (moved > JUMP && moved > previous * SURGE)
      jumps.push({
        surface: mine[i].surface,
        t: mine[i].t,
        moved,
        from: a,
        to: b,
      });
  }
  gaps.sort((p, q) => p - q);
  return {
    frames: mine.length,
    gaps,
    p95: gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))] ?? 0,
    max: gaps.at(-1) ?? 0,
    jumps,
  };
}

/** Frames logged by one window, or by every window of an Electron app. */
export async function readFrames(target) {
  if (typeof target.windows !== "function")
    return target.evaluate(() => globalThis.__blinklingFrames ?? []);
  return target.evaluate(async ({ BrowserWindow }) => {
    const all = [];
    for (const w of BrowserWindow.getAllWindows())
      if (!w.isDestroyed())
        all.push(
          ...((await w.webContents
            .executeJavaScript("window.__blinklingFrames ?? []")
            .catch(() => [])) ?? []),
        );
    return all;
  });
}

/** Empties the logs without replacing them: surfaces hold the array. */
export async function clearFrames(target) {
  if (typeof target.windows !== "function")
    return target.evaluate(
      () => void (globalThis.__blinklingFrames ??= []).splice(0),
    );
  return target.evaluate(async ({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      if (!w.isDestroyed())
        await w.webContents
          .executeJavaScript("(window.__blinklingFrames ??= []).splice(0) && 0")
          .catch(() => {});
  });
}

/** Runs `action` and measures every frame the surfaces logged meanwhile.
 * `win` is a Playwright page, or the Electron app to cover all of its windows.
 * Returns `{ p95, max, jumps, frames, surfaces }`; `surfaces` has the same
 * figures per surface, and p95 and max are the worst of any surface, so one
 * slow surface cannot hide behind a fast one. */
export async function recordFrames(win, action) {
  await clearFrames(win);
  await action();
  const log = await readFrames(win);
  const surfaces = {};
  for (const name of new Set(log.map((f) => f.surface))) {
    const figures = measure(log, name);
    delete figures.gaps;
    surfaces[name] = figures;
  }
  const all = Object.values(surfaces);
  return {
    p95: Math.max(0, ...all.map((s) => s.p95)),
    max: Math.max(0, ...all.map((s) => s.max)),
    jumps: all.flatMap((s) => s.jumps),
    frames: all.reduce((n, s) => n + s.frames, 0),
    surfaces,
  };
}

/** The gate's verdict as a list of failures; empty when the run passes. */
export function verdict(result, { p95 = LIMITS.p95, max = LIMITS.max } = {}) {
  const failures = [];
  for (const [name, s] of Object.entries(result.surfaces)) {
    if (s.p95 > p95)
      failures.push(`${name}: p95 ${s.p95.toFixed(1)} ms > ${p95}`);
    if (s.max > max)
      failures.push(`${name}: a frame took ${s.max.toFixed(1)} ms > ${max}`);
    for (const j of s.jumps)
      failures.push(
        `${name}: box jumped ${j.moved.toFixed(0)} px between two frames`,
      );
  }
  return failures;
}
