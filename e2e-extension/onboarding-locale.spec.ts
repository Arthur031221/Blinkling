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
import { welcomeLocales } from "../bridge/src/welcome-locales";
import en from "../extension/locales/en.json" with { type: "json" };
import zh from "../extension/locales/zh-TW.json" with { type: "json" };
import ja from "../extension/locales/ja.json" with { type: "json" };

let server: Server,
  bridge: ExtensionBridge,
  context: BrowserContext,
  worker: Worker;
let directory: string, origin: string, welcome: Page, code: string;
let now: number;

test.beforeEach(async () => {
  now = Date.now();
  directory = await mkdtemp(join(tmpdir(), "blinkling-onboarding-locale-"));
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
      response.end(
        JSON.stringify({
          connected,
          active: bridge.installConnectionActive(code),
          mode: "direct",
        }),
      );
    } else if (url.pathname === "/install") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(installGuide("/tmp/blinkling-extension"));
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
    now: () => now,
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
      welcomeLocales["zh-TW"].completed,
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

test("consent stays concise and its access control fits every locale in light and dark", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium");
  await welcome.goto(`${origin}/install?locale=en#code=${code}`);
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.completed,
  );
  const opened = context.waitForEvent("page", {
    predicate: (page) => page.url().startsWith("chrome-extension:"),
  });
  await welcome.locator("#open-bubble").click();
  const panel = await opened;
  await panel.setViewportSize({ width: 320, height: 650 });
  await expect(panel.locator(".consent li, .consent small")).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await panel.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const locale of Object.keys(welcomeLocales)) {
      await panel.locator(".consent select").selectOption(locale);
      const layout = await panel.evaluate(() => {
        const access = document.querySelector<HTMLButtonElement>(
          ".consent button.wide",
        )!;
        const accept = document.querySelector<HTMLButtonElement>(
          ".consent button:last-of-type",
        )!;
        const style = getComputedStyle(access);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          top: document
            .querySelector(".consent .brand")!
            .getBoundingClientRect().top,
          bottom: accept.getBoundingClientRect().bottom,
          height: innerHeight,
          access: {
            background: style.backgroundColor,
            radius: style.borderRadius,
            padding: style.paddingTop,
            height: access.getBoundingClientRect().height,
          },
        };
      });
      expect(layout.overflow, `${locale} ${colorScheme}`).toBe(false);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(layout.height);
      expect(layout.access.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(parseFloat(layout.access.radius)).toBeGreaterThan(0);
      expect(parseFloat(layout.access.padding)).toBeGreaterThan(0);
      expect(layout.access.height).toBeGreaterThanOrEqual(30);
      const path = testInfo.outputPath(`consent-${locale}-${colorScheme}.png`);
      await panel.screenshot({ path });
      await testInfo.attach(`consent-${locale}-${colorScheme}`, {
        path,
        contentType: "image/png",
      });
    }
  }
});

test("completed setup survives link expiry and network errors without claiming live health", async () => {
  await welcome.goto(`${origin}/install?locale=en#code=${code}`);
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.completed,
  );
  const opened = context.waitForEvent("page", {
    predicate: (page) => page.url().startsWith("chrome-extension:"),
  });
  await welcome.locator("#open-bubble").click();
  const panel = await opened;
  await panel
    .getByRole("button", { name: en.consentAccept, exact: true })
    .click();
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.connected,
  );
  await context.route("**/install/status?**", (route) =>
    route.abort("connectionrefused"),
  );
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.checkFailed,
  );
  await expect(welcome.locator("#connection")).not.toHaveClass(/connected/);
  await expect(welcome.locator("#open-bubble")).toBeEnabled();
  await context.unroute("**/install/status?**");
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.connected,
  );
  const expired = welcome.waitForResponse(
    (response) =>
      response.url().includes("/install/status?") && response.status() === 401,
  );
  now += 600000;
  await expired;
  await expect(welcome.locator("#connection")).toHaveText(
    welcomeLocales.en.completed,
  );
  await expect(welcome.locator("#connection")).not.toHaveClass(/connected/);
  await expect(welcome.locator("#open-bubble")).toBeEnabled();
  await expect(welcome.locator("#reconnect")).toBeHidden();
  await welcome.locator("#open-bubble").click();
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window?.document.querySelector(
            ".connection",
          )?.textContent,
      ),
    )
    .toBe(en.connected);
});

test("a forged readiness message cannot connect with an invalid capability", async () => {
  await welcome.goto(`${origin}/install?locale=en#code=0000000000000000`);
  await welcome.evaluate(() =>
    window.postMessage({ type: "blinkling:extension-ready" }, location.origin),
  );
  await expect(welcome.locator("#connection")).toContainText(
    "Run /blinkling:blinkling",
  );
  await expect(welcome.locator("#open-bubble")).toBeDisabled();
  expect(
    await worker.evaluate(() => chrome.storage.session.get("bridgeToken")),
  ).toEqual({});
  expect(
    context.pages().some((page) => page.url().includes("panel.html")),
  ).toBe(false);
});
