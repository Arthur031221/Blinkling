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
import { ExtensionBridge } from "../bridge/src/extension-bridge";
import { DesktopCompanion } from "../bridge/src/desktop-companion";
import {
  installGuide,
  INSTALL_GUIDE_SCRIPT,
} from "../bridge/src/extension-install";
import { launchDesktop } from "../plugin/desktop/launcher.mjs";
import { discoverDesktop } from "../plugin/desktop/client.mjs";
import type { startDesktopHost } from "../plugin/desktop/host.mjs";

type Host = Awaited<ReturnType<typeof startDesktopHost>>;
type Main = typeof globalThis & { blinklingCompanion: Host };
const report = "/home/levi/oss-engine/reports/glimpse-v3/fix-2-11";

const PAGE = `<!doctype html><title>Companion proof</title><style>
  body{margin:0;font:20px sans-serif;background:#e8f4ee;color:#173d30}
  header{position:fixed;top:0;left:0;right:0;height:48px;background:rgb(240,0,160);color:white;z-index:10}
  nav{position:sticky;top:48px;margin-top:48px;height:32px;background:rgb(255,128,0)}
  main{height:2288px;padding:16px;box-sizing:border-box}
  footer{height:80px;background:rgb(0,80,220);color:white}
  </style><header>Fixed header appears once</header><nav>Sticky navigation appears once</nav>
  <main><h1>Desktop companion</h1><p>Complete page capture through Chrome.</p>
  <form onsubmit="return false"><label for="user">Email</label> <input id="user" type="text">
  <label for="secret">Password</label> <input id="secret" type="password" value="hunter2-secret">
  <button id="go">Sign in</button></form>
  <p style="margin-top:900px">Middle of the page</p></main><footer>Bottom of the complete page</footer>`;

let directory = "",
  origin = "",
  wakes = 0;
let app: ElectronApplication, context: BrowserContext, site: Page;
let bridge: ExtensionBridge, gateway: DesktopCompanion;
let extensionId = "";
const server = createServer((req, res) => {
  const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (path === "/desktop-companion") {
    void gateway.handle(req, res).catch(() => {
      res.writeHead(400);
      res.end();
    });
    return;
  }
  if (path === "/install-guide.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(INSTALL_GUIDE_SCRIPT);
    return;
  }
  if (path === "/install/status") {
    const code = new URL(req.url || "/", origin).searchParams.get("code") || "";
    const connected = bridge.installStatus(code);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = connected === undefined ? 401 : 200;
    res.end(
      JSON.stringify({
        connected,
        active: bridge.installConnectionActive(code),
      }),
    );
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    path === "/install"
      ? installGuide("/tmp/Blinkling-extension")
      : path === "/plain"
        ? PAGE.replace(/<form[\s\S]*<\/form>/, "")
        : PAGE,
  );
});

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "blinkling-companion-e2e-"));
  const runtime = join(directory, "runtime");
  process.env.BLINKLING_RUNTIME_DIR = runtime;
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
  expect((await launchDesktop({ runtime })).alreadyRunning).toBe(true);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  bridge = new ExtensionBridge(server, () => origin, {
    wake: async () => {
      wakes++;
      return true;
    },
  });
  gateway = new DesktopCompanion(() => origin, bridge);
  gateway.start();
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
  extensionId = new URL(worker.url()).host;
  site = await context.newPage();
  await site.goto(origin);
});

test.afterAll(async () => {
  gateway?.close();
  await bridge?.close();
  await context?.close();
  await app?.close();
  await new Promise<void>((done) => {
    server.close(() => done());
    server.closeAllConnections();
  });
  delete process.env.BLINKLING_RUNTIME_DIR;
  await rm(directory, { recursive: true, force: true });
});

/** The user's one-time "Allow all sites" is a native prompt; a click on the
 * toolbar button grants the same access to this tab, which is enough here. */
async function allowTab(page: Page) {
  const cdp = await context.browser()!.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const target = targetInfos.find((t) => t.url === page.url());
    if (!target) throw new Error("No tab to allow");
    await cdp.send("Extensions.triggerAction", {
      id: extensionId,
      targetId: target.targetId,
    });
  } finally {
    await cdp.detach();
  }
}
const fullPage = () =>
  app.evaluate(() => (globalThis as Main).blinklingCompanion.fullPage());
const elements = (point?: { x: number; y: number }) =>
  app.evaluate(
    (_, p) => (globalThis as Main).blinklingCompanion.elements({ point: p }),
    point,
  );

test("without the helper connected, Blink is told so", async () => {
  expect(await fullPage()).toEqual({ companionRequired: true });
  expect(await elements()).toBeNull();
});

