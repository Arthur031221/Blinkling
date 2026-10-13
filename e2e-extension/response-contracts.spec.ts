import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { launchExtensionContext } from "./browser";
import type { PageContext } from "../extension/api";

// This suite exercises shared response contracts and the real content script.
// The bubble's handling of an unavailable guide is tested by its UI owner.
type Harness = Pick<
  typeof import("../extension/api"),
  "parseGuideResult" | "parseTranslationBatch"
>;
type HarnessWindow = Window & { GlimpseletTest: Harness };
type FixtureWindow = Window & {
  originalFragmentNodes: Node[];
  originalFragmentValues: Array<string | null>;
  originalFragmentElements: Element[];
  originalFragmentChildren: Node[][];
  translationWrites: number;
};
type SourceNode = { id: string; text: string };

// Captured verbatim from developer-2/export-control-evidence.json. The SVG
// supplies no text label; its menu state does not establish an export action.
const capturedHamburger =
  '<button type="button" id="radix-:r2:" aria-haspopup="menu" aria-expanded="false" data-state="closed" class="dropdown-menu-button main-menu-trigger zen-mode-transition" data-testid="main-menu-trigger"><svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" class="" fill="none" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.5"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></g></svg></button>';

let testExtension: string;
let directory: string;
let server: Server;
let context: BrowserContext;
let site: Page;
let harness: Page;
let worker: Worker;
let tabId: number;

test.beforeAll(async () => {
  testExtension = await mkdtemp(
    join(tmpdir(), "glimpselet-contract-extension-"),
  );
  await cp(resolve("dist-extension"), testExtension, { recursive: true });
  await build({
    stdin: {
      contents:
        'export { parseGuideResult, parseTranslationBatch } from "./api";',
      resolveDir: resolve("extension"),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "GlimpseletTest",
    outfile: join(testExtension, "response-contract-harness.js"),
  });
  await writeFile(
    join(testExtension, "response-contract-harness.html"),
    '<script src="response-contract-harness.js"></script>',
  );
});

test.afterAll(async () => {
  if (testExtension) await rm(testExtension, { recursive: true, force: true });
});

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-response-contracts-"));
  server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>Drawing controls</title>
      <style>body{margin:30px;font:16px system-ui}button{margin:20px;padding:12px}#export{margin-left:150px}#fragments{width:650px;line-height:1.6}#fragments a{color:#36c}</style>
      </head><body><button id="undo">Undo</button><button id="export">Export drawing</button></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  const origin = `http://127.0.0.1:${address.port}`;
  context = await launchExtensionContext(join(directory, "profile"), {
    headless: false,
    viewport: { width: 1100, height: 780 },
    args: [
      `--disable-extensions-except=${testExtension}`,
      `--load-extension=${testExtension}`,
      "--no-sandbox",
      "--enable-unsafe-extension-debugging",
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ consented: true, locale: "en" }),
  );
  site = await context.newPage();
  await site.goto(origin);
  tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: `${url}/*` });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ["content.js"],
    });
    return tab.id!;
  }, origin);
  harness = await context.newPage();
  await harness.goto(
    `chrome-extension://${new URL(worker.url()).host}/response-contract-harness.html`,
  );
  await site.bringToFront();
});

