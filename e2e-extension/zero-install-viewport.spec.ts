import { launchExtensionContext } from "./browser";
import {
  test,
  expect,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import en from "../extension/locales/en.json" with { type: "json" };

const execute = promisify(execFile);
const sizes = [
  { width: 320, height: 620 },
  { width: 420, height: 690 },
  { width: 520, height: 620 },
];

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function connectToTrial(debuggingPort: number) {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`))
            .status;
        } catch {
          return 0;
        }
      },
      { timeout: 90_000 },
    )
    .toBe(200);
  return chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
}

// Read the X11 framebuffer, including the real PiP chrome and clipping. A page
// screenshot alone would happily capture an emulated 1280x720 document.
async function nativeScreenshot(bounds: {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}) {
  const { stdout } = await execute(
    "python3",
    [
      "-c",
      `import ctypes as c, ctypes.util, struct, sys, zlib
class XImage(c.Structure):
    _fields_ = [('width', c.c_int), ('height', c.c_int), ('xoffset', c.c_int),
                ('format', c.c_int), ('data', c.c_void_p), ('byte_order', c.c_int),
                ('bitmap_unit', c.c_int), ('bitmap_bit_order', c.c_int),
                ('bitmap_pad', c.c_int), ('depth', c.c_int),
                ('bytes_per_line', c.c_int), ('bits_per_pixel', c.c_int),
                ('red_mask', c.c_ulong), ('green_mask', c.c_ulong),
                ('blue_mask', c.c_ulong)]
x = c.CDLL(ctypes.util.find_library('X11'))
x.XOpenDisplay.argtypes = [c.c_char_p]
x.XOpenDisplay.restype = c.c_void_p
x.XDefaultRootWindow.argtypes = [c.c_void_p]
x.XDefaultRootWindow.restype = c.c_ulong
x.XGetImage.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int,
                        c.c_uint, c.c_uint, c.c_ulong, c.c_int]
x.XGetImage.restype = c.POINTER(XImage)
x.XDestroyImage.argtypes = [c.POINTER(XImage)]
x.XCloseDisplay.argtypes = [c.c_void_p]
display = x.XOpenDisplay(None)
if not display: raise RuntimeError('Native screenshot needs an X11 display')
left, top, width, height = map(int, sys.argv[1:])
image = x.XGetImage(display, x.XDefaultRootWindow(display), left, top,
                    width, height, c.c_ulong(-1).value, 2)
if not image: raise RuntimeError('Could not capture native window bounds')
try:
    info = image.contents
    if info.bits_per_pixel != 32 or info.byte_order != 0 or (
        info.red_mask, info.green_mask, info.blue_mask
    ) != (0xff0000, 0xff00, 0xff):
        raise RuntimeError('Expected a 24-bit little-endian X11 framebuffer')
    pixels = c.string_at(info.data, info.bytes_per_line * height)
    rows = bytearray()
    for row in range(height):
        rows.append(0)
        start = row * info.bytes_per_line
        for column in range(width):
            offset = start + column * 4
            rows.extend((pixels[offset + 2], pixels[offset + 1], pixels[offset]))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack(
            '!I', zlib.crc32(kind + data) & 0xffffffff)
    sys.stdout.buffer.write(b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack(
        '!2I5B', width, height, 8, 2, 0, 0, 0)) + chunk(
        b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
finally:
    x.XDestroyImage(image)
    x.XCloseDisplay(display)
`,
      String(bounds.left),
      String(bounds.top),
      String(bounds.width),
      String(bounds.height),
    ],
    { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout;
}

async function checkNativeResize(panel: Page, label: string, info: TestInfo) {
  const cdp = await panel.context().newCDPSession(panel);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const measurements = [];
  try {
    await expect(panel.locator(".app.in-pip")).toBeVisible();
    await expect(panel.locator(".connection")).toHaveClass(/online/);
    await panel
      .getByRole("textbox", { name: en.question, exact: true })
      .fill("What can I do on this page?");
    for (const size of sizes) {
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { ...size, left: 40, top: 40, windowState: "normal" },
      });
      await expect
        .poll(
          async () =>
            (await cdp.send("Browser.getWindowBounds", { windowId })).bounds,
        )
        .toMatchObject(size);
      const { bounds } = await cdp.send("Browser.getWindowBounds", {
        windowId,
      });
      const dimensions = await panel.evaluate(() => ({
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      }));
      measurements.push({ size, bounds, dimensions });
      const screenshot = info.outputPath(
        `${label}-${size.width}x${size.height}-native.png`,
      );
      await writeFile(screenshot, await nativeScreenshot(bounds));
      await info.attach(`${label}-${size.width}x${size.height}-native`, {
        path: screenshot,
        contentType: "image/png",
      });
      const measurementFile = info.outputPath(`${label}-measurements.json`);
      await writeFile(measurementFile, JSON.stringify(measurements, null, 2));
      await info.attach(`${label}-measurements`, {
        path: measurementFile,
        contentType: "application/json",
      });
      // Chromium's Linux PiP has four-pixel client-side borders on each side.
      await expect
        .poll(() => panel.evaluate(() => innerWidth))
        .toBe(size.width - 8);
      expect(dimensions.outerWidth).toBe(size.width);
      expect(dimensions.outerHeight).toBe(size.height);
      expect(dimensions.innerHeight).toBeGreaterThan(size.height - 100);
      expect(dimensions.innerHeight).toBeLessThanOrEqual(size.height);
      expect(dimensions.clientWidth).toBe(dimensions.innerWidth);
      expect(dimensions.clientHeight).toBe(dimensions.innerHeight);
      for (const selector of [
        ".composer",
        ".composer textarea",
        ".send",
        ".capturebar",
      ]) {
        const element = panel.locator(selector);
        await expect(element).toBeVisible();
        const rect = await element.boundingBox();
        expect(rect, selector).not.toBeNull();
        expect(rect!.x, selector).toBeGreaterThanOrEqual(0);
        expect(rect!.y, selector).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width, selector).toBeLessThanOrEqual(
          dimensions.innerWidth,
        );
        expect(rect!.y + rect!.height, selector).toBeLessThanOrEqual(
          dimensions.innerHeight,
        );
      }
      await expect(panel.locator(".send")).toBeEnabled();
      await panel.locator(".send").click({ trial: true });
    }
  } finally {
    await cdp.detach();
  }
}

for (const mode of ["zero-install", "unpacked"] as const) {
  test(`${mode} PiP content follows native window resizing`, async ({
    browserName,
  }, info) => {
    expect(browserName).toBe("chromium");
    test.skip(
      process.platform !== "linux",
      "Native framebuffer coverage uses X11",
    );
    test.setTimeout(180_000);
    const directory = await mkdtemp(
      join(tmpdir(), "blinkling-native-viewport-"),
    );
    const client = new Client({
      name: "native-viewport-test",
      version: "1.0.0",
    });
    let driver: BrowserContext | undefined;
    let browser: Browser | undefined;
    let pluginPid: number | null = null;
    let pluginErrors = "";
    try {
      // Ship and run the plugin outside the repository with its own fresh HOME,
      // runtime and profile. No test-supplied viewport options reach its launcher.
      const plugin = join(directory, "plugin");
      await cp(resolve("bin"), join(plugin, "bin"), { recursive: true });
      await cp(resolve("package.json"), join(plugin, "package.json"));
      const debuggingPort = await freePort();
      const executable = join(directory, "chromium.cjs");
      await writeFile(
        executable,
        `#!/usr/bin/env node
const { spawn } = require('node:child_process');
const child = spawn(${JSON.stringify(chromium.executablePath())}, [
  ...process.argv.slice(2), '--remote-debugging-port=${debuggingPort}',
  '--enable-unsafe-extension-debugging', '--no-sandbox'
], { stdio: ['inherit', 'inherit', 'inherit', 3, 4] });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
`,
      );
      await chmod(executable, 0o755);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: directory,
        BLINKLING_PORT: String(await freePort()),
        BLINKLING_DISABLE_BROWSER_OPEN: "1",
        BLINKLING_RUNTIME_DIR: join(directory, "runtime"),
        BLINKLING_PROFILE_DIR: join(directory, "profile"),
        BLINKLING_CHROMIUM_PATH: executable,
      };
      delete env.SSH_CONNECTION;
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(plugin, "bin/blinkling.cjs")],
        cwd: directory,
        env: Object.fromEntries(
          Object.entries(env).filter((entry) => entry[1] !== undefined),
        ),
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk) => {
        pluginErrors = (pluginErrors + chunk.toString()).slice(-8000);
      });
      await client.connect(transport);
      pluginPid = transport.pid;
      if (!pluginPid) throw new Error("Plugin process did not start");
      const opened = await client.callTool({
        name: "panel_open",
        arguments: {},
      });
      const text = (opened.content as { text: string }[])[0].text;
      const url = /http:\/\/127\.0\.0\.1:\d+\/install#code=[A-F0-9]{16}/.exec(
        text,
      )?.[0];
      if (!url) throw new Error(`No welcome URL: ${text}`);
      const extension = join(directory, "Blinkling-extension");
      driver = await launchExtensionContext(join(directory, "driver"), {
        headless: false,
        viewport: null,
        args:
          mode === "unpacked"
            ? [
                `--disable-extensions-except=${extension}`,
                `--load-extension=${extension}`,
                "--no-sandbox",
              ]
            : ["--no-sandbox"],
      });
      let context = driver;
      let guide = driver.pages()[0];
      await guide.goto(url);
      if (mode === "zero-install") {
        await guide
          .getByRole("button", { name: "Try without installing", exact: true })
          .click();
        browser = await connectToTrial(debuggingPort);
        await driver.close();
        driver = undefined;
        context = browser.contexts()[0];
        await expect
          .poll(() =>
            context.pages().some((page) => {
              const target = new URL(page.url());
              return (
                target.origin === new URL(url).origin &&
                target.pathname === "/install"
              );
            }),
          )
          .toBe(true);
        guide = context.pages().find((page) => {
          const target = new URL(page.url());
          return (
            target.origin === new URL(url).origin &&
            target.pathname === "/install"
          );
        })!;
        const trialCode = new URLSearchParams(
          new URL(guide.url()).hash.slice(1),
        ).get("code");
        const sourceCode = new URLSearchParams(new URL(url).hash.slice(1)).get(
          "code",
        );
        expect(trialCode).toMatch(/^[A-F0-9]{16}$/);
        expect(trialCode).not.toBe(sourceCode);
      }
      await expect(guide.locator("#open-bubble")).toBeEnabled();
      const ownerOpened = context.waitForEvent("page");
      await guide
        .getByRole("button", { name: "Open the bubble", exact: true })
        .click();
      const owner = await ownerOpened;
      const pipOpened = context.waitForEvent("page");
      await owner
        .getByRole("button", { name: en.consentAccept, exact: true })
        .click();
      const panel = await pipOpened;
      await checkNativeResize(panel, mode, info);
      if (mode === "zero-install") {
        const worker = context.serviceWorkers()[0];
        const settings = await worker.evaluate(() =>
          chrome.storage.local.get(["consented", "pipSize"]),
        );
        expect(settings.consented).toBe(true);
        expect(settings.pipSize).toEqual({ width: 512, height: 582 });
        await browser!.close();
        const reopened = await client.callTool({
          name: "panel_open",
          arguments: {},
        });
        const reopenedText = (reopened.content as { text: string }[])[0].text;
        const reopenedUrl =
          /http:\/\/127\.0\.0\.1:\d+\/install#code=[A-F0-9]{16}/.exec(
            reopenedText,
          )?.[0];
        if (!reopenedUrl)
          throw new Error(`No new welcome URL: ${reopenedText}`);
        driver = await launchExtensionContext(join(directory, "driver"), {
          headless: false,
          viewport: null,
        });
        const launcherGuide = driver.pages()[0];
        await launcherGuide.goto(reopenedUrl);
        await launcherGuide
          .getByRole("button", { name: "Try without installing", exact: true })
          .click();
        browser = await connectToTrial(debuggingPort);
        context = browser.contexts()[0];
        const restoredWorker =
          context.serviceWorkers()[0] ||
          (await context.waitForEvent("serviceworker"));
        expect(
          await restoredWorker.evaluate(() =>
            chrome.storage.local.get(["consented", "pipSize"]),
          ),
        ).toEqual(settings);
      }
    } finally {
      await info.attach("plugin-stderr", {
        body: pluginErrors,
        contentType: "text/plain",
      });
      await driver?.close();
      // Closing the plugin must also stop the actual trial launcher and browser.
      await client.close();
      if (pluginPid)
        await expect
          .poll(() => {
            try {
              process.kill(pluginPid!, 0);
              return true;
            } catch {
              return false;
            }
          })
          .toBe(false);
      if (browser) await expect.poll(() => browser!.isConnected()).toBe(false);
      await rm(directory, { recursive: true, force: true });
    }
  });
}
