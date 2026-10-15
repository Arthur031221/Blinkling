import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { launch, poll, input, shot, frameStats } from "./support.mjs";

export const SCALE = Number(process.env.PICK_SCALE ?? 1);
export const px = (v) => Math.round(v * SCALE);
export { launch, poll, input, shot, frameStats };

const fixture = fileURLToPath(new URL("./fixtures/page.html", import.meta.url));
// The locator module has a single export; evaluating it in the app avoids any
// dependence on dynamic import inside Playwright's evaluate.
const locatorSource = readFileSync(
  new URL("./dom-locator.mjs", import.meta.url),
  "utf8",
).replaceAll("export ", "");

/** The shell's windows are override-redirect; under xfwm4 a managed window made
 * after them sits above them, which a real desktop with the shell's windows
 * "always on top" does not do. Raise the pick layer, the mini composer, the
 * composer and Blink over the fixture, as the stacking really is for the user. */
export async function stack(app) {
  const ids = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.webContents.getURL().includes("fixtures/"))
      .map((w) => w.getNativeWindowHandle().readUInt32LE(0)),
  );
  const script = [
    "import ctypes, sys",
    "x = ctypes.CDLL('libX11.so.6'); x.XOpenDisplay.restype = ctypes.c_void_p",
    "x.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]; x.XFlush.argtypes = [ctypes.c_void_p]",
    "d = x.XOpenDisplay(None)",
    "[x.XRaiseWindow(d, int(i)) for i in sys.argv[1:]]",
    "x.XFlush(d)",
  ].join("\n");
  execFileSync("python3", ["-I", "-c", script, ...ids.map(String)]);
}

/** Opens the page fixture in a real Chromium window and plugs the DOM locator in. */
export function openFixture(
  app,
  bounds = { x: 80, y: 60, width: 640, height: 620 },
) {
  return app
    .evaluate(
      async ({ BrowserWindow, screen }, { fixture, locatorSource, bounds }) => {
        const win = new BrowserWindow({
          ...bounds,
          frame: false,
          show: false,
          webPreferences: { sandbox: true },
        });
        await win.loadFile(fixture);
        win.show();
        const make = new Function(
          `${locatorSource}; return createDomLocator;`,
        )();
        const locator = make({ win, display: screen.getPrimaryDisplay() });
        globalThis.__fixture = win;
        globalThis.blinklingTest.pick.setLocator(locator);
        return win.getContentBounds();
      },
      { fixture, locatorSource, bounds },
    )
    .then(async (content) => (await stack(app), content));
}

/** Records what the pick sends to its layer and to the session. */
export function record(app) {
  return app.evaluate(() => {
    const pick = globalThis.blinklingTest.pick;
    const layer = pick.test.layer;
    const log = (globalThis.__pickLog = {
      layer: [],
      flights: [],
      turns: [],
      raises: [],
      shows: [],
    });
    const send = layer.send;
    layer.send = (channel, value) => (
      log.layer.push({ t: performance.now(), channel, value }),
      send(channel, value)
    );
    const flight = layer.flight;
    layer.flight = (items, to) => (
      log.flights.push({ t: performance.now(), items, to }),
      flight(items, to)
    );
    const show = layer.show;
    layer.show = (display, cursor) => (
      log.shows.push(Date.now()),
      show(display, cursor)
    );
    const raise = pick.test.controller.raise;
    pick.test.controller.raise = () => (log.raises.push(Date.now()), raise());
    globalThis.blinklingTest.session.send = async (turn) =>
      void log.turns.push(turn);
    return true;
  });
}

export const log = (app) =>
  app.evaluate(() => JSON.parse(JSON.stringify(globalThis.__pickLog)));

