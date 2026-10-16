import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background, shot, rgb, sleep } from "./helpers.mjs";
import x11 from "x11";
import { writeFileSync, mkdirSync } from "node:fs";
import { record, r3 } from "./record.mjs";
import { effectPlan } from "../../pick/effects.mjs";

const AREA = { x: 300, y: 200, width: 400, height: 260 };

const PHOTO = `<body style="margin:0;background:linear-gradient(120deg,#2b5876,#e9b44c 45%,#c0392b 70%,#1b1f3b)"><div style="position:fixed;inset:0;background:repeating-radial-gradient(circle at 30% 40%,rgba(255,255,255,.25) 0 7px,rgba(0,0,0,.25) 7px 15px)"></div>`;
const PAGES = {
  light: `<body style="margin:0;background:#f6f6f2;color:#222;font:24px sans-serif"><div style="padding:40px">A light page</div>`,
  dark: `<body style="margin:0;background:#14161a;color:#ddd;font:24px sans-serif"><div style="padding:40px">A dark page</div>`,
  photo: PHOTO,
};

const paint = (app, name) =>
  app.evaluate(async (_, html) => {
    await globalThis.bg.loadURL("data:text/html," + encodeURIComponent(html));
  }, PAGES[name]);

/** The layer is an override-redirect window on X11 and the page window was made
 * after it, so it is raised the way the shell raises it for a real pick. */
const raise = (id) =>
  new Promise((done, fail) =>
    x11.createClient((error, display) => {
      if (error) return fail(error);
      display.client.RaiseWindow(id);
      display.client.terminate();
      done();
    }),
  );

/** Shows the pick layer and hands it what the controller sends for a taken area. */
const take = async (app, bounds) => {
  const id = await app.evaluate(
    async ({ BrowserWindow, screen }, [bounds, effect]) => {
      const layer = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith("layer.html"),
      );
      const display = screen.getPrimaryDisplay();
      layer.setBounds(display.bounds);
      layer.showInactive();
      layer.webContents.send("blinkling:pick-message", {
        channel: "taken",
        value: {
          index: 0,
          kind: "area",
          bounds,
          effect,
          grew: false,
        },
      });
      return layer.getNativeWindowHandle().readUInt32LE(0);
    },
    [bounds, effectPlan({ kind: "area", bounds })],
  );
  await raise(id);
};

const column = (png, x, from, to) => {
  const out = [];
  for (let y = from; y <= to; y++) out.push(rgb(png, x, y));
  return out;
};
const greenish = ([r, g, b]) => g > r + 40 && g > b + 15;

test("the pick frame is exact: dark hairline, two rows of green, light hairline, on every page", async () => {
  test.setTimeout(120000);
  const { app } = await launch();
  const rec = record("pick_frame");
  try {
    await background(app);
    for (const name of ["light", "dark", "photo"]) {
      await paint(app, name);
      await sleep(400);
      rec.frame(`${name}-empty`);
      await take(app, AREA);
      await sleep(350);
      rec.frame(`${name}-ignite`, "560:400:200:100");
      await sleep(1500);
      const png = await shot(app, `pick-frame-${name}`);
      rec.frame(`${name}-calm`);
      rec.frame(
        `${name}-calm-x2`,
        "280:200:280:180,scale=iw*2:ih*2:flags=neighbor",
      );
      // Along the top edge the same four rows show on any page: the page itself,
      // a dark hairline, two rows of green on the edge, a light hairline. The light
      // running round may cover a stretch, so a few columns are tried.
      const lum = ([r, g, b]) => r + g + b;
      let found = 0;
      for (const x of [380, 420, 460, 500, 540, 580, 620]) {
        const rows = column(png, x, AREA.y - 4, AREA.y + 3);
        const green = rows.map(greenish);
        if (
          green.join() === "false,false,false,true,true,false,false,false" &&
          lum(rows[2]) < lum(rows[0]) - 9 &&
          lum(rows[5]) > lum(rows[0]) + 9
        )
          found++;
      }
      expect
        .soft(found, `${name}: two green rows on the top edge`)
        .toBeGreaterThanOrEqual(3);
      // The left edge is straight too: same two rows at the same x on every y.
      const xs = new Set();
      for (let y = AREA.y + 40; y < AREA.y + AREA.height - 40; y += 20) {
        const row = Array.from({ length: 9 }, (_, i) =>
          rgb(png, AREA.x - 4 + i, y),
        );
        xs.add(row.map(greenish).join());
      }
      expect
        .soft(xs.size, `${name}: the left edge does not wobble`)
        .toBeLessThanOrEqual(3);
      await app.evaluate(({ BrowserWindow }) => {
        const layer = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().endsWith("layer.html"),
        );
        layer.webContents.send("blinkling:pick-message", {
          channel: "clear",
          value: {},
        });
      });
      await sleep(300);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

const layerEval = (app, code) =>
  app.evaluate(
    ({ BrowserWindow }, code) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("layer.html"))
        .webContents.executeJavaScript(code),
    code,
  );

const percentile = (list, q) =>
  [...list].sort((a, b) => a - b)[
    Math.min(list.length - 1, Math.floor(list.length * q))
  ];

test("the frame is cheap to draw: its running light stays far inside a frame budget", async () => {
  test.setTimeout(120000);
  const { app } = await launch();
  try {
    await background(app);
    await paint(app, "photo");
    // Time every animation frame callback of the layer, and the gap between them.
    await layerEval(
      app,
      `window.__cost = { work: [], gap: [] };
       const raf = window.requestAnimationFrame.bind(window);
       let prev = 0;
       window.requestAnimationFrame = (fn) =>
         raf((now) => {
           if (prev) window.__cost.gap.push(now - prev);
           prev = now;
           const t = performance.now();
           fn(now);
           window.__cost.work.push(performance.now() - t);
         });
       true`,
    );
    const size = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().bounds,
    );
    const result = {};
    for (const [name, bounds] of [
      ["area", AREA],
      ["screen", { x: 0, y: 0, width: size.width, height: size.height }],
    ]) {
      await take(app, bounds);
      await sleep(400);
      await layerEval(
        app,
        "window.__cost.work.length = 0; window.__cost.gap.length = 0; true",
      );
      await sleep(4000);
      const { work, gap } = await layerEval(app, "window.__cost");
      result[name] = {
        frames: work.length,
        work_p95_ms: +percentile(work, 0.95).toFixed(3),
        work_max_ms: +Math.max(...work).toFixed(3),
        gap_p95_ms: +percentile(gap, 0.95).toFixed(2),
        gap_max_ms: +Math.max(...gap).toFixed(2),
      };
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().endsWith("layer.html"))
          .webContents.send("blinkling:pick-message", {
            channel: "clear",
            value: {},
          });
      });
      await sleep(300);
    }
    mkdirSync(r3, { recursive: true });
    writeFileSync(
      `${r3}/perf-pick-frame.json`,
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log("PERF " + JSON.stringify(result));
    for (const r of Object.values(result)) {
      expect(r.frames).toBeGreaterThan(30);
      expect(r.work_p95_ms).toBeLessThan(4);
      expect(r.work_max_ms).toBeLessThan(16);
    }
  } finally {
    await app.close();
  }
});
