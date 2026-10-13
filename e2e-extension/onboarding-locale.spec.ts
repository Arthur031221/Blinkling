import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchExtensionContext } from "./browser";
import { ExtensionBridge } from "../bridge/src/extension-bridge";
import { ExtensionSessions } from "../bridge/src/extension-sessions";
import {
  installGuide,
  INSTALL_GUIDE_SCRIPT,
} from "../bridge/src/extension-install";
import { runCliProvider } from "../bridge/src/provider-cli";
import en from "../extension/locales/en.json" with { type: "json" };
import zh from "../extension/locales/zh-TW.json" with { type: "json" };
import ja from "../extension/locales/ja.json" with { type: "json" };

let server: Server,
  bridge: ExtensionBridge,
  context: BrowserContext,
  worker: Worker;
let directory: string, origin: string, welcome: Page, code: string;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-onboarding-locale-"));
  server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
    if (url.pathname === "/install/status") {
      const connected = bridge.installStatus(
        url.searchParams.get("code") || "",
      );
      response.setHeader("Content-Type", "application/json");
      response.statusCode = connected === undefined ? 401 : 200;
      response.end(JSON.stringify({ connected, mode: "direct" }));
    } else if (url.pathname === "/install") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(installGuide("/tmp/glimpselet-extension"));
    } else if (url.pathname === "/install-guide.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(INSTALL_GUIDE_SCRIPT);
    } else if (url.pathname.startsWith("/assets/")) {
      response.setHeader(
        "Content-Type",
        url.pathname.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : "text/html; charset=utf-8",
      );
      void readFile(resolve(`public${url.pathname}`)).then(
        (data) => response.end(data),
        () => {
          response.statusCode = 404;
          response.end();
        },
      );
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  bridge = new ExtensionBridge(server, () => origin, {
    provider: (request) =>
      runCliProvider(request, {
        command: process.execPath,
        argsPrefix: [resolve("e2e-extension/mock-claude.cjs")],
      }),
    sessions: new ExtensionSessions(directory, async () => []),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  origin = `http://127.0.0.1:${address.port}`;
  code = bridge.issueCode();
  const extension = resolve("dist-extension");
  context = await launchExtensionContext(join(directory, "profile"), {
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
      "--enable-unsafe-extension-debugging",
      "--enable-features=DocumentPictureInPictureAPI",
      "--window-size=1100,780",
    ],
  });
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  welcome = await context.newPage();
  await welcome.goto(`${origin}/install#code=${code}`);
});

