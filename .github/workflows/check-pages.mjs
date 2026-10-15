import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { resolve, extname } from "node:path";
import { chromium, expect } from "@playwright/test";
import { installCommand } from "../../scripts/install-command.mjs";

// Exercise the approved-store switch without changing the repository config.
const fixture = await mkdtemp(resolve(tmpdir(), "blinkling-pages-"));
const buildPages = resolve(".github/workflows/build-pages.mjs");
try {
  for (const folder of ["demo", "assets", "site"]) {
    await cp(folder, resolve(fixture, folder), { recursive: true });
  }
  await mkdir(resolve(fixture, "dist"));
  await mkdir(resolve(fixture, "config"));
  const chrome =
    "https://chromewebstore.google.com/detail/blinkling/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const edge =
    "https://microsoftedge.microsoft.com/addons/detail/blinkling/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  for (const config of [
    { chromeWebStoreUrl: "", edgeAddonsUrl: "" },
    { chromeWebStoreUrl: chrome, edgeAddonsUrl: edge },
  ]) {
    await writeFile(resolve(fixture, "dist/index.html"), "<p>Chat fixture</p>");
    await writeFile(
      resolve(fixture, "config/distribution.json"),
      JSON.stringify(config),
    );
    await promisify(execFile)(process.execPath, [buildPages], { cwd: fixture });
    const html = await readFile(resolve(fixture, "dist/index.html"), "utf8");
    assert.equal(
      html.includes("Store listings are not available yet."),
      !config.chromeWebStoreUrl,
    );
    if (config.chromeWebStoreUrl) {
      assert.ok(html.includes(`href="${chrome}"`));
      assert.ok(html.includes(`href="${edge}"`));
      assert.ok(!html.includes("Updates are manual."));
    }
    assert.equal(
      await readFile(resolve(fixture, "dist/try.html"), "utf8"),
      "<p>Chat fixture</p>",
    );
  }
  await writeFile(
    resolve(fixture, "config/distribution.json"),
    JSON.stringify({ chromeWebStoreUrl: "https://example.com/fake-store" }),
  );
  await assert.rejects(
    promisify(execFile)(process.execPath, [buildPages], { cwd: fixture }),
    /approved HTTPS store URL/,
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}

const base = "/Blinkling/";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".ttf": "font/ttf",
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }
  // Like GitHub Pages, a folder URL serves its index.html.
  const relative = pathname.slice(base.length);
  const path = resolve(
    root,
    relative === "" || relative.endsWith("/")
      ? `${relative}index.html`
      : relative,
  );
  if (!path.startsWith(`${root}/`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(path);
    response
      .writeHead(200, {
        "content-type": mime[extname(path)] || "application/octet-stream",
      })
      .end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const install = JSON.parse(await readFile("config/install.json", "utf8"));
const macAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

async function checkInstallGuide(browser) {
  for (const [width, height, colorScheme, reducedMotion] of [
    [1280, 900, "light", "no-preference"],
    [390, 844, "dark", "no-preference"],
    [390, 844, "light", "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme,
      reducedMotion,
      userAgent: macAgent,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    const label = `${width}px ${colorScheme} ${reducedMotion}`;
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    page.on("requestfailed", (request) => failures.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400)
        failures.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${origin}${base}install/`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-panel="mac"]')).toBeVisible();
    await expect(page.locator('[data-panel="windows"]')).toBeHidden();
    await expect(page.locator('[data-panel="linux"]')).toBeHidden();
    assert.equal(
      await page.locator('input[name="os"]:checked').count(),
      1,
      `One operating system is preselected at ${label}`,
    );
    await page.getByRole("radio", { name: "Windows" }).check({ force: true });
    await expect(page.locator('[data-panel="windows"]')).toBeVisible();
    await expect(page.locator('[data-panel="mac"]')).toBeHidden();
    const copy = page.locator('[data-panel="windows"] .copy').first();
    await copy.click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      installCommand(install, { powershell: true }),
      `Windows copy button writes the PowerShell line at ${label}`,
    );
    await page.goto(`${origin}${base}install/?os=linux`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator('[data-panel="linux"]')).toBeVisible();
    await expect(page.locator('[data-panel="mac"]')).toBeHidden();
    await page.locator('[data-panel="linux"] .copy').first().click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      installCommand(install),
      `Linux copy button writes the shell line at ${label}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Install guide overflows at ${label}`,
    );
    if (reducedMotion === "reduce") {
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect?.getTiming().iterations === Infinity,
            ).length,
      );
      assert.equal(
        running,
        0,
        "No looping animation runs under reduced motion",
      );
    }
    await page.screenshot({
      path: `test-results/pages/install-${width}-${colorScheme}-${reducedMotion}.png`,
      fullPage: true,
    });
    assert.deepEqual(failures, [], `Install guide errors at ${label}`);
    await context.close();
  }
}

let browser;
try {
  browser = await chromium.launch();
  await mkdir("test-results/pages", { recursive: true });
  for (const [width, height, colorScheme] of [
    [1280, 900, "light"],
    [390, 844, "light"],
    [390, 844, "dark"],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      colorScheme,
    });
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    page.on("requestfailed", (request) => failures.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400)
        failures.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${origin}${base}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Keep the answer beside the page." }),
    ).toBeVisible();
    for (const image of await page.locator("img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (element) => element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    const localLinks = await page
      .locator("a[href]")
      .evaluateAll((links) =>
        links
          .map((link) => link.href)
          .filter((href) => new URL(href).origin === location.origin),
      );
    for (const link of new Set(localLinks)) {
      const url = new URL(link);
      const response = await page.request.get(url.href);
      assert.equal(response.status(), 200, `Broken local link: ${url.href}`);
      if (url.pathname === base && url.hash) {
        assert.equal(
          await page.locator(url.hash).count(),
          1,
          `Missing anchor: ${url.hash}`,
        );
      }
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Showcase overflows at ${width}px`,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/pages/${width}-${colorScheme}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Privacy policy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Blinkling Privacy Policy",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Limited Use requirements/)).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Policy overflows at ${width}px`,
    );
    await page.goto(`${origin}${base}try.html?demo=1`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("img", { name: "Labeled static demo fixture" }),
    ).toBeVisible();
    await page
      .getByRole("textbox")
      .fill("Which control saves these preferences?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".answer .markdown")).toContainText(
      "This prerecorded answer makes no provider call",
    );
    assert.deepEqual(failures, [], `Pages errors at ${width}px ${colorScheme}`);
    await page.close();
  }
  await checkInstallGuide(browser);
  console.log(
    "Pages passed: subpath assets and links, desktop/mobile light and dark, privacy policy, prerecorded chat and install guide.",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
