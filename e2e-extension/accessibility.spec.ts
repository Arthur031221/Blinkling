import { launchExtensionContext } from "./browser";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import zhTW from "../extension/locales/zh-TW.json" with { type: "json" };

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
  context = await launchExtensionContext(join(directory, "profile"), {
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
    expect(labels.autoExplain, `${locale} autoExplain`).toBeTruthy();
    expect(labels.wholeScreen, `${locale} wholeScreen`).toBeTruthy();
    expect(labels.autoExplain).not.toBe(labels.wholeScreen);
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
  expect(english.pageNote).toBe("Auto explain");
});

// Document PiP owns a separate target: opener media emulation does not reach it.
async function withFloatingTarget<T>(
  panel: Page,
  run: (
    send: (
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
  ) => Promise<T>,
): Promise<T> {
  const cdp = await context.browser()!.newBrowserCDPSession();
  const openerCdp = await context.newCDPSession(panel);
  const { targetInfo: opener } = await openerCdp.send("Target.getTargetInfo");
  await openerCdp.detach();
  const { targetInfos } = await cdp.send("Target.getTargets");
  const target = targetInfos.find(
    (candidate) =>
      candidate.type === "page" &&
      candidate.openerId === opener.targetId &&
      candidate.url === "about:blank",
  );
  if (!target) throw new Error("Native floating target not found");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  try {
    let nextId = 0;
    return await run(async (method, params = {}) => {
      const id = ++nextId;
      const response = new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Floating target command timed out")),
            10000,
          );
          cdp.on("Target.receivedMessageFromTarget", (event) => {
            if (event.sessionId !== sessionId) return;
            const message = JSON.parse(event.message);
            if (message.id !== id) return;
            clearTimeout(timer);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else resolve(message.result);
          });
        },
      );
      await cdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      });
      return await response;
    });
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId });
    await cdp.detach();
  }
}

for (const width of [320, 520]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Traditional Chinese bubble controls fit ${width}px in ${colorScheme} mode`, async () => {
      const worker = context.serviceWorkers()[0];
      await worker.evaluate(() =>
        chrome.storage.local.set({ consented: true, locale: "zh-TW" }),
      );
      const extensionId = new URL(worker.url()).host;
      const panel = await context.newPage();
      await panel.setViewportSize({ width, height: 780 });
      await panel.emulateMedia({ colorScheme });
      await panel.goto(`chrome-extension://${extensionId}/panel.html`);
      await panel
        .getByRole("button", { name: zhTW.settings, exact: true })
        .click();
      const dialog = panel.getByRole("dialog", { name: zhTW.settings });
      await expect(dialog.getByLabel(zhTW.backend)).toHaveValue("bridge");
      await expect(dialog.getByLabel(zhTW.backend)).toContainText(
        "Claude Code",
      );
      await expect(dialog.getByLabel(zhTW.effort)).not.toContainText("MEDIUM");
      await expect(dialog.locator(".usage-hint")).toContainText("Glimpselet");
      await panel.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(panel.locator(".usage-hint")).toHaveCount(0);
      const bounds = await panel
        .locator(".composer-modes")
        .evaluate((container) => {
          const bounds = container.getBoundingClientRect();
          return [...container.children].map((child) => {
            const rect = child.getBoundingClientRect();
            return {
              left: rect.left >= bounds.left,
              right: rect.right <= bounds.right + 1,
            };
          });
        });
      expect(bounds.every((bound) => bound.left && bound.right)).toBe(true);
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const input = panel.getByRole("textbox", { name: zhTW.question });
      await input.focus();
      await input.fill("這個頁面有什麼？");
      await panel.keyboard.press("Tab");
      await expect(
        panel.getByRole("button", { name: `${zhTW.send} ↗`, exact: true }),
      ).toBeFocused();
      await panel
        .getByRole("button", { name: zhTW.float, exact: true })
        .first()
        .click();
      await expect
        .poll(() =>
          panel.evaluate(() =>
            Boolean(
              window.documentPictureInPicture.window?.document.querySelector(
                ".app.in-pip",
              ),
            ),
          ),
        )
        .toBe(true);
      await panel.evaluate((width) => {
        const floating = window.documentPictureInPicture.window!;
        floating.resizeTo(
          width + floating.outerWidth - floating.innerWidth,
          600 + floating.outerHeight - floating.innerHeight,
        );
      }, width);
      await expect
        .poll(() =>
          panel.evaluate(
            () => window.documentPictureInPicture.window!.innerWidth,
          ),
        )
        .toBe(width);
      await withFloatingTarget(panel, async (send) => {
        await send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-color-scheme", value: colorScheme }],
        });
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                window.documentPictureInPicture.window!.matchMedia(
                  "(prefers-color-scheme: dark)",
                ).matches,
            ),
          )
          .toBe(colorScheme === "dark");
        const floating = await panel.evaluate(() => {
          const window = globalThis.window.documentPictureInPicture.window!;
          const document = window.document;
          const composer = document.querySelector(".composer-modes")!;
          const bounds = composer.getBoundingClientRect();
          return {
            dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            labels: [...document.querySelectorAll("button")].map(
              (button) =>
                button.getAttribute("aria-label") || button.textContent?.trim(),
            ),
            modesFit: [...composer.children].every((child) => {
              const rect = child.getBoundingClientRect();
              return rect.left >= bounds.left && rect.right <= bounds.right + 1;
            }),
            usage: document.querySelector(".usage-hint")?.textContent,
          };
        });
        expect(floating.dark).toBe(colorScheme === "dark");
        expect(floating.overflow).toBe(false);
        expect(floating.modesFit).toBe(true);
        expect(floating.labels).toContain(zhTW.settings);
        expect(floating.labels).toContain(zhTW.returnToTab);
        expect(floating.labels).not.toContain(zhTW.float);
        expect(floating.usage).toBeUndefined();
        await panel.evaluate(() => {
          const floating = window.documentPictureInPicture.window!;
          floating.focus();
          floating.document
            .querySelector<HTMLTextAreaElement>("textarea")!
            .focus();
        });
        const tab = {
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
          nativeVirtualKeyCode: 9,
        };
        await send("Input.dispatchKeyEvent", { ...tab, type: "keyDown" });
        await send("Input.dispatchKeyEvent", { ...tab, type: "keyUp" });
        await expect
          .poll(() =>
            panel.evaluate(() => {
              const document = window.documentPictureInPicture.window!.document;
              return document.activeElement === document.querySelector(".send");
            }),
          )
          .toBe(true);
        const screenshot = await send("Page.captureScreenshot", {
          format: "png",
        });
        await writeFile(
          test.info().outputPath("native-bubble.png"),
          Buffer.from(String(screenshot.data), "base64"),
        );
      });
    });
  }
}