test.afterEach(async () => {
  await context?.close();
  await bridge?.close();
  if (server?.listening)
    await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const preference of [undefined, "en", "ja", "unsupported"] as const) {
  test(`Chinese welcome consent and practice respect saved locale ${preference || "none"}`, async () => {
    if (preference)
      await worker.evaluate(
        (locale) => chrome.storage.local.set({ locale }),
        preference,
      );
    // Extension-ready comes before the language switch in this fresh browser.
    await expect(welcome.locator("#try-note")).toContainText("Pair extension");
    await welcome.locator("#language").click();
    await expect(welcome.locator("#try-note")).toContainText("配對擴充功能");
    const opened = context.waitForEvent("page", {
      predicate: (page) => page.url().startsWith("chrome-extension:"),
    });
    await welcome
      .getByRole("button", { name: "配對擴充功能", exact: true })
      .click();
    const panel = await opened;
    const expected = preference === "en" ? en : preference === "ja" ? ja : zh;
    await expect(
      panel.getByRole("heading", { name: expected.consentTitle, exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".consent select")).toHaveValue(
      preference === "en" || preference === "ja" ? preference : "zh-TW",
    );
    await expect(welcome.locator("#connection")).toContainText("已連線");
    await expect(welcome.locator("#try-note")).toHaveText("");
    await expect(welcome.locator("#pair-controls")).toBeHidden();
    // The connected note follows both subsequent language switches.
    await welcome.locator("#language").click();
    await expect(welcome.locator("#try-note")).toHaveText("");
    await expect(welcome.locator("#connection")).toContainText("Connected");
    await welcome.locator("#language").click();
    await expect(welcome.locator("#try-note")).toHaveText("");
    await expect(welcome.locator("#connection")).toContainText("已連線");
    const expectedLocale =
      preference === "en" || preference === "ja" ? preference : "zh-TW";
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.local.get("locale")).locale,
        ),
      )
      .toBe(expectedLocale);
    await panel
      .getByRole("button", { name: expected.consentAccept, exact: true })
      .click();
    await expect
      .poll(() =>
        panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
      )
      .toBe(true);
    const sampleOpened = welcome.waitForEvent("popup");
    await welcome
      .getByRole("button", { name: "開啟範例並提示翻譯", exact: true })
      .click();
    const sample = await sampleOpened;
    await expect(sample.locator("#tour-request")).toContainText("導覽步驟 6：");
    await expect(sample.locator("#tour-request")).toContainText(
      "在頁面上翻譯內容，再切回原文。",
    );
    await expect(sample.locator("[data-practice-label]")).toHaveText(
      "Glimpselet 練習頁面",
    );
    await expect
      .poll(() =>
        panel.evaluate(() =>
          window.documentPictureInPicture.window?.document
            .querySelector("main")
            ?.getAttribute("lang"),
        ),
      )
      .toBe(expectedLocale);
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.local.get("locale")).locale,
        ),
      )
      .toBe(expectedLocale);
    if (preference === undefined) {
      // Actual content-script crop + Chrome screenshot + React attachment, in Chinese.
      await expect
        .poll(() =>
          panel.evaluate(
            () =>
              window.documentPictureInPicture.window?.document.querySelector(
                ".float-start",
              )?.textContent || "",
          ),
        )
        .toContain(zh.replayTourHint.replace("{step}", "6"));
      await sample.bringToFront();
      // A real toolbar activation grants Chrome's activeTab screenshot permission.
      const browserCdp = await context.browser()!.newBrowserCDPSession();
      const { targetInfos } = await browserCdp.send("Target.getTargets", {
        filter: [{ type: "tab", exclude: false }],
      });
      const sampleTarget = targetInfos.find(
        (target) => target.url === sample.url(),
      );
      if (!sampleTarget) throw new Error("Missing practice tab target");
      await browserCdp.send("Extensions.triggerAction", {
        id: new URL(worker.url()).host,
        targetId: sampleTarget.targetId,
      });
      await browserCdp.detach();
      await sample.bringToFront();
      await sample.keyboard.down("Shift");
      await expect(
        sample.locator("[data-glimpselet-crop] .surface"),
      ).toBeVisible();
      await sample.keyboard.up("Shift");
      await sample.mouse.move(50, 80);
      await sample.mouse.down();
      await sample.mouse.move(300, 240);
      await sample.mouse.up();
      await expect(
        sample.locator("[data-glimpselet-crop] [data-handle]"),
      ).toHaveCount(8);
      await sample.keyboard.press("Enter");
      await expect
        .poll(() =>
          panel.evaluate(
            () =>
              window.documentPictureInPicture.window?.document.querySelector(
                ".capture-chip",
              )?.textContent || "",
          ),
        )
        .toContain(zh.region);
      await expect
        .poll(() =>
          panel.evaluate(() => {
            const image =
              window.documentPictureInPicture.window?.document.querySelector<HTMLImageElement>(
                ".capture-chip img",
              );
            return image ? [image.naturalWidth, image.naturalHeight] : [];
          }),
        )
        .toEqual([250, 160]);
    }
  });
}

test("fresh English welcome opens English consent and delivers the first practice action", async () => {
  await expect(welcome.locator("#try-note")).toContainText("Pair extension");
  const opened = context.waitForEvent("page", {
    predicate: (page) => page.url().startsWith("chrome-extension:"),
  });
  await welcome
    .getByRole("button", { name: "Pair extension", exact: true })
    .click();
  const panel = await opened;
  await expect(
    panel.getByRole("heading", { name: en.consentTitle, exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".consent select")).toHaveValue("en");
  await expect(welcome.locator("#connection")).toHaveClass(/connected/);
  await expect(welcome.locator("#try-note")).toHaveText("");
  await expect(welcome.locator("#pair-controls")).toBeHidden();
  await expect
    .poll(() =>
      worker.evaluate(
        async () => (await chrome.storage.local.get("locale")).locale,
      ),
    )
    .toBe("en");
  await panel
    .getByRole("button", { name: en.consentAccept, exact: true })
    .click();
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(true);
  const sampleOpened = welcome.waitForEvent("popup");
  await welcome
    .getByRole("button", {
      name: "Open sample + request translation",
      exact: true,
    })
    .click();
  const sample = await sampleOpened;
  await expect(sample.locator("#tour-request")).toContainText(
    "Tour step 6: Translate this page in place, then restore the original.",
  );
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window?.document.querySelector(
            ".float-start",
          )?.textContent || "",
      ),
    )
    .toContain(en.replayTourHint.replace("{step}", "6"));
});
