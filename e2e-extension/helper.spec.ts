import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { launchExtensionContext } from "./browser";
import { HelperServer } from "../bridge/src/helper-server";
import { discoverDesktop } from "../plugin/desktop/client.mjs";
import type { startDesktopHost } from "../plugin/desktop/host.mjs";

type Main = typeof globalThis & {
  blinklingCompanion: Awaited<ReturnType<typeof startDesktopHost>>;
};
const report = join(process.cwd(), "test-results", "helper");

const PAGE = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Research notebook</title><style>
  body{margin:0;font:20px sans-serif;background:#e8f4ee;color:#173d30}
  header{position:fixed;top:0;left:0;right:0;height:48px;background:rgb(240,0,160);color:white;z-index:10}
  nav{position:sticky;top:48px;margin-top:48px;height:32px;background:rgb(255,128,0)}
  main{height:2288px;padding:16px;box-sizing:border-box}
  footer{height:80px;background:rgb(0,80,220);color:white}
  </style><header>Fixed header appears once</header><nav>Sticky navigation appears once</nav>
  <main><h1>Research notebook</h1>
  <p id="foreign">このページは研究ノートの使い方を説明します。</p>
  <form><label>Account password <input id="secret" type="password" value="hunter2-do-not-leak"></label>
  <button id="export" type="button">Export notebook</button></form>
  <p style="margin-top:900px">Middle of the page</p></main><footer>Bottom of the complete page</footer>`;

// A one-page PDF; the browser opens it in its own viewer.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test("the helper gives Blink page structure, a full-length capture, translation and the PDF rule", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blinkling-helper-e2e-"));
  const runtime = join(directory, "runtime");
  const previousRuntime = process.env.BLINKLING_RUNTIME_DIR;
  process.env.BLINKLING_RUNTIME_DIR = runtime;
  let app: ElectronApplication | undefined;
  let context: BrowserContext | undefined;
  let bridge: HelperServer | undefined;
  const site = createServer((req, res) => {
    if (req.url === "/doc.pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.end(PDF);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(req.url === "/long" ? PAGE.replace(/<form>.*<\/form>/s, "") : PAGE);
  });
  try {
    app = await _electron.launch({
      ...(process.env.BLINKLING_TEST_EXECUTABLE
        ? { executablePath: process.env.BLINKLING_TEST_EXECUTABLE }
        : {}),
      args: [
        ...(process.env.BLINKLING_TEST_EXECUTABLE ? [] : [resolve("desktop")]),
        "--no-sandbox",
      ],
      env: {
        ...process.env,
        BLINKLING_E2E: "1",
        BLINKLING_REMOTE: process.env.BLINKLING_REMOTE ?? "0",
        BLINKLING_RUNTIME_DIR: runtime,
      },
    });
    await expect(
      (await app.firstWindow()).getByRole("img", { name: "Blink" }),
    ).toBeVisible();
    await expect.poll(async () => !!(await discoverDesktop())).toBe(true);
    const elements = () =>
      app!.evaluate(() => (globalThis as Main).blinklingCompanion.elements());

    // Without the helper there is nothing to return, and nothing breaks.
    expect(await elements()).toBeNull();
    expect(
      await app.evaluate(() =>
        (globalThis as Main).blinklingCompanion.fullPage(),
      ),
    ).toEqual({ companionRequired: true });

    bridge = await new HelperServer({
      panelDir: resolve("bin/panel"),
      provider: async ({ question }) => {
        const texts: string[] = JSON.parse(
          question.slice(question.lastIndexOf("[")),
        );
        return { answer: JSON.stringify(texts.map((text) => `EN:${text}`)) };
      },
    }).start();
    site.listen(0, "localhost");
    await once(site, "listening");
    const address = site.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const origin = `http://localhost:${address.port}`;

    const extension = resolve("dist-extension");
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
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;

    // Setup connects by itself: nobody sees or types a code.
    const setup = await context.newPage();
    await setup.goto(
      `${bridge.origin}/install#code=${bridge.trust.issueCode()}`,
    );
    await expect.poll(() => bridge!.helperConnected).toBe(true);
    await expect(setup.locator("body")).not.toContainText(/[0-9A-F]{16}/);
    await setup.close();
    await expect
      .poll(async () => (await discoverDesktop())?.status.companion)
      .toBe(true);

    await mkdir(report, { recursive: true });
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 340, height: 260 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#lines li").first()).toBeVisible();
    await expect(popup.locator("#wake")).toBeVisible();
    await expect(popup.locator("#lines li")).toHaveCount(3);
    const motion = () =>
      popup.evaluate(() => {
        const name = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!).animationName;
        return {
          eye: name("#title .bl-wm-eye"),
          star: name("#title .bl-wm-t0"),
          band: name("#title .bl-wm-band"),
        };
      });
    await popup.emulateMedia({ reducedMotion: "no-preference" });
    expect(await motion()).toEqual({
      eye: "bl-wm-blink",
      star: "bl-wm-twk",
      band: "bl-wm-sweep",
    });
    await popup.emulateMedia({ reducedMotion: "reduce" });
    expect(await motion()).toEqual({ eye: "none", star: "none", band: "none" });
    await popup.emulateMedia({ reducedMotion: "no-preference" });
    // A frame must be produced after the media change before Chrome can capture.
    await popup.bringToFront();
    await popup.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await popup.screenshot({ path: join(report, "popup.png") });
    await popup.close();

    const tab: Page = await context.newPage();
    await tab.goto(origin);
    await tab.bringToFront();
    const found = await elements();
    expect(found).not.toBeNull();
    expect(found!.page.url).toBe(origin + "/");
    expect(found!.page.title).toBe("Research notebook");
    expect(found!.page.incognito).toBe(false);
    expect(found!.frame.devicePixelRatio).toBeGreaterThan(0);
    const secret = found!.elements.find((element) => element.secure);
    expect(secret).toMatchObject({ kind: "input", secure: true, text: "" });
    expect(JSON.stringify(found)).not.toContain("hunter2");
    expect(JSON.stringify(found)).not.toContain("do-not-leak");
    const button = found!.elements.find((element) =>
      element.name.includes("Export notebook"),
    );
    expect(button?.rect.width).toBeGreaterThan(0);
    expect(found!.elements.every((e) => e.rect.width >= 0)).toBe(true);

    // At 125% zoom the same page still reports viewport CSS pixels.
    await worker.evaluate(async () => {
      const [active] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      await chrome.tabs.setZoom(active.id!, 1.25);
    });
    await tab.waitForTimeout(1700); // the bridge reuses an answer for 1.5 s
    const zoomed = await elements();
    expect(zoomed!.frame.zoom).toBeCloseTo(1.25, 2);
    const zoomedButton = zoomed!.elements.find((element) =>
      element.name.includes("Export notebook"),
    );
    const box = await tab.locator("#export").evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(zoomedButton!.rect.x).toBeCloseTo(box.x, 0);
    expect(zoomedButton!.rect.y).toBeCloseTo(box.y, 0);
    await worker.evaluate(async () => {
      const [active] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      await chrome.tabs.setZoom(active.id!, 1);
    });

    // A page with a password field is never captured whole.
    const refused = await app.evaluate(() =>
      (globalThis as Main).blinklingCompanion.fullPage(),
    );
    expect("tiles" in refused).toBe(false);

    // A long page arrives as readable tiles, with fixed bars painted once.
    await tab.goto(origin + "/long");
    await tab.evaluate(() => scrollTo(0, 320));
    const metrics = await tab.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scroll: scrollY,
      headerStyle: document.querySelector("header")!.getAttribute("style"),
    }));
    const capture = await app.evaluate(() =>
      (globalThis as Main).blinklingCompanion.fullPage(),
    );
    if ("companionRequired" in capture) throw new Error("No full page capture");
    expect(capture.tiles.length).toBeGreaterThan(1);
    expect(capture.truncated).toBe(false);
    for (const tile of capture.tiles)
      expect(tile.pixelWidth).toBe(metrics.width);
    expect(
      capture.tiles.reduce((total, tile) => total + tile.pixelHeight, 0),
    ).toBe(metrics.height);
    const rows = (color: number[]) => {
      let count = 0;
      for (const tile of capture.tiles) {
        const png = PNG.sync.read(Buffer.from(tile.image.data, "base64"));
        for (let y = 0; y < png.height; y++)
          if (
            color.every(
              (value, channel) =>
                png.data[(y * png.width + png.width - 40) * 4 + channel] ===
                value,
            )
          )
            count++;
      }
      return count;
    };
    expect(rows([240, 0, 160])).toBe(48);
    expect(rows([255, 128, 0])).toBe(32);
    expect(rows([0, 80, 220])).toBe(80);
    expect(await tab.evaluate(() => scrollY)).toBe(metrics.scroll);
    expect(await tab.locator("header").getAttribute("style")).toBe(
      metrics.headerStyle,
    );
    await writeFile(
      join(report, "full-page.png"),
      Buffer.from(capture.image.data, "base64"),
    );

    // Translate in place, then restore.
    const original = await tab.locator("#foreign").textContent();
    expect(
      await app.evaluate(() =>
        (globalThis as Main).blinklingCompanion.translatePage({ on: true }),
      ),
    ).toEqual({ ok: true });
    await expect(tab.locator("#foreign")).toContainText("EN:");
    expect(
      await app.evaluate(() =>
        (globalThis as Main).blinklingCompanion.translatePage({ on: false }),
      ),
    ).toEqual({ ok: true });
    await expect(tab.locator("#foreign")).toHaveText(original!);

    // The browser's own PDF viewer is not a page the helper can read.
    const pdf = await context.newPage();
    await pdf.goto(`${origin}/doc.pdf`).catch(() => undefined);
    await pdf.bringToFront();
    await pdf.waitForTimeout(1700);
    expect(await elements()).toBeNull();
    await pdf.close();
    await tab.bringToFront();
    await tab.waitForTimeout(1700);
    expect((await elements())?.page.title).toBe("Research notebook");
  } finally {
    await bridge?.close();
    await context?.close();
    await app?.close();
    await new Promise<void>((done) => {
      site.close(() => done());
      site.closeAllConnections();
    });
    if (previousRuntime === undefined) delete process.env.BLINKLING_RUNTIME_DIR;
    else process.env.BLINKLING_RUNTIME_DIR = previousRuntime;
    await rm(directory, { recursive: true, force: true });
  }
});
