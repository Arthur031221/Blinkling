import { launchExtensionContext } from "./browser";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  INSTALL_GUIDE_SCRIPT,
  createExtensionZip,
  installGuide,
} from "../bridge/src/extension-install";

let context: BrowserContext,
  server: Server,
  directory: string,
  origin: string,
  welcome: Page;
let installMode: "direct" | "tunnel";
let storeUrl: string;

test.beforeEach(async () => {
  installMode = "direct";
  storeUrl = "";
  directory = await mkdtemp(join(tmpdir(), "blinkling-welcome-recovery-"));
  server = createServer((req, res) => {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    );
    if (path === "/install") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        installGuide("/tmp/blinkling-extension", {
          chromeWebStoreUrl: storeUrl,
          edgeAddonsUrl: "",
        }),
      );
    } else if (path === "/install/status") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ connected: false, mode: installMode }));
    } else if (path === "/install/extension.zip") {
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="blinkling-extension.zip"',
      );
      void createExtensionZip(resolve("dist-extension")).then((data) =>
        res.end(data),
      );
    } else if (path === "/install-guide.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(INSTALL_GUIDE_SCRIPT);
    } else if (path === "/store-listing") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<h1>Blinkling store listing</h1>");
    } else if (path.startsWith("/assets/")) {
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".svg")
            ? "image/svg+xml"
            : "image/png",
      );
      const asset = path.startsWith("/assets/install/")
        ? resolve(`.${path}`)
        : resolve(`public${path}`);
      void readFile(asset).then(
        (body) => res.end(body),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<title>Elsewhere</title><p>The practice tab navigated away.</p>",
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No server port");
  origin = `http://127.0.0.1:${address.port}`;
  const extension = resolve("dist-extension");
  context = await launchExtensionContext(join(directory, "profile"), {
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  welcome = await context.newPage();
  await welcome.goto(`${origin}/install`);
});

test.afterEach(async () => {
  await context?.close();
  if (server?.listening)
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const mode of ["direct", "tunnel"] as const) {
  test(`copies a usable extensions-manager address for ${mode} install`, async () => {
    installMode = mode;
    welcome = await context.newPage();
    await welcome.goto(`${origin}/install#code=0123456789ABCDEF`);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    const card = welcome.locator(
      mode === "direct" ? "#install-local" : "#install-remote",
    );
    await expect(card).toBeVisible();
    await expect(welcome.locator("#installation")).toContainText(
      "Paste in your browser’s address bar.",
    );
    await expect(welcome.locator(".manager-address")).toHaveValue(
      "chrome://extensions",
    );
    await welcome
      .getByRole("button", { name: "Copy address", exact: true })
      .click();
    const copied = await welcome.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe("chrome://extensions");
    const manager = await context.newPage();
    // Navigate the actual browser to the address the user copies, including its
    // native manager UI; localhost anchors cannot perform this navigation.
    await manager.goto(copied);
    await expect(manager).toHaveURL("chrome://extensions/");
    await expect(manager.locator("extensions-manager")).toBeVisible();
    await manager.close();
    if (mode === "tunnel") {
      const downloadPromise = welcome.waitForEvent("download");
      await card.getByRole("link", { name: "Download extension" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("blinkling-extension.zip");
      const data = await readFile((await download.path())!);
      expect(data.readUInt32LE(0)).toBe(0x04034b50);
      expect(data.includes(Buffer.from("manifest.json"))).toBe(true);
    }
  });
}

test("configured store install navigates to its listing without unpacked controls", async () => {
  storeUrl =
    "https://chromewebstore.google.com/detail/blinkling/abcdefghijklmnopabcdefghijklmnop";
  await context.route(storeUrl, (route) =>
    route.fulfill({
      status: 302,
      headers: { Location: `${origin}/store-listing` },
    }),
  );
  await welcome.reload();
  await expect(welcome.locator("#install-local")).toHaveCount(0);
  await expect(welcome.locator("#install-remote")).toHaveCount(0);
  const navigation = welcome.waitForRequest(storeUrl);
  await welcome.getByRole("link", { name: "Add to browser" }).click();
  expect((await navigation).isNavigationRequest()).toBe(true);
  await expect(welcome).toHaveURL(`${origin}/store-listing`);
  await expect(
    welcome.getByRole("heading", { name: "Blinkling store listing" }),
  ).toBeVisible();
});

test("the install guide title draws the name with a sparkle in every language and never shifts", async () => {
  await welcome.emulateMedia({ reducedMotion: "no-preference" });
  for (const locale of [
    "en",
    "zh-TW",
    "zh-CN",
    "ja",
    "ko",
    "es",
    "fr",
    "de",
    "pt-BR",
  ]) {
    await welcome.locator("#language").selectOption(locale);
    const title = welcome.locator("h1");
    await expect(title.locator(".sparkle-name")).toHaveCount(1);
    await expect(title.locator(".sparkle-text")).toHaveText("Blinkling");
    await expect(title.locator(".sparkle-star")).toHaveCount(3);
    // The name is never translated, and the whole title reads normally.
    expect(await title.innerText()).toContain("Blinkling");
    expect(await welcome.title()).toContain("Blinkling");
  }
  const title = welcome.locator("h1");
  const before = await title.boundingBox();
  for (let i = 0; i < 5; i++) {
    await welcome.waitForTimeout(250);
    expect(await title.boundingBox()).toEqual(before);
  }
  await welcome.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await title.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a instanceof CSSAnimation),
    ),
  ).toEqual([]);
});

test("three steps and Blink fit every locale at compact widths in light and dark", async () => {
  await expect
    .poll(() =>
      welcome.evaluate(() =>
        [...document.images].every((image) => image.naturalWidth > 0),
      ),
    )
    .toBe(true);
  for (const colorScheme of ["light", "dark"] as const) {
    await welcome.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await welcome.setViewportSize({ width: 360, height: 740 });
    for (const locale of [
      "en",
      "zh-TW",
      "zh-CN",
      "ja",
      "ko",
      "es",
      "fr",
      "de",
      "pt-BR",
    ]) {
      await welcome.locator("#language").selectOption(locale);
      await expect(welcome.locator("html")).toHaveAttribute("lang", locale);
      await expect(welcome.locator("section")).toHaveCount(3);
      const layout = await welcome.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        logo: document.querySelector<HTMLImageElement>(".blink")!.naturalWidth,
        text: document.body.innerText,
      }));
      expect(layout.overflow, `${colorScheme} ${locale}`).toBe(false);
      expect(layout.logo).toBeGreaterThan(0);
      expect(layout.text).not.toMatch(
        /0123456789ABCDEF|Pairing code|practice|exercise/i,
      );
    }
  }
});
