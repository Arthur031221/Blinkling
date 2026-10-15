import { test, expect, type BrowserContext } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { launchExtensionContext } from "../../../e2e-extension/browser";
import { HelperServer } from "../../../bridge/src/helper-server";
import { discoverDesktop } from "../../../plugin/desktop/client.mjs";
import {
  launch,
  shot,
  findColour,
  centre,
  percentile,
  hoverRun,
  outline,
} from "./support.mjs";

type Rect = { x: number; y: number; width: number; height: number };
const report = join(process.cwd(), "..", "test-results", "locator");
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='160'><rect width='300' height='160' fill='rgb(0,40,230)'/></svg>",
)}`;
const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Locator page</title>
<style>body{margin:0;font:20px sans-serif;background:#f4f1e8;color:#222}
main{padding:16px;width:640px}
#shot{display:block;margin:12px 0}
#go{display:block;width:260px;height:56px;margin:12px 0;border:0;background:rgb(240,0,160);color:#fff;font:20px sans-serif}
#secret{display:block;width:260px;height:48px;margin:12px 0;background:rgb(0,200,70);border:0;font:20px sans-serif}
table{border-collapse:collapse;margin:12px 0}td{border:1px solid #444;padding:8px 18px}</style>
<main><h1>Research notebook</h1>
<p>First paragraph explains how the notebook works. It has two sentences.</p>
<img id="shot" alt="Blue chart" width="300" height="160" src="${IMAGE}">
<p>Second paragraph sits below the picture and carries more words to read.</p>
<button id="go" type="button">Export notebook</button>
<input id="secret" type="password" value="hunter2-do-not-leak" aria-label="Password">
<table><tr><td>Alpha</td><td>Beta</td></tr><tr><td>Gamma</td><td>Delta</td></tr></table>
</main>`;

test("hover locate on a real browser page returns the element under the pointer within 50 ms", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blinkling-locator-e2e-"));
  let context: BrowserContext | undefined;
  let bridge: HelperServer | undefined;
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  const site = createServer((_, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(PAGE);
  });
  try {
    await mkdir(report, { recursive: true });
    app = await launch({
      env: { BLINKLING_RUNTIME_DIR: join(directory, "runtime") },
    });
    process.env.BLINKLING_RUNTIME_DIR = join(directory, "runtime");
    await expect.poll(async () => !!(await discoverDesktop())).toBe(true);

    bridge = await new HelperServer({
      panelDir: resolve("..", "bin/panel"),
      provider: async () => ({ answer: "[]" }),
    }).start();
    site.listen(0, "localhost");
    await once(site, "listening");
    const address = site.address();
    if (!address || typeof address === "string") throw new Error("No port");

    const extension = resolve("..", "dist-extension");
    context = await launchExtensionContext(join(directory, "profile"), {
      headless: false,
      viewport: null,
      args: [
        `--load-extension=${extension}`,
        `--disable-extensions-except=${extension}`,
        "--no-sandbox",
        "--enable-unsafe-extension-debugging",
        "--window-size=1000,760",
        "--window-position=0,0",
      ],
    });
    if (!context.serviceWorkers().length)
      await context.waitForEvent("serviceworker");
    const setup = await context.newPage();
    await setup.goto(
      `${bridge.origin}/install#code=${bridge.trust.issueCode()}`,
    );
    await expect.poll(() => bridge!.helperConnected).toBe(true);
    await setup.close();
    await expect
      .poll(async () => (await discoverDesktop())?.status.companion)
      .toBe(true);

    const tab = await context.newPage();
    await tab.goto(`http://localhost:${address.port}/`);
    await tab.bringToFront();
    await expect(tab.locator("#go")).toBeVisible();
    await tab.waitForTimeout(800);

    // Where the blocks really are, read from the screen itself.
    const grab = (name: string) => shot(app, join(report, name));
    const first = await grab("browser-page.png");
    const truth = {
      image: findColour(first, [0, 40, 230]),
      button: findColour(first, [240, 0, 160]),
      secret: findColour(first, [0, 200, 70]),
    };
    expect(truth.image && truth.button && truth.secret).toBeTruthy();

    const one = (point: { x: number; y: number }) =>
      app!.evaluate(
        (_, p) => globalThis.blinklingTest.locator.locate(p),
        point,
      );
    // The first look loads the page's structure; allow it to arrive.
    await expect
      .poll(async () => (await one(centre(truth.button!)))?.kind, {
        timeout: 15000,
      })
      .toBe("button");

    const close = (a: Rect, b: Rect, slack = 3) => {
      expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(slack);
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(slack);
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(slack);
      expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(slack);
    };
    const button = await one(centre(truth.button!));
    expect(button).toMatchObject({ kind: "button", name: "Export notebook" });
    expect(button.id.startsWith("dom:")).toBe(true);
    close(button.bounds, truth.button!);

    const image = await one(centre(truth.image!));
    expect(image.kind).toBe("image");
    close(image.bounds, truth.image!);

    // Text structure, at positions read off the screenshot above.
    const heading = await one({ x: 200, y: 152 });
    expect(heading.kind).toBe("heading");
    expect(heading.text).toContain("Research notebook");
    const paragraph = await one({ x: 300, y: 213 });
    expect(["paragraph", "sentence", "text"]).toContain(paragraph.kind);
    expect(paragraph.text).toContain("First paragraph");
    const cell = await one({ x: 75, y: 641 });
    expect(cell.kind).toBe("cell");
    expect(cell.text).toContain("Alpha");

    // The password field is never returned, and its value never leaves.
    const secret = await one(centre(truth.secret!));
    expect(secret?.kind).not.toBe("input");
    expect(JSON.stringify(secret ?? null)).not.toContain("hunter2");
    expect(JSON.stringify(secret ?? null)).not.toContain("do-not-leak");

    // Hover across the whole page, long enough for the cache to go stale
    // and refresh once.
    const win = { x: 0, y: 0, width: 1000, height: 760 };
    const points = [] as { x: number; y: number }[];
    for (let i = 0; i < 160; i++)
      points.push({
        x: win.x + 60 + ((i * 97) % (win.width - 120)),
        y: win.y + 120 + ((i * 53) % (win.height - 180)),
      });
    const run = await hoverRun(app, points, 40);
    const p50 = percentile(run.times, 0.5);
    const p95 = percentile(run.times, 0.95);
    const max = Math.max(...run.times);
    console.log(
      `browser hover locate: n=${run.times.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`,
    );
    const slow = run.times
      .map((t, i) => [
        i,
        Math.round(t),
        Math.round(run.lags[i]),
        Math.round(run.lags[i + 1] ?? 0),
      ])
      .filter(([, t]) => t > 20);
    console.log(
      `slower than 20 ms (index, ms, loop lag ms): ${JSON.stringify(slow)}`,
    );
    await writeFile(
      join(report, "browser-timing.json"),
      JSON.stringify({ p50, p95, max, n: run.times.length }, null, 2),
    );
    expect(p95).toBeLessThanOrEqual(50);
    expect(run.results.filter(Boolean).length).toBeGreaterThan(
      points.length / 2,
    );
    expect(JSON.stringify(run.results)).not.toContain("hunter2");

    const marked = outline(
      await grab("browser-after.png"),
      [button, image, heading, paragraph, cell].map((e) => e.bounds),
    );
    await writeFile(join(report, "browser-located.png"), marked);
  } finally {
    await context?.close().catch(() => {});
    await bridge?.stop?.().catch?.(() => {});
    site.close();
    await app?.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
