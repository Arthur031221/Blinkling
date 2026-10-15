import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launch, native, report, activeWindow, desktopShot } from "../../main/e2e/support.mjs";
import { CTRL, keyDown, keyUp } from "./keys.mjs";

export { launch, native, report, activeWindow, desktopShot };
const FIXTURE = fileURLToPath(new URL("./fixture.html", import.meta.url));
const LOCATOR = fileURLToPath(new URL("./dom-locator.cjs", import.meta.url));

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real Chromium page in its own window, and the locator that reads it. */
export async function openFixture(app, { x = 60, y = 40, width = 820, height = 640, file = FIXTURE } = {}) {
  await app.evaluate(
    async ({ BrowserWindow, screen }, { file, locator, bounds }) => {
      const win = new BrowserWindow({ ...bounds, frame: false, show: false, backgroundColor: "#ffffff" });
      await win.loadFile(file);
      win.show();
      const d = screen.getPrimaryDisplay();
      const { createRequire } = process.getBuiltinModule("node:module");
      const { createDomLocator } = createRequire(locator)(locator);
      globalThis.fixtureWindow = win;
      globalThis.blinklingTest.pick.useLocator(
        createDomLocator(win, {
          id: String(d.id),
          bounds: { ...d.bounds },
          workArea: { ...d.workArea },
          scaleFactor: d.scaleFactor,
        }),
      );
    },
    { file, locator: LOCATOR, bounds: { x, y, width, height } },
  );
}

/** Where an element on the fixture is on the screen (DIP). */
export const elementBounds = (app, selector) =>
  app.evaluate(async (_, selector) => {
    const win = globalThis.fixtureWindow;
    const c = win.getContentBounds();
    const r = await win.webContents.executeJavaScript(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    );
    return { x: r.x + c.x, y: r.y + c.y, width: r.width, height: r.height };
  }, selector);

export const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export const hooks = (app, fn, arg) =>
  app.evaluate(fn, arg);

/** The pick hooks exist once the shell has finished starting. */
export async function waitForPick(app) {
  await expect.poll(() => app.evaluate(() => !!globalThis.blinklingTest?.pick), { timeout: 20000 }).toBe(true);
  await expect.poll(() => app.evaluate(() => globalThis.blinklingTest.pick.keyAvailable())).toBe(true);
}

export const timeline = (app) => app.evaluate(() => globalThis.blinklingTest.pick.timeline());
export const pickFrames = (app) => app.evaluate(() => globalThis.blinklingTest.pick.frames());

/** Hold the pick key until the layer is up. */
export async function holdCtrl(app) {
  keyDown(CTRL);
  await expect
    .poll(() => app.evaluate(() => globalThis.blinklingTest.pick.layers.shown), { timeout: 3000 })
    .toBe(true);
}
export const releaseCtrl = () => keyUp(CTRL);

/** A page of the pick layer on the display, to read what it drew. */
export const layerEval = (app, fn, arg) =>
  app.evaluate(
    async (_, { source, arg }) => {
      const [win] = globalThis.blinklingTest.pick.layers.windows();
      return win.webContents.executeJavaScript(`(${source})(${JSON.stringify(arg ?? null)})`);
    },
    { source: fn.toString(), arg },
  );

/** The mini composer's own page: what it drew and its frame log. */
export const miniEval = (app, fn, arg) =>
  app.evaluate(
    async (_, { source, arg }) =>
      globalThis.blinklingTest.pick.miniWindow.win.webContents.executeJavaScript(
        `(${source})(${JSON.stringify(arg ?? null)})`,
      ),
    { source: fn.toString(), arg },
  );
export const miniFrames = (app) => miniEval(app, () => globalThis.__blinklingFrames ?? []);

/** The frame gate: no stall longer than three frames, no missing surface. */
export function checkFrames(frames, surface, { maxSpan, minFrames = 3 } = {}) {
  const own = frames.filter((f) => f.surface === surface).map((f) => f.t).sort((a, b) => a - b);
  expect(own.length, `${surface} frames`).toBeGreaterThanOrEqual(minFrames);
  const gaps = own.slice(1).map((t, i) => t - own[i]);
  expect(Math.max(...gaps, 0), `${surface} longest gap`).toBeLessThanOrEqual(50);
  if (maxSpan) expect(own.at(-1) - own[0], `${surface} span`).toBeLessThanOrEqual(maxSpan);
  return { frames: own.length, span: own.at(-1) - own[0], gap: Math.max(...gaps, 0) };
}
