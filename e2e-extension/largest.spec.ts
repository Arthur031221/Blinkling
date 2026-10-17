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
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { launchExtensionContext } from "./browser";
import { HelperServer } from "../bridge/src/helper-server";
import { discoverDesktop } from "../plugin/desktop/client.mjs";
import type { startDesktopHost } from "../plugin/desktop/host.mjs";

type Main = typeof globalThis & {
  blinklingCompanion: Awaited<ReturnType<typeof startDesktopHost>>;
};

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

test("the menu screenshot over a paired browser gives one full page chip", async () => {
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
    if (!context.serviceWorkers()[0])
      await context.waitForEvent("serviceworker");

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

    const tab: Page = await context.newPage();
    await tab.goto(origin + "/long");
    await tab.bringToFront();
    await tab.waitForTimeout(1700);
    // The menu's screenshot over a paired browser: one full page capture, with no
    // note about the visible part.
    const out = await app.evaluate(async () => {
      type Taken = { kind: string; notice?: string };
      const t = (
        globalThis as unknown as {
          blinklingTest: {
            snapshot(): { display: { id: string } };
            features: {
              capture: {
                onCapture: (taken: Taken) => void;
                largest(
                  id: string,
                  signal: undefined,
                  options: { source: string },
                ): Promise<unknown>;
              };
            };
          };
        }
      ).blinklingTest;
      const c = t.features.capture;
      const got: Taken[] = [];
      c.onCapture = (x) => got.push(x);
      await c.largest(t.snapshot().display.id, undefined, {
        source: "capture",
      });
      return got.map(({ kind, notice }) => ({ kind, notice }));
    });
    expect(out[0].notice).toBeUndefined();
    expect(out[0].kind).toBe("page");
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
