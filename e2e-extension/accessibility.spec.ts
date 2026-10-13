import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";

let server: Server;
let context: BrowserContext;
let site: Page;
let directory: string;
let cropBundle: string;

test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: await readFile(resolve("extension/crop-selection.ts"), "utf8"),
      resolveDir: resolve("extension"),
      sourcefile: "crop-selection.ts",
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "GlimpseletCrop",
    write: false,
  });
  cropBundle = bundle.outputFiles[0].text;
});

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-accessibility-e2e-"));
  server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<main><h1>Public test page</h1><p>Crop selection fixture.</p></main>",
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const origin = `http://127.0.0.1:${address.port}`;
  const extension = resolve("dist-extension");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
      "--enable-unsafe-extension-debugging",
      "--window-position=0,0",
      "--window-size=1100,780",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ consented: true, locale: "en" }),
  );
  site = await context.newPage();
  await site.goto(origin);
  site.setDefaultTimeout(10000);
});

test.afterEach(async () => {
  await context?.close();
  await new Promise<void>((resolveClose) =>
    server?.close(() => resolveClose()),
  );
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("Enter cancels a crop while Cancel is focused", async () => {
  await site.addScriptTag({ content: cropBundle });
  await site.evaluate(() => {
    const host = document.createElement("div");
    host.dataset.glimpseletCrop = "";
    document.body.append(host);
    const api = (
      window as Window & {
        GlimpseletCrop: {
          selectCrop: (...args: unknown[]) => Promise<unknown>;
        };
      }
    ).GlimpseletCrop;
    void api
      .selectCrop(host, () => new DOMRect(0, 0, 800, 600), {
        cropTitle: "Crop",
        cropHint: "Drag to select. Enter to confirm. Esc to cancel.",
        cropConfirm: "Confirm",
        cropCancel: "Cancel",
      })
      .then((result) => {
        (window as Window & { cropResult?: unknown }).cropResult = result;
      });
  });
  const crop = site.locator("[data-glimpselet-crop]");
  await expect(crop).toHaveCount(1);
  await site.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      crop.evaluate((host) => host.shadowRoot?.activeElement?.textContent),
    )
    .toBe("Confirm");
  await site.keyboard.press("Tab");
  await expect
    .poll(() =>
      crop.evaluate((host) => host.shadowRoot?.activeElement?.textContent),
    )
    .toBe("Cancel");
  await site.keyboard.press("Enter");
  await expect(crop).toHaveCount(0);
  await expect
    .poll(() =>
      site.evaluate(
        () => (window as Window & { cropResult?: unknown }).cropResult,
      ),
    )
    .toBeNull();
});

test("Enter still confirms a crop from a selection handle", async () => {
  await site.addScriptTag({ content: cropBundle });
  await site.evaluate(() => {
    const host = document.createElement("div");
    host.dataset.glimpseletCrop = "";
    document.body.append(host);
    const api = (
      window as Window & {
        GlimpseletCrop: {
          selectCrop: (...args: unknown[]) => Promise<unknown>;
        };
      }
    ).GlimpseletCrop;
    void api
      .selectCrop(host, () => new DOMRect(0, 0, 800, 600), {
        cropTitle: "Crop",
        cropHint: "Drag to select. Enter to confirm. Esc to cancel.",
        cropConfirm: "Confirm",
        cropCancel: "Cancel",
      })
      .then((result) => {
        (window as Window & { cropResult?: { width: number } }).cropResult =
          result as { width: number };
      });
  });
  const crop = site.locator("[data-glimpselet-crop]");
  await site.keyboard.press("ArrowRight");
  await crop.locator("[data-handle='nw']").focus();
  await site.keyboard.press("Enter");
  await expect(crop).toHaveCount(0);
  await expect
    .poll(() =>
      site.evaluate(
        () =>
          (window as Window & { cropResult?: { width: number } }).cropResult
            ?.width,
      ),
    )
    .toBe(400);
});

test("composer focus is visible and reduced motion disables extension animation", async () => {
  await site.emulateMedia({ reducedMotion: "reduce" });
  await site.addStyleTag({ path: resolve("extension/style.css") });
  await site.evaluate(() => {
    document.body.innerHTML =
      '<main class="app"><section class="composer"><form><textarea aria-label="Message"></textarea></form></section></main>';
  });
  const textarea = site.locator(".composer textarea");
  await textarea.focus();
  const focusStyle = await site.locator(".composer form").evaluate((form) => {
    const style = getComputedStyle(form);
    return { borderColor: style.borderTopColor, shadow: style.boxShadow };
  });
  expect(focusStyle.shadow).not.toBe("none");
  const motionStyle = await site.evaluate(() => {
    const busy = document.createElement("span");
    busy.className = "dot busy";
    document.body.append(busy);
    return getComputedStyle(busy).animationDuration;
  });
  expect(motionStyle).toBe("1e-05s");
});

test("locale action labels preserve their intended meanings", async () => {
  const localeFiles = [
    "de",
    "en",
    "es",
    "fr",
    "ja",
    "ko",
    "pt-BR",
    "zh-CN",
    "zh-TW",
  ];
  for (const locale of localeFiles) {
    const labels = JSON.parse(
      await readFile(resolve(`extension/locales/${locale}.json`), "utf8"),
    );
    expect(labels.resume, `${locale} resume`).not.toBe(labels.pause);
    expect(labels.newThread, `${locale} newThread`).not.toBe(
      labels.dedicatedThread,
    );
    expect(labels.guideAction, `${locale} guideAction`).not.toBe(
      labels.pageNote,
    );
  }
  const english = JSON.parse(
    await readFile(resolve("extension/locales/en.json"), "utf8"),
  );
  expect(english.newThread).toBe("New session");
  expect(english.guideAction).toBe("Guide this page");
  expect(english.dedicatedThread).toBe("Dedicated conversation");
  expect(english.pageNote).toBe("Passive mode");
});
