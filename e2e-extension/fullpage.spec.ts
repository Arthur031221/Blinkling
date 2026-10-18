import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { launchExtensionContext } from "./browser";
import { HelperServer } from "../bridge/src/helper-server";
import { discoverDesktop } from "../plugin/desktop/client.mjs";
// @ts-expect-error plain modules of the desktop suites
import { launch, move, click } from "../desktop/main/acceptance/support.mjs";
// @ts-expect-error plain modules of the desktop suites
import { reveal, bubble } from "../desktop/main/acceptance/helpers.mjs";
// @ts-expect-error plain modules of the desktop suites
import { record } from "../desktop/main/acceptance/record.mjs";

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Research notebook</title><style>
  body{margin:0;font:20px sans-serif;background:#e8f4ee;color:#173d30}
  header{position:fixed;top:0;left:0;right:0;height:48px;background:rgb(240,0,160);color:white;z-index:10}
  main{height:2400px;padding:64px 16px 16px;box-sizing:border-box}
  footer{height:120px;background:rgb(0,80,220);color:white}
  </style><header>Fixed header</header>
  <main><h1>Research notebook</h1><p style="margin-top:1500px">Middle of the page</p></main>
  <footer>Bottom of the complete page</footer>`;

/** The release extension paired with Blink: the full page bubble scrolls the
 * page, lands one page chip in the card, and the tiles that go out include the
 * part below the fold. */
test("with the extension paired the full page bubble captures the whole page into one chip", async () => {
  test.setTimeout(240000);
  const directory = await mkdtemp(join(tmpdir(), "blinkling-fullpage-e2e-"));
  const runtime = join(directory, "runtime");
  const previousRuntime = process.env.BLINKLING_RUNTIME_DIR;
  process.env.BLINKLING_RUNTIME_DIR = runtime;
  let context: BrowserContext | undefined;
  let bridge: HelperServer | undefined;
  const site = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(PAGE);
  });
  const { app, page } = await launch({
    env: { BLINKLING_RUNTIME_DIR: runtime },
  });
  // The walk recording is only made where a report directory is asked for.
  const rec = process.env.BLINKLING_R3_DIR
    ? record("fullpage_extension", { suffix: "-324", fps: 4 })
    : { frame: () => {}, stop: async () => {} };
  try {
    await expect.poll(async () => !!(await discoverDesktop())).toBe(true);
    bridge = await new HelperServer({
      panelDir: resolve("bin/panel"),
      provider: async () => ({ answer: "[]" }),
    }).start();
    site.listen(0, "localhost");
    await once(site, "listening");
    const address = site.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const extension = resolve("dist-extension");
    context = await launchExtensionContext(join(directory, "profile"), {
      headless: false,
      viewport: null,
      args: [
        `--load-extension=${extension}`,
        `--disable-extensions-except=${extension}`,
        "--no-sandbox",
        "--enable-unsafe-extension-debugging",
        "--disable-backgrounding-occluded-windows",
        "--disable-features=CalculateNativeWinOcclusion",
        "--window-size=1000,700",
        "--window-position=0,0",
      ],
    });
    if (!context.serviceWorkers()[0])
      await context.waitForEvent("serviceworker");
    const setup = await context.newPage();
    await setup.goto(
      `${bridge.origin}/install#code=${bridge.trust.issueCode()}`,
    );
    await expect.poll(() => bridge!.helperConnected).toBe(true);
    await setup.close();
    const status = async () => (await discoverDesktop())?.status;
    await expect.poll(async () => (await status())?.companion).toBe(true);
    console.log(
      `fullpage_extension /status companion=${(await status())?.companion}`,
    );

    const tab: Page = await context.newPage();
    await tab.goto(`http://localhost:${address.port}/`);
    await tab.bringToFront();
    await tab.waitForTimeout(1700);
    console.log(
      "WINDOWS\n" +
        execFileSync("xwininfo", ["-root", "-children"])
          .toString()
          .split("\n")
          .filter((l) => /\d+x\d+\+/.test(l))
          .slice(0, 14)
          .join("\n"),
    );

    // A session that keeps what is sent, so the tiles can be read back.
    await app.evaluate(() => {
      const g = globalThis as unknown as {
        sent: unknown[];
        blinklingTest: { features: { setSession(session: unknown): void } };
      };
      g.sent = [];
      g.blinklingTest.features.setSession({
        subscribe: () => () => {},
        send: async (turn: unknown) => {
          g.sent.push(turn);
        },
        stop: async () => {},
      });
    });
    await page.waitForTimeout(800);
    await reveal(page);
    rec.frame("menu-over-browser");
    const cardPage = () =>
      app.windows().find((p) => p.url().includes("surface=card"));
    const press = async () => {
      const box = await bubble(page, "capture").boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      move(x, y);
      await page.waitForTimeout(300);
      click(x, y);
    };
    await press();
    await expect.poll(() => !!cardPage(), { timeout: 30000 }).toBe(true);
    const card = cardPage()!;
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1, {
      timeout: 30000,
    });
    const chip = await card.locator(".gl-attachment-name").textContent();
    console.log(`fullpage_extension chip="${chip}"`);
    expect(chip).toMatch(/整頁|full page|\d/i);
    expect(
      await card.locator("body").innerText(),
      "never the visible-part note",
    ).not.toMatch(/browser extension|瀏覽器擴充/i);
    await page.waitForTimeout(800);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "x11grab",
      "-i",
      process.env.DISPLAY!,
      "-frames:v",
      "1",
      "/tmp/fx-one.png",
    ]);
    rec.frame("one-chip");
    // A second press is a second capture: one more page chip, each whole.
    await tab.bringToFront();
    await page.evaluate(
      () =>
        void (
          window as unknown as {
            blinkling: { action(name: string): unknown };
          }
        ).blinkling.action("capture"),
    );
    await page.waitForTimeout(6000);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(2);
    for (const name of await card
      .locator(".gl-attachment-name")
      .allTextContents())
      expect(name).toMatch(/整頁|full page/i);
    rec.frame("second-press");

    await card.locator(".gl-quick-chip").first().click();
    await expect(card.locator(".gl-user .gl-message-image")).toHaveCount(4, {
      timeout: 20000,
    });
    const sources = await card
      .locator(".gl-user .gl-message-image")
      .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src));
    const tiles = sources.map((src) => ({
      data: src.startsWith("data:") ? src.split(",")[1] : "",
    }));
    console.log(
      `fullpage_extension sources=${sources.map((x) => x.slice(0, 30))}`,
    );
    let blue = 0,
      pink = 0,
      tall = 0;
    for (const tile of tiles) {
      const png = PNG.sync.read(Buffer.from(tile.data, "base64"));
      tall += png.height;
      for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
        if (Math.abs(r) < 12 && Math.abs(g - 80) < 12 && Math.abs(b - 220) < 12)
          blue++;
        if (Math.abs(r - 240) < 12 && g < 12 && Math.abs(b - 160) < 12) pink++;
      }
    }
    console.log(
      `fullpage_extension tiles=${tiles.length} height=${tall} footerPixels=${blue} headerPixels=${pink}`,
    );
    expect(blue, "the footer below the fold is in the tiles").toBeGreaterThan(
      1000,
    );
    expect(tall, "taller than the window").toBeGreaterThan(1500);
    rec.frame("sent");
  } finally {
    await rec.stop();
    await bridge?.close();
    await context?.close();
    await app.close();
    await new Promise<void>((done) => {
      site.close(() => done());
      site.closeAllConnections();
    });
    if (previousRuntime === undefined) delete process.env.BLINKLING_RUNTIME_DIR;
    else process.env.BLINKLING_RUNTIME_DIR = previousRuntime;
    await rm(directory, { recursive: true, force: true });
  }
});
