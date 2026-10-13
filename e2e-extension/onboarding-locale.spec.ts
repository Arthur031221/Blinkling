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
        url.pathname.endsWith(".svg")
          ? "image/svg+xml"
          : url.pathname.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "image/png",
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
  await welcome.goto(`${origin}/install`);
});

test.afterEach(async () => {
  await context?.close();
  await bridge?.close();
  if (server?.listening)
    await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const preference of [undefined, "en", "ja", "unsupported"] as const) {
  test(`automatic Chinese welcome respects saved preference ${preference || "none"}`, async () => {
    if (preference)
      await worker.evaluate(
        (locale) => chrome.storage.local.set({ locale }),
        preference,
      );
    await welcome.goto(`${origin}/install#code=${code}`);
    await welcome.locator("#language").selectOption("zh-TW");
    await expect(welcome.locator("#connection")).toHaveText(
      "已連到你的 Claude Code",
    );
    expect(
      context.pages().some((page) => page.url().includes("panel.html")),
    ).toBe(false);
    const opened = context.waitForEvent("page", {
      predicate: (page) => page.url().startsWith("chrome-extension:"),
    });
    await welcome.locator("#open-bubble").click();
    const panel = await opened;
    const expected = preference === "en" ? en : preference === "ja" ? ja : zh;
    const locale =
      preference === "en" || preference === "ja" ? preference : "zh-TW";
    await expect(
      panel.getByRole("heading", { name: expected.consentTitle, exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".consent select")).toHaveValue(locale);
    await panel
      .getByRole("button", { name: expected.consentAccept, exact: true })
      .click();
    await expect
      .poll(() =>
        panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
      )
      .toBe(true);
    await expect
      .poll(() =>
        panel.evaluate(
          () =>
            window.documentPictureInPicture.window?.document.querySelector(
              ".connection",
            )?.textContent,
        ),
      )
      .toBe(expected.connected);
    expect(
      (await worker.evaluate(() => chrome.storage.session.get("bridgeToken")))
        .bridgeToken,
    ).toMatch(/^[a-f0-9]{64}$/);
    await welcome.reload();
    await expect(welcome.locator("#connection")).toHaveClass(/connected/);
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.local.get("locale")).locale,
        ),
      )
      .toBe(locale);
  });
}

test("a forged readiness message cannot connect with an invalid capability", async () => {
  await welcome.goto(`${origin}/install?locale=en#code=0000000000000000`);
  await welcome.evaluate(() =>
    window.postMessage({ type: "glimpselet:extension-ready" }, location.origin),
  );
  await expect(welcome.locator("#connection")).toContainText("Run /glimpse");
  await expect(welcome.locator("#open-bubble")).toBeDisabled();
  expect(
    await worker.evaluate(() => chrome.storage.session.get("bridgeToken")),
  ).toEqual({});
  expect(
    context.pages().some((page) => page.url().includes("panel.html")),
  ).toBe(false);
});
