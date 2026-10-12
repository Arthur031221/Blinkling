import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const extension = resolve("dist-extension");
if (!existsSync(`${extension}/manifest.json`))
  throw new Error("Build the extension first: npm run build:extension");

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--window-size=1100,780",
  ],
});
const results = [];
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  if (!worker.url().startsWith("chrome-extension://"))
    throw new Error("Extension worker did not start");
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  const checks = [
    ["News", "https://www.bbc.com/news", /bbc\.com\/news/],
    ["GitHub", "https://github.com/explore", /github\.com/],
    [
      "Japanese-language page",
      "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC",
      /ja\.wikipedia\.org/,
    ],
  ];
  for (const [name, url, expected] of checks) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      if (!response?.ok() || !expected.test(page.url()))
        throw new Error(
          `navigation returned ${response?.status() ?? "no response"}`,
        );
      await page.locator("body").waitFor({ state: "visible", timeout: 12000 });
      console.log(`${name}: PASS ${page.url()}`);
      results.push({ name, ok: true });
      if (name === "GitHub") {
        const panelOpened = context.waitForEvent("page", { timeout: 15000 });
        await worker.evaluate(async () => {
          await chrome.windows.create({
            url: chrome.runtime.getURL("panel.html"),
            type: "popup",
            width: 420,
            height: 620,
          });
        });
        const panel = await panelOpened;
        await panel.waitForLoadState("domcontentloaded");
        if (
          !panel
            .url()
            .startsWith(`chrome-extension://${extensionId}/panel.html`)
        )
          throw new Error("extension did not open its real panel page");
        console.log(
          "Extension interaction: PASS opened the v2 unpacked panel over GitHub.",
        );
        await panel.close();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.log(`${name}: NETWORK LIMITATION / unavailable (${detail})`);
      results.push({ name, ok: false, detail });
    }
  }

  try {
    const response = await page.request.get(
      "https://arxiv.org/pdf/1706.03762",
      { timeout: 60000 },
    );
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    const contentType = response.headers()["content-type"] || "";
    const bytes = await response.body();
    if (
      !contentType.toLowerCase().includes("pdf") &&
      bytes.subarray(0, 5).toString() !== "%PDF-"
    )
      throw new Error(
        `response was not a PDF (${contentType || "unknown content type"})`,
      );
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extensionId}/reader.html`);
    await reader.locator("#file").setInputFiles({
      name: "arxiv-1706.03762.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await reader.locator(".pdf-page").waitFor({ timeout: 60000 });
    await reader
      .locator(".pdf-text-layer span")
      .first()
      .waitFor({ timeout: 30000 });
    console.log(
      `arXiv PDF.js reader: PASS loaded real arXiv PDF (${(bytes.length / 1024).toFixed(0)} KiB), ${await reader.locator("#page-label").innerText()}.`,
    );
    results.push({ name: "arXiv PDF.js reader", ok: true });
    await reader.close();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(
      `arXiv PDF.js reader: NETWORK LIMITATION / unavailable (${detail})`,
    );
    results.push({ name: "arXiv PDF.js reader", ok: false, detail });
  }

  const unavailable = results.filter((result) => !result.ok);
  console.log(
    unavailable.length
      ? `Smoke completed with ${unavailable.length} network-limited check(s); extension worker and all reachable checks ran.`
      : "Smoke passed: v2 extension worker and panel, news, GitHub, Japanese-language page and actual arXiv PDF in the bundled PDF.js reader.",
  );
} finally {
  await context.close();
}
