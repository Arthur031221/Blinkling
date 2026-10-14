import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

// Live pages and the logged-in Claude Code provider; no page or answer mocks.
// Public test hosts are granted only in an isolated copy of the extension.
const checks = [
  ["google-flights", "https://www.google.com/travel/flights"],
  ["muji-shop", "https://www.muji.us/collections/stationery"],
  ["arxiv-paper", "https://arxiv.org/html/2501.12948v1"],
  ["wikipedia", "https://en.wikipedia.org/wiki/Tea"],
];
const evidence = resolve(
  process.env.GLIMPSELET_GUIDE_EVIDENCE || "test-results/guide-sites",
);
await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), "glimpselet-live-guide-"));
let context;
const results = [];
try {
  const extension = join(directory, "extension");
  await cp(resolve("dist-extension"), extension, { recursive: true });
  const manifestPath = join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions.push(
    ...checks.map(([, url]) => `${new URL(url).origin}/*`),
  );
  await writeFile(manifestPath, JSON.stringify(manifest));
  const modulePath = join(directory, "guide-tools.mjs");
  await build({
    stdin: {
      contents:
        'export { buildGuidePrompt, parseGuideResult } from "./extension/api"; export { runCliProvider } from "./bridge/src/provider-cli";',
      resolveDir: resolve("."),
      loader: "ts",
    },
    outfile: modulePath,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { buildGuidePrompt, parseGuideResult, runCliProvider } = await import(
    pathToFileURL(modulePath).href
  );
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
    headless: false,
    viewport: { width: 1280, height: 850 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const page = await context.newPage();
  await page.bringToFront();
  for (const [name, url] of checks) {
    const started = Date.now();
    console.log(`${name}: reading live page`);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    assert(response?.ok(), `Live navigation failed: ${response?.status()}`);
    await page.locator("p:visible").first().waitFor({ state: "visible" });
    const tabId = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      if (!tab?.id) throw new Error("Missing live-site tab");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      return tab.id;
    }, page.url());
    const send = (message) =>
      worker.evaluate(
        ({ tabId, message }) => chrome.tabs.sendMessage(tabId, message),
        { tabId, message },
      );
    const data = await send({ type: "glimpselet:guide-context" });
    assert(
      !data.error && !data.hasPassword,
      `Guide privacy gate: ${data.error || "sensitive page"}`,
    );
    assert(
      data.elements.some((e) => e.role === "paragraph"),
      "Live paragraph map missing",
    );
    console.log(
      `${name}: ${data.elements.length} mapped regions; asking real Claude Code`,
    );
    const answer = await runCliProvider({
      question: buildGuidePrompt(
        "Explain the entire page in English. Keep each note under 120 characters.",
        data,
        true,
      ),
      kind: "guide",
      model: "haiku",
      effort: "low",
      backend: "cli",
      context: [],
      page: data,
      signal: AbortSignal.timeout(180000),
      onText() {},
    });
    const guide = parseGuideResult(answer.answer, data);
    assert.equal(guide.status, "ready", answer.answer.slice(0, 1000));
    assert(guide.purpose, "No page-purpose explanation");
    assert(
      guide.summary?.length > 0 && guide.summary.length <= 3,
      "No concise section/task summary",
    );
    const byId = new Map(data.elements.map((e) => [e.id, e]));
    const [paragraphResult] = await worker.evaluate(
      (tabId) =>
        chrome.scripting.executeScript({
          target: { tabId },
          func: () =>
            [...document.querySelectorAll("p")]
              .filter(
                (p) =>
                  !p.closest(
                    "nav,aside,li,[data-private],[data-sensitive],[data-glimpselet-overlay]",
                  ) &&
                  p.textContent.trim().length > 40 &&
                  p.getClientRects().length > 0,
              )
              .map((p) => globalThis.glimpseletElementRegistry.ids.get(p))
              .filter(Boolean),
        }),
      tabId,
    );
    const paragraphIds = paragraphResult.result.filter((id) => byId.has(id));
    const guidedIds = new Set(guide.steps.map((step) => step.elementId));
    const coveredParagraphs = paragraphIds.filter((id) =>
      guidedIds.has(id),
    ).length;
    // Retain the real response even if a later navigation assertion fails.
    const currentPage = await send({ type: "glimpselet:guide-context" });
    await writeFile(
      join(evidence, `${name}-attempt.json`),
      JSON.stringify(
        { page: data, currentPage, guide, usage: answer.usage },
        null,
        2,
      ) + "\n",
    );
    assert(
      coveredParagraphs >= paragraphIds.length * 0.85,
      `Only ${coveredParagraphs}/${paragraphIds.length} substantive paragraphs explained`,
    );
    assert(
      guide.steps.some((s) => byId.get(s.elementId)?.role === "paragraph"),
      "Guide omitted paragraphs",
    );
    assert(
      guide.steps.some((s) =>
        /^(section|h[1-6])$/.test(byId.get(s.elementId)?.role),
      ),
      "Guide omitted sections",
    );
    if (["google-flights", "muji-shop"].includes(name))
      assert(
        guide.steps.some((s) => s.action),
        "Main-task guide omitted task hints",
      );
    if (["arxiv-paper", "wikipedia"].includes(name))
      assert(guide.steps.length > 12, "Reading guide did not cover the page");
    assert.deepEqual(
      await send({
        type: "glimpselet:guide",
        steps: guide.steps,
        purpose: guide.purpose,
        documentKey: data.documentKey,
        url: data.url,
      }),
      { ok: true },
    );
    const callout = page.locator("[data-glimpselet-overlay] .guide");
    await callout.waitFor({ state: "visible" });
    await page.screenshot({ path: join(evidence, `${name}-tour.png`) });
    await callout.locator('[data-guide-control="next"]').click();
    await callout.locator('[data-guide-control="back"]').click();
    await callout.locator('[data-guide-control="overview"]').click();
    const overview = page.locator("[data-glimpselet-overlay] .guide-overview");
    await overview.waitFor({ state: "visible" });
    assert.equal(await overview.locator("li").count(), guide.steps.length);
    const sectionGroups = await overview.locator(".guide-section").count();
    assert(sectionGroups > 0, "Overview omitted section groups");
    assert.equal(await overview.locator(".guide-section[open]").count(), 0);
    const visibleNotes = await overview.locator("li button:visible").count();
    await page.screenshot({ path: join(evidence, `${name}-overview.png`) });
    const belowFoldParagraph = guide.steps.findIndex(
      (s) =>
        byId.get(s.elementId).role === "paragraph" &&
        byId.get(s.elementId).rect[1] > 850,
    );
    const belowFold =
      belowFoldParagraph >= 0
        ? belowFoldParagraph
        : guide.steps.findIndex((s) => byId.get(s.elementId).rect[1] > 850);
    assert(belowFold >= 0, "Guide omitted below-fold content");
    const target = overview.locator(`[data-guide-index="${belowFold}"]`);
    const section = target.locator("xpath=ancestor::details");
    if (await section.count()) await section.locator("summary").click();
    await target.click();
    await callout.waitFor({ state: "visible" });
    await page.setViewportSize({ width: 520, height: 680 });
    await callout.locator('[data-guide-control="overview"]').click();
    await overview.waitFor({ state: "visible" });
    await page.screenshot({ path: join(evidence, `${name}-narrow.png`) });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("[data-glimpselet-overlay] .guide-overview").count(),
      0,
    );
    assert.equal(
      await page.locator("[data-glimpselet-overlay] .draw").count(),
      0,
    );
    assert.equal(
      await worker.evaluate(
        async (id) =>
          (await chrome.tabs.query({ active: true })).some(
            (tab) => tab.id === id,
          ),
        tabId,
      ),
      true,
      "Guide changed the active tab",
    );
    const result = {
      name,
      url: data.url,
      title: data.title,
      mapped: data.elements.length,
      steps: guide.steps.length,
      paragraphs: paragraphIds.length,
      substantiveParagraphsOnPage: paragraphResult.result.length,
      coveredParagraphs,
      purpose: guide.purpose,
      summary: guide.summary,
      sectionGroups,
      visibleNotes,
      roles: [...new Set(guide.steps.map((s) => byId.get(s.elementId).role))],
      elapsedMs: Date.now() - started,
      usage: answer.usage,
    };
    results.push(result);
    await writeFile(
      join(evidence, `${name}.json`),
      JSON.stringify({ result, page: data, guide }, null, 2) + "\n",
    );
    await page.setViewportSize({ width: 1280, height: 850 });
    console.log(
      `${name}: PASS ${guide.steps.length} steps; Next/Back, overview, below-fold navigation, narrow layout, Escape, active tab preserved`,
    );
  }
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await context?.close();
  await rm(directory, { recursive: true, force: true });
}