test.afterEach(async () => {
  await context?.close();
  if (server) await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function sendPage<T>(message: Record<string, unknown>): Promise<T> {
  return (await worker.evaluate(
    ({ id, message }) => chrome.tabs.sendMessage(id, message),
    { id: tabId, message },
  )) as T;
}

async function parseGuide(response: unknown, page: PageContext) {
  return harness.evaluate(
    ({ text, page }) =>
      (window as HarnessWindow).GlimpseletTest.parseGuideResult(text, page),
    { text: JSON.stringify(response), page },
  );
}

test("an unavailable target suppresses a conflicting Undo highlight", async () => {
  await site.locator("#export").evaluate((element) => element.remove());
  await site.evaluate(
    (html) => document.body.insertAdjacentHTML("afterbegin", html),
    capturedHamburger,
  );
  const menu = site.getByTestId("main-menu-trigger");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-haspopup", "menu");
  expect(await menu.getAttribute("aria-label")).toBeNull();
  const page = await sendPage<PageContext>({
    type: "glimpselet:guide-context",
  });
  const undo = page.elements.find((element) => element.text === "Undo")!;
  expect(undo).toBeDefined();
  expect(page.elements.some((element) => /export/i.test(element.text))).toBe(
    false,
  );
  const reason =
    "The export menu is not reliably represented in the supplied element map.";
  const result = await parseGuide(
    {
      status: "unavailable",
      reason,
      steps: [
        { elementId: undo.id, note: "Export is unavailable", action: "none" },
      ],
    },
    page,
  );

  expect(result).toEqual({ status: "unavailable", reason, steps: [] });
  expect(
    await sendPage({ type: "glimpselet:guide", steps: result.steps }),
  ).toEqual({ ok: false });
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toHaveCount(0);
  await expect(site.locator("[data-glimpselet-overlay] svg.draw")).toHaveCount(
    0,
  );
});

test("a known guide target draws on the actual control without a literal no-op action", async () => {
  const page = await sendPage<PageContext>({
    type: "glimpselet:guide-context",
  });
  const target = page.elements.find(
    (element) => element.text === "Export drawing",
  )!;
  expect(target).toBeDefined();
  const result = await parseGuide(
    {
      status: "ready",
      steps: [
        {
          elementId: target.id,
          note: "Use this export control",
          action: "none",
        },
      ],
    },
    page,
  );
  expect(result).toEqual({
    status: "ready",
    steps: [{ elementId: target.id, note: "Use this export control" }],
  });
  expect(
    await sendPage({ type: "glimpselet:guide", steps: result.steps }),
  ).toEqual({ ok: true });
  const guide = site.locator("[data-glimpselet-overlay] .guide");
  await expect(guide).toBeVisible();
  await expect(guide.locator("p")).toHaveText("Use this export control");
  const control = await site.locator("#export").boundingBox();
  const ink = site.locator("[data-glimpselet-overlay] svg.draw ellipse.ink");
  await expect(ink).toBeVisible();
  expect(Number(await ink.getAttribute("cx"))).toBeCloseTo(
    control!.x + control!.width / 2,
  );
  expect(Number(await ink.getAttribute("cy"))).toBeCloseTo(
    control!.y + control!.height / 2,
  );
  await guide.getByRole("button", { name: "Close guide", exact: true }).click();
  await expect(guide).toHaveCount(0);
  await expect(site.locator("[data-glimpselet-overlay] svg.draw")).toHaveCount(
    0,
  );
});

async function prepareFragments(): Promise<SourceNode[]> {
  await site.evaluate(() => {
    // Adjacent t19-t23 fragments from the recorded Japanese Wikipedia case.
    document.body.innerHTML =
      '<p id="fragments"> \n<span>この記事は</span><a href="#verifiable">検証可能</a><span>な</span><a href="#sources">参考文献や出典</a><span>が全く示されていないか、不十分です。</span>\t </p>';
    const paragraph = document.querySelector("#fragments")!;
    const scope = window as FixtureWindow;
    scope.originalFragmentNodes = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) scope.originalFragmentNodes.push(node);
    scope.originalFragmentValues = scope.originalFragmentNodes.map(
      (node) => node.nodeValue,
    );
    scope.originalFragmentElements = [...paragraph.children];
    scope.originalFragmentChildren = scope.originalFragmentElements.map(
      (element) => [...element.childNodes],
    );
    scope.translationWrites = 0;
    new MutationObserver((records) => {
      scope.translationWrites += records.filter(
        (record) => record.type === "characterData",
      ).length;
    }).observe(paragraph, { characterData: true, subtree: true });
  });
  const source = await sendPage<{ nodes: SourceNode[] }>({
    type: "glimpselet:text-nodes",
  });
  expect(source.nodes.map(({ text }) => text)).toEqual([
    "この記事は",
    "検証可能",
    "な",
    "参考文献や出典",
    "が全く示されていないか、不十分です。",
  ]);
  return source.nodes;
}

function translatedFragments(source: SourceNode[]) {
  const text = [
    "This article ",
    "does not cite ",
    "",
    "any sources",
    " or has insufficient citations.",
  ];
  return source.map((node, index) =>
    index === 2
      ? { id: node.id, omit: true }
      : { id: node.id, text: text[index] },
  );
}

async function applyResponse(raw: string, source: SourceNode[]) {
  return harness.evaluate(
    async ({ raw, source, tabId }) => {
      const nodes = (
        window as HarnessWindow
      ).GlimpseletTest.parseTranslationBatch(
        raw,
        new Map(source.map(({ id, text }) => [id, text])),
      );
      if (!nodes.length) return { accepted: false, nodes };
      const applied = await chrome.tabs.sendMessage(tabId, {
        type: "glimpselet:translate",
        nodes,
      });
      return { accepted: true, nodes, applied };
    },
    { raw, source, tabId },
  );
}

async function fragmentSnapshot() {
  return site.evaluate(() => {
    const scope = window as FixtureWindow;
    const paragraph = document.querySelector("#fragments")!;
    return {
      values: scope.originalFragmentNodes.map((node) => node.nodeValue),
      connected: scope.originalFragmentNodes.every((node) => node.isConnected),
      sameElements: scope.originalFragmentElements.every(
        (element, index) => paragraph.children[index] === element,
      ),
      sameChildren: scope.originalFragmentChildren.every(
        (children, index) =>
          children.length ===
            scope.originalFragmentElements[index].childNodes.length &&
          children.every(
            (node, child) =>
              scope.originalFragmentElements[index].childNodes[child] === node,
          ),
      ),
      tags: [...paragraph.children].map((element) => element.tagName),
      links: [...paragraph.querySelectorAll("a")].map((element) =>
        element.getAttribute("href"),
      ),
      writes: scope.translationWrites,
      text: paragraph.textContent,
      width: getComputedStyle(paragraph).width,
      lineHeight: getComputedStyle(paragraph).lineHeight,
    };
  });
}

test("explicit grammatical omission preserves inline nodes and exact restore", async () => {
  const source = await prepareFragments();
  const original = await fragmentSnapshot();
  const applied = await applyResponse(
    JSON.stringify({ nodes: translatedFragments(source) }),
    source,
  );
  expect(applied.accepted).toBe(true);
  expect(applied.nodes).toHaveLength(source.length);
  expect(applied.nodes[2]).toEqual({ id: source[2].id, text: "", omit: true });
  expect(applied.applied).toMatchObject({
    applied: 5,
    changed: 5,
    rejected: 0,
  });
  const translated = await fragmentSnapshot();
  expect(translated).toMatchObject({
    text: " \nThis article does not cite any sources or has insufficient citations.\t ",
    connected: true,
    sameElements: true,
    sameChildren: true,
    tags: original.tags,
    links: original.links,
    width: original.width,
    lineHeight: original.lineHeight,
  });
  expect(translated.values[3]).toBe("");
  expect(await sendPage({ type: "glimpselet:restore" })).toEqual({
    restored: 5,
  });
  const restored = await fragmentSnapshot();
  expect(restored).toMatchObject({
    values: original.values,
    text: original.text,
    connected: true,
    sameElements: true,
    sameChildren: true,
    tags: original.tags,
    links: original.links,
    width: original.width,
    lineHeight: original.lineHeight,
  });
  await expect(site.locator("[data-glimpselet-translated]")).toHaveCount(0);
});

test("malformed translation batches fail before any content writes", async () => {
  const source = await prepareFragments();
  const original = await fragmentSnapshot();
  const valid = translatedFragments(source);
  const malformed: Array<[string, string]> = [
    ["invalid JSON", "{nodes:"],
    ["missing ID", JSON.stringify({ nodes: valid.slice(0, -1) })],
    [
      "duplicate ID",
      JSON.stringify({ nodes: [valid[0], ...valid.slice(0, -1)] }),
    ],
    [
      "unknown ID",
      JSON.stringify({
        nodes: valid.map((node, i) =>
          i === 4 ? { id: "unknown", text: "invented" } : node,
        ),
      }),
    ],
    [
      "wrong text type",
      JSON.stringify({
        nodes: valid.map((node, i) =>
          i === 4 ? { id: node.id, text: null } : node,
        ),
      }),
    ],
    [
      "implicit whitespace omission",
      JSON.stringify({
        nodes: valid.map((node, i) =>
          i === 2 ? { id: node.id, text: " " } : node,
        ),
      }),
    ],
    [
      "ambiguous explicit omission",
      JSON.stringify({
        nodes: valid.map((node, i) =>
          i === 2 ? { id: node.id, text: "", omit: true } : node,
        ),
      }),
    ],
    [
      "oversized output",
      JSON.stringify({
        nodes: valid.map((node, i) =>
          i === 4 ? { id: node.id, text: "x".repeat(12_001) } : node,
        ),
      }),
    ],
  ];
  for (const [name, raw] of malformed) {
    await test.step(name, async () => {
      expect(await applyResponse(raw, source)).toEqual({
        accepted: false,
        nodes: [],
      });
      expect(await fragmentSnapshot()).toEqual(original);
    });
  }
  expect(original.writes).toBe(0);
  await expect(site.locator("[data-glimpselet-translated]")).toHaveCount(0);
});