/** Every frame logged by the layer windows and the mini composer. */
export function frames(app) {
  return app.evaluate(async ({ BrowserWindow }) => {
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

/** The DOM's own answer for an element, in screen DIP. */
export function domRect(app, selector) {
  return app.evaluate(async (_electron, selector) => {
    const win = globalThis.__fixture;
    const r = await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`,
    );
    const o = win.getContentBounds();
    return { x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height };
  }, selector);
}

export const raised = (app) =>
  app.evaluate(() => globalThis.blinklingTest.pick.test.controller.isRaised());
export const miniOpen = (app) =>
  app.evaluate(() => globalThis.blinklingTest.pick.test.mini.isOpen);
export const miniEval = (app, code) =>
  app.evaluate(
    (_electron, code) =>
      globalThis.blinklingTest.pick.test.miniWindow.webContents.executeJavaScript(
        code,
      ),
    code,
  );
export const near = (a, b, d = 2) => Math.abs(a - b) <= d;
export const sameRect = (a, b, d = 2) =>
  near(a.x, b.x, d) &&
  near(a.y, b.y, d) &&
  near(a.width, b.width, d) &&
  near(a.height, b.height, d);

/** Runs code in the fixture page. */
export const pageEval = (app, code) =>
  app.evaluate(
    (_electron, code) =>
      globalThis.__fixture.webContents.executeJavaScript(code),
    code,
  );

const SENTENCE =
  "The second sentence of this paragraph is long enough that it wraps onto a further line of text.";

/** The sentence as a pattern: the fixture's source wraps its lines, so its words
 * are split by any whitespace. */
const SENTENCE_PATTERN = SENTENCE.replace(/\./g, "\\.").replace(/ /g, "\\s+");

/** The DOM's own answer for the second sentence of the paragraph, independent of
 * the locator under test: one rect per rendered line (screen DIP), their union,
 * and the middle of the word "paragraph" to click on. */
export async function domSentence(app) {
  const facts = await pageEval(
    app,
    `(() => {
      const node = document.getElementById("story-text").firstChild;
      const text = node.data;
      const range = document.createRange();
      const found = new RegExp(${JSON.stringify(SENTENCE_PATTERN)}).exec(text);
      const from = found.index;
      range.setStart(node, from);
      range.setEnd(node, from + found[0].length);
      const lines = [];
      for (const r of range.getClientRects()) {
        if (r.width < 1) continue;
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.y - r.top) < 4) {
          last.width = Math.max(last.x + last.width, r.right) - Math.min(last.x, r.left);
          last.x = Math.min(last.x, r.left);
        } else lines.push({ x: r.left, y: r.top, width: r.width, height: r.height });
      }
      const word = document.createRange();
      const at = text.indexOf("paragraph");
      word.setStart(node, at);
      word.setEnd(node, at + 9);
      const w = word.getBoundingClientRect();
      return { lines, point: { x: w.left + w.width / 2, y: w.top + w.height / 2 } };
    })()`,
  );
  const o = await app.evaluate(() => globalThis.__fixture.getContentBounds());
  const move = (r) => ({ ...r, x: r.x + o.x, y: r.y + o.y });
  const lines = facts.lines.map(move);
  const x = Math.min(...lines.map((l) => l.x));
  const y = Math.min(...lines.map((l) => l.y));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  const bottom = Math.max(...lines.map((l) => l.y + l.height));
  return {
    lines,
    bounds: { x, y, width: right - x, height: bottom - y },
    point: { x: facts.point.x + o.x, y: facts.point.y + o.y },
  };
}

/** The layer messages of one channel, in order. */
export const sent = (data, channel) =>
  data.layer.filter((m) => m.channel === channel).map((m) => m.value);

/** Prints a page to a PDF with Chromium and opens it in a real window, so the
 * browser's own PDF viewer shows it. The PDF locator stands in for the window
 * locator service. `html` is the page that becomes the PDF. */
export async function openPdf(
  app,
  html,
  bounds = { x: 80, y: 60, width: 640, height: 620 },
) {
  const base64 = await app.evaluate(async ({ BrowserWindow }, html) => {
    const maker = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await maker.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    const data = await maker.webContents.printToPDF({});
    maker.destroy();
    return data.toString("base64");
  }, html);
  const file = join(
    mkdtempSync(join(tmpdir(), "pick-e2e-pdf-")),
    "document.pdf",
  );
  writeFileSync(file, Buffer.from(base64, "base64"));
  await app.evaluate(
    async (
      { BrowserWindow, screen, clipboard },
      { file, bounds, locatorSource },
    ) => {
      const win = new BrowserWindow({
        ...bounds,
        frame: false,
        show: false,
        webPreferences: { sandbox: true, plugins: true },
      });
      await win.loadURL(`file://${file}`);
      win.show();
      const make = new Function(`${locatorSource}; return createPdfLocator;`)();
      globalThis.__fixture = win;
      const locator = make({
        win,
        display: screen.getPrimaryDisplay(),
        clipboard,
      });
      globalThis.__locator = locator;
      globalThis.blinklingTest.pick.setLocator(locator);
    },
    { file, bounds, locatorSource },
  );
  await stack(app);
}
