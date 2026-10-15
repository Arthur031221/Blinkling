import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  launch, native, activeWindow, desktopShot, openFixture, elementBounds, center, waitForPick,
  holdCtrl, releaseCtrl, timeline, pickFrames, layerEval, miniEval, miniFrames, checkFrames, sleep, report,
} from "./support.mjs";
import { keyDown, keyUp, tap, CTRL, SHIFT } from "./keys.mjs";

const marks = (app) => timeline(app).then((t) => t.map((e) => e.name));
const count = async (app, name) => (await marks(app)).filter((n) => n === name).length;
const miniState = (app) => app.evaluate(() => globalThis.blinklingTest.pick.mini.state());
const outline = (app) =>
  layerEval(app, () => {
    const r = document.querySelector("#outline .fill").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
const near = (a, b, d = 1.5) => {
  for (const k of ["x", "y", "width", "height"]) expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(d);
};

async function ready(scale = 1, size) {
  const c = await launch(scale);
  await waitForPick(c.app);
  await openFixture(c.app, size);
  return c;
}

/** Hold Ctrl over the element and click it; resolves once the mini composer is open. */
async function pickElement(c, selector, { release = true } = {}) {
  const before = await count(c.app, "mini-open");
  const r = await elementBounds(c.app, selector);
  const p = center(r);
  native(p.x, p.y);
  if (!(await c.app.evaluate(() => globalThis.blinklingTest.pick.layers.shown))) await holdCtrl(c.app);
  await expect.poll(() => outline(c.app).then((o) => Math.abs(o.width - r.width))).toBeLessThan(2);
  const seen = await outline(c.app);
  native(p.x, p.y, "click");
  await expect.poll(() => count(c.app, "mini-open"), { timeout: 8000 }).toBe(before + 1);
  if (release) releaseCtrl();
  return { r, seen };
}

test("layer windows are made hidden at start, one per display, and reused", async () => {
  const c = await ready();
  try {
    const first = await c.app.evaluate(() => {
      const { layers, miniWindow } = globalThis.blinklingTest.pick;
      return { layers: layers.windows().map((w) => ({ id: w.id, visible: w.isVisible() })), mini: miniWindow.win.isVisible() };
    });
    const displays = await c.app.evaluate(({ screen }) => screen.getAllDisplays().length);
    expect(first.layers).toHaveLength(displays);
    expect(first.layers.every((l) => !l.visible)).toBe(true);
    expect(first.mini).toBe(false);
    await pickElement(c, "#text");
    await expect.poll(() => c.app.evaluate(() => globalThis.blinklingTest.pick.layers.shown)).toBe(false);
    const after = await c.app.evaluate(() => globalThis.blinklingTest.pick.layers.windows().map((w) => w.id));
    expect(after).toEqual(first.layers.map((l) => l.id));
  } finally {
    await c.close();
  }
});

test("Ctrl held 250 ms raises layer, outline and badge within a frame; a short tap does nothing", async () => {
  const c = await ready();
  try {
    const para = await elementBounds(c.app, "#text");
    const p = center(para);
    native(p.x, p.y);
    keyDown(CTRL);
    await sleep(100);
    keyUp(CTRL);
    await sleep(500);
    expect(await marks(c.app)).not.toContain("raise");
    expect(await c.app.evaluate(() => globalThis.blinklingTest.pick.layers.shown)).toBe(false);

    const t0 = Date.now();
    await holdCtrl(c.app);
    await sleep(250);
    const raise = (await timeline(c.app)).find((e) => e.name === "raise");
    expect(raise.t - t0).toBeGreaterThanOrEqual(230);
    expect(raise.t - t0).toBeLessThanOrEqual(420);
    const layer = await layerEval(c.app, () => ({
      shownAt: globalThis.__blinklingPick.shownAt,
      active: document.getElementById("stage").dataset.active,
      badge: document.getElementById("badge").dataset.mode,
    }));
    // One frame at 60 Hz is 16.7 ms; the layer draws within two of the raise.
    expect(layer.shownAt - raise.t).toBeLessThanOrEqual(34);
    expect(layer.active).toBe("true");
    expect(layer.badge).toBe("crayon");
    near(await outline(c.app), para);
    // The picture, not just the geometry: a pale fill inside, a green line on
    // the edge, the page untouched outside.
    const shot = await desktopShot(c.app, "pick-layer-raised");
    const px = (x, y) => [...shot.data.subarray((Math.round(y) * shot.width + Math.round(x)) * 4, (Math.round(y) * shot.width + Math.round(x)) * 4 + 3)];
    const inside = px(para.x + para.width - 40, para.y + 10);
    expect(inside[0], "fill stays pale").toBeGreaterThan(200);
    expect(inside[1]).toBeGreaterThan(220);
    const edge = px(para.x + 200, para.y);
    expect(edge[0], "edge is green").toBeLessThan(90);
    expect(edge[1]).toBeGreaterThan(120);
    expect(px(para.x + 200, para.y - 12), "page outside").toEqual([255, 255, 255]);
    releaseCtrl();
    await expect.poll(() => c.app.evaluate(() => globalThis.blinklingTest.pick.layers.shown)).toBe(false);
  } finally {
    await c.close();
  }
});

for (const [selector, kind] of [["#text", "text"], ["#photo", "image"], ["#table", "table"]]) {
  test(`picking ${kind} on a real page: outline matches, effect, flight into Blink, mini composer`, async () => {
    const c = await ready();
    try {
      const r = await elementBounds(c.app, selector);
      const p = center(r);
      native(p.x, p.y);
      await holdCtrl(c.app);
      await expect.poll(() => outline(c.app).then((o) => o.width)).toBeGreaterThan(10);
      near(await outline(c.app), r);
      await layerEval(c.app, () => {
        globalThis.__wipes = new Map();
        const t0 = performance.now();
        const sample = () => {
          for (const w of document.querySelectorAll(".wipe[data-role='stroke']")) {
            const m = new DOMMatrix(getComputedStyle(w).transform);
            const rec = globalThis.__wipes.get(w) ?? { first: m.m41 + m.m42, start: null, end: null, order: globalThis.__wipes.size };
            globalThis.__wipes.set(w, rec);
            const off = Math.abs(m.m41) + Math.abs(m.m42);
            if (rec.start === null && Math.abs(off - Math.abs(rec.first)) > 0.5) rec.start = performance.now() - t0;
            if (rec.start !== null && rec.end === null && off < 0.5) rec.end = performance.now() - t0;
          }
          if (performance.now() - t0 < 3000) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        window.__strokes = () => [...globalThis.__wipes.values()].map(({ start, end, order }) => ({ start, end, order }));
      });
      native(p.x, p.y, "click");
      await expect.poll(() => count(c.app, "mini-open"), { timeout: 8000 }).toBe(1);
      releaseCtrl();
      const events = await timeline(c.app);
      const at = (n) => events.find((e) => e.name === n).t;
      const taken = events.find((e) => e.name === "taken");
      expect(taken.kind).toBe(kind);
      expect(taken.source).toBe("pick");
      expect(at("landed")).toBeLessThanOrEqual(at("catch"));
      expect(at("catch")).toBeLessThanOrEqual(at("mini-open"));
      // Effect plus flight stay inside the budget the spec gives (effect <= 450 ms).
      expect(at("landed") - taken.t).toBeLessThanOrEqual(1400);

      const frames = await pickFrames(c.app);
      const effect = checkFrames(frames, "pick-effect", { maxSpan: 450 + 100 });
      const flight = checkFrames(frames, "flight");
      // The thumbnail ends on Blink's art, measured in Blink's own page.
      const art = await c.app.evaluate(async () => {
        const b = globalThis.blinklingTest.blink;
        const r = await b.webContents.executeJavaScript(
          "(() => { const r = document.querySelector('#blink').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
        );
        const o = b.getBounds();
        return { x: o.x + r.x, y: o.y + r.y, width: r.width, height: r.height };
      });
      const last = frames.filter((f) => f.surface === "flight").at(-1).box;
      const landing = { x: last.x + last.width / 2, y: last.y + last.height / 2 };
      expect(landing.x, `landing ${JSON.stringify(landing)} art ${JSON.stringify(art)}`).toBeGreaterThanOrEqual(art.x);
      expect(landing.x).toBeLessThanOrEqual(art.x + art.width);
      expect(landing.y).toBeGreaterThanOrEqual(art.y);
      expect(landing.y).toBeLessThanOrEqual(art.y + art.height);

      await writeFile(join(report, `pick-image-${kind}.png`), Buffer.from((await c.app.evaluate(() => globalThis.blinklingTest.pick.picks()))[0].image.data, "base64"));
      if (kind === "text") {
        const strokes = (await layerEval(c.app, () => window.__strokes?.() ?? [])).filter((s) => s.start !== null);
        expect(strokes.length, `one crayon stroke per line ${JSON.stringify(strokes)}`).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < strokes.length; i++) expect(strokes[i].start, "line by line").toBeGreaterThanOrEqual(strokes[i - 1].start);
        expect(strokes.at(-1).start).toBeGreaterThan(strokes[0].start + 15);
      }

      const state = await miniState(c.app);
      expect(state.open).toBe(true);
      expect(state.picks).toHaveLength(1);
      expect(state.picks[0].kind).toBe(kind);
      expect(state.picks[0].image.width).toBeGreaterThan(0);
      if (kind === "image") expect(state.picks[0].textChip).toBeNull();
      else expect(state.picks[0].textChip).toBeTruthy();
      expect(state.chips.filter((x) => x.highlighted)).toHaveLength(1);
      const dom = await miniEval(c.app, () => ({
        chips: [...document.querySelectorAll("#chips [data-chip]")].map((b) => [b.dataset.chip, b.dataset.highlighted]),
        picks: document.querySelectorAll("#picks li").length,
        texts: document.querySelectorAll("#picks .text").length,
        images: document.querySelectorAll("#picks li.pick:not(.text) img").length,
      }));
      expect(dom.chips.filter(([, h]) => h === "true")).toHaveLength(1);
      expect(dom.images).toBe(1);
      expect(dom.texts).toBe(kind === "image" ? 0 : 1);
      const mini = checkFrames(await miniFrames(c.app), "mini-composer", { minFrames: 2 });
      await desktopShot(c.app, `pick-mini-${kind}`);
      await writeFile(join(report, `pick-frames-${kind}.json`), JSON.stringify({ effect, flight, mini, chips: dom.chips }, null, 2));
    } finally {
      await c.close();
    }
  });
}