test("the helper pairs on its own from the install page, and the popup says so", async () => {
  const welcome = await context.newPage();
  await welcome.goto(`${origin}/install#code=${bridge.issueCode()}`);
  await expect(welcome.locator("#connection")).toHaveClass(/connected/);
  await welcome.close();
  await expect
    .poll(async () => (await discoverDesktop())?.status.companion)
    .toBe(true);
  expect((await fetch(origin + "/desktop-companion")).status).toBe(403);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 420 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('[data-row="link"]')).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(popup.locator('[data-row="blink"]')).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(popup.locator("h1 .sparkle-name")).toHaveCount(1);
  await mkdir(report, { recursive: true });
  await popup.screenshot({ path: join(report, "popup-connected.png") });

  await popup.getByRole("button", { name: "Wake Blink" }).click();
  await expect(popup.locator("#note")).toHaveText(/awake/i);
  expect(wakes).toBe(1);
  await popup.close();
});

test("host.elements returns the page structure, and a password field is secure with no text", async () => {
  await site.bringToFront();
  const result = await elements({ x: 500, y: 400 });
  if (!result) throw new Error("No page structure");
  expect(result.page.url).toBe(origin + "/");
  expect(result.page.title).toBe("Companion proof");
  expect(result.page.incognito).toBe(false);
  expect(result.frame.devicePixelRatio).toBeGreaterThan(0);
  const secret = result.elements.find((e) => e.kind === "input" && e.secure);
  expect(secret, "the password field is reported").toBeDefined();
  expect(secret!.text).toBe("");
  expect(secret!.content).toBeUndefined();
  expect(secret!.name).toBe("");
  expect(JSON.stringify(result)).not.toContain("hunter2-secret");
  const email = result.elements.find((e) => e.kind === "input" && !e.secure);
  expect(email?.name).toBe("Email");
  const heading = result.elements.find((e) => e.kind === "heading");
  expect(heading?.text).toBe("Desktop companion");
  const button = result.elements.find((e) => e.kind === "button");
  expect(button?.name || button?.text).toBe("Sign in");
  for (const e of result.elements) {
    expect(e.rect.width).toBeGreaterThanOrEqual(0);
    expect(e.id).toBeTruthy();
  }
});

test("a full page arrives as tiles at full width with fixed headers once", async () => {
  // A page with a password field is never captured.
  await allowTab(site);
  expect("tiles" in (await fullPage())).toBe(false);
  await site.goto(`${origin}/plain`);
  await site.bringToFront();
  await allowTab(site);
  await site.evaluate(() => scrollTo(0, 320));
  const metrics = await site.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    scroll: scrollY,
    headerStyle: document.querySelector("header")!.getAttribute("style"),
    navStyle: document.querySelector("nav")!.getAttribute("style"),
  }));
  const capture = await fullPage();
  if ("companionRequired" in capture)
    throw new Error("No full page capture " + JSON.stringify(capture));
  expect(capture.tiles.length).toBeGreaterThan(1);
  expect(capture.truncated).toBe(false);
  for (const tile of capture.tiles) expect(tile.pixelWidth).toBe(metrics.width);
  expect(
    capture.tiles.reduce((total, tile) => total + tile.pixelHeight, 0),
  ).toBe(metrics.height);
  const pngs = capture.tiles.map((tile) =>
    PNG.sync.read(Buffer.from(tile.image.data, "base64")),
  );
  const colorRows = (color: number[]) => {
    let rows = 0;
    for (const image of pngs)
      for (let y = 0; y < image.height; y++)
        if (
          color.every(
            (value, channel) =>
              image.data[(y * image.width + image.width - 40) * 4 + channel] ===
              value,
          )
        )
          rows++;
    return rows;
  };
  expect(colorRows([240, 0, 160])).toBe(48);
  expect(colorRows([255, 128, 0])).toBe(32);
  expect(colorRows([0, 80, 220])).toBe(80);
  expect(await site.evaluate(() => scrollY)).toBe(metrics.scroll);
  expect(await site.locator("header").getAttribute("style")).toBe(
    metrics.headerStyle,
  );
  expect(await site.locator("nav").getAttribute("style")).toBe(
    metrics.navStyle,
  );
  await writeFile(
    join(report, "full-page.png"),
    Buffer.from(capture.image.data, "base64"),
  );
});

test("translate in place toggles back to the original text", async () => {
  await site.bringToFront();
  const original = await site.locator("h1").innerText();
  const result = await app.evaluate(() =>
    (globalThis as Main).blinklingCompanion.translatePage({ on: false }),
  );
  expect(result.ok).toBe(true);
  expect(await site.locator("h1").innerText()).toBe(original);
});
