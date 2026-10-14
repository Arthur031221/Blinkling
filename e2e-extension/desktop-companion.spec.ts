import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type BrowserContext,
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
import { ExtensionSessions } from "../bridge/src/extension-sessions";
import {
  installGuide,
  INSTALL_GUIDE_SCRIPT,
} from "../bridge/src/extension-install";
import { launchDesktop } from "../plugin/desktop/launcher.mjs";
import { discoverDesktop } from "../plugin/desktop/client.mjs";
import type { startDesktopHost } from "../plugin/desktop/host.mjs";
import type {
  SessionEvent,
  Turn,
  Selection,
} from "../desktop/shared/contracts";

type Main = typeof globalThis & {
  blinklingCompanion: Awaited<ReturnType<typeof startDesktopHost>>;
  companionTurns: Turn[];
  companionSelection: Selection;
};
const report = "/home/levi/oss-engine/reports/glimpse-v3/build-5";

test("Electron and the optional helper share one authenticated session and stitch fixed headers once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "glimpse-companion-e2e-"));
  const runtime = join(directory, "runtime");
  const previousRuntime = process.env.BLINKLING_RUNTIME_DIR;
  process.env.BLINKLING_RUNTIME_DIR = runtime;
  let app: ElectronApplication | undefined, context: BrowserContext | undefined;
  let origin = "",
    fallbackTurns = 0;
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
      const code =
        new URL(req.url || "/", origin).searchParams.get("code") || "";
      const connected = bridge.installStatus(code);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = connected === undefined ? 401 : 200;
      res.end(
        JSON.stringify({
          connected,
          active: bridge.installConnectionActive(code),
          mode: bridge.mode,
        }),
      );
      return;
    }
    res.setHeader("Content-Type", "text/html");
    if (path === "/install") {
      res.end(installGuide("/tmp/Blinkling-extension"));
      return;
    }
    res.end(`<!doctype html><title>Companion capture proof</title><style>
      body{margin:0;font:20px sans-serif;background:#e8f4ee;color:#173d30}
      header{position:fixed;top:0;left:0;right:0;height:48px;background:rgb(240,0,160);color:white;z-index:10}
      nav{position:sticky;top:48px;margin-top:48px;height:32px;background:rgb(255,128,0)}
      main{height:2288px;padding:16px;box-sizing:border-box}
      footer{height:80px;background:rgb(0,80,220);color:white}
      </style><header>Fixed header appears once</header><nav>Sticky navigation appears once</nav>
      <main><h1>Desktop companion</h1><p>Complete page capture through Chrome.</p>
      <p style="margin-top:900px">Middle of the page</p></main><footer>Bottom of the complete page</footer>`);
  });
  const bridge = new ExtensionBridge(server, () => origin, {
    sessions: new ExtensionSessions(directory, async () => []),
    provider: async () => {
      fallbackTurns++;
      return { answer: "Unexpected fallback" };
    },
  });
  const gateway = new DesktopCompanion(() => origin, bridge);
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
    expect((await launchDesktop({ runtime })).alreadyRunning).toBe(true);
    expect(
      (await launchDesktop({ runtime, background: true })).alreadyRunning,
    ).toBe(true);
    await app.evaluate(() => {
      const main = globalThis as Main;
      main.companionTurns = [];
      const listeners = new Set<(event: SessionEvent) => void>();
      const emit = (event: SessionEvent) => {
        for (const listener of listeners) listener(event);
      };
      main.blinklingCompanion.attachSession({
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        select: async (value) => {
          main.companionSelection = value;
          return value;
        },
        stop: async () => {},
        send: async (turn) => {
          main.companionTurns.push(turn);
          emit({
            type: "message",
            id: turn.id,
            role: "user",
            content: turn.attachments,
          });
          emit({
            type: "delta",
            id: turn.id + "-reply",
            text: "One shared session.",
          });
          emit({
            type: "message",
            id: turn.id + "-reply",
            role: "assistant",
            content: [{ type: "text", text: "One shared session." }],
          });
          emit({ type: "done", turnId: turn.id });
        },
      });
    });
    expect(
      await app.evaluate(() =>
        (globalThis as Main).blinklingCompanion.fullPage(),
      ),
    ).toEqual({ companionRequired: true });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture port");
    origin = `http://127.0.0.1:${address.port}`;
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
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() =>
      chrome.storage.local.set({ consented: true, locale: "en" }),
    );
    const site = await context.newPage();
    await site.goto(origin);
    const browserCdp = await context.browser()!.newBrowserCDPSession();
    const { targetInfos } = await browserCdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const target = targetInfos.find((target) => target.url === origin + "/");
    if (!target) throw new Error("No capture tab");
    const opened = context.waitForEvent("page");
    await browserCdp.send("Extensions.triggerAction", {
      id: extensionId,
      targetId: target.targetId,
    });
    await browserCdp.detach();
    const panel = await opened;
    await panel.waitForLoadState();
    const welcome = await context.newPage();
    await welcome.goto(`${origin}/install#code=${bridge.issueCode()}`);
    await expect(welcome.locator("#connection")).toHaveClass(/connected/);
    await welcome.close();
    await expect(panel.locator(".connection")).toHaveClass(/online/);
    await expect
      .poll(async () => (await discoverDesktop())?.status.companion)
      .toBe(true);
    expect((await fetch(origin + "/desktop-companion")).status).toBe(403);
    await site.bringToFront();
    await site.evaluate(() => scrollTo(0, 320));
    const metrics = await site.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scroll: scrollY,
      headerStyle: document.querySelector("header")!.getAttribute("style"),
      navStyle: document.querySelector("nav")!.getAttribute("style"),
    }));
    const capture = await app.evaluate(() =>
      (globalThis as Main).blinklingCompanion.fullPage(),
    );
    expect("companionRequired" in capture).toBe(false);
    if ("companionRequired" in capture)
      throw new Error("Full page capture missing");
    // A long page arrives as readable tiles at full width, not one squeezed image.
    expect(capture.tiles.length).toBeGreaterThan(1);
    expect(capture.truncated).toBe(false);
    for (const tile of capture.tiles)
      expect(tile.pixelWidth).toBe(metrics.width);
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
                image.data[
                  (y * image.width + image.width - 40) * 4 + channel
                ] === value,
            )
          )
            rows++;
      return rows;
    };
    expect(colorRows([240, 0, 160])).toBe(48);
    expect(colorRows([255, 128, 0])).toBe(32);
    expect(colorRows([0, 80, 220])).toBe(80);
    expect(await site.evaluate(() => scrollY)).toBe(metrics.scroll);
    expect(
      await site
        .locator("header")
        .evaluate((element) => element.getAttribute("style")),
    ).toBe(metrics.headerStyle);
    expect(
      await site
        .locator("nav")
        .evaluate((element) => element.getAttribute("style")),
    ).toBe(metrics.navStyle);
    await panel
      .getByRole("textbox")
      .fill("Confirm the shared desktop session.");
    await panel.getByRole("textbox").press("Enter");
    await expect(panel.locator(".message .answer").last()).toContainText(
      "One shared session.",
    );
    expect(
      await app.evaluate(
        () =>
          (globalThis as Main).companionTurns.filter((turn) =>
            turn.text.includes("Confirm the shared desktop session."),
          ).length,
      ),
    ).toBe(1);
    expect(
      await app.evaluate(() =>
        (globalThis as Main).companionTurns.every(
          (turn) => turn.source === "companion",
        ),
      ),
    ).toBe(true);
    expect(fallbackTurns).toBe(0);
    const desktop = await discoverDesktop();
    if (!desktop) throw new Error("Desktop disconnected");
    const id = crypto.randomUUID();
    await desktop.client.rpc("send", {
      turn: {
        id,
        source: "companion",
        text: "Screenshot test",
        attachments: [capture.image],
      },
    });
    expect(
      await app.evaluate(
        () => (globalThis as Main).companionTurns.at(-1)?.attachments[0]?.data,
      ),
    ).toBe(capture.image.data);
    // The second tile overlaps almost all of the first. It must not erase the
    // first tile's fixed header when that header is hidden for subsequent tiles.
    const overlapHeight = await site.evaluate(() => {
      const main = document.querySelector("main")!;
      main.style.height = `${document.documentElement.clientHeight - 160 + 8}px`;
      main.style.overflow = "hidden";
      scrollTo(0, 0);
      return document.documentElement.clientHeight + 8;
    });
    const overlapCapture = await app.evaluate(() =>
      (globalThis as Main).blinklingCompanion.fullPage(),
    );
    if ("companionRequired" in overlapCapture)
      throw new Error("Overlapping full page capture missing");
    expect(overlapCapture.pixelHeight).toBe(overlapHeight);
    const overlapPng = PNG.sync.read(
      Buffer.from(overlapCapture.image.data, "base64"),
    );
    expect(colorRows([240, 0, 160], overlapPng)).toBe(48);
    expect(colorRows([255, 128, 0], overlapPng)).toBe(32);
    expect(colorRows([0, 80, 220], overlapPng)).toBe(80);
    expect(await site.evaluate(() => scrollY)).toBe(0);
    expect(await site.locator("header").getAttribute("style")).toBe(null);
    expect(await site.locator("nav").getAttribute("style")).toBe(null);
    await mkdir(report, { recursive: true });
    const suffix =
      (process.env.BLINKLING_TEST_EXECUTABLE ? "packaged-" : "") +
      (process.env.BLINKLING_COMPANION_COMPOSITOR === "1"
        ? "composited"
        : "regression");
    await writeFile(
      join(report, `full-page-${suffix}.png`),
      Buffer.from(capture.image.data, "base64"),
    );
    await writeFile(
      join(report, `full-page-overlap-${suffix}.png`),
      Buffer.from(overlapCapture.image.data, "base64"),
    );
    await panel.screenshot({
      path: join(report, `companion-panel-${suffix}.png`),
    });
    const screen = await app.evaluate(async ({ desktopCapturer }) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 800 },
      });
      return sources[0].thumbnail.toPNG().toString("base64");
    });
    await writeFile(
      join(report, `desktop-${suffix}.png`),
      Buffer.from(screen, "base64"),
    );
  } finally {
    gateway.close();
    await bridge.close();
    await context?.close();
    await app?.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    if (previousRuntime === undefined) delete process.env.BLINKLING_RUNTIME_DIR;
    else process.env.BLINKLING_RUNTIME_DIR = previousRuntime;
    await rm(directory, { recursive: true, force: true });
  }
});
