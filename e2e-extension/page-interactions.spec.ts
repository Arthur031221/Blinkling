import { launchExtensionContext } from "./browser";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { mkdtemp, rm, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import type { PageContext } from "../extension/page-context";
import en from "../extension/locales/en.json" with { type: "json" };
import zhTW from "../extension/locales/zh-TW.json" with { type: "json" };

let server: Server, context: BrowserContext, site: Page, worker: Worker;
let directory: string, origin: string, tabId: number;
let testExtension: string;
type Harness = Pick<
  typeof import("../extension/capture"),
  "getGuideContext" | "getPageContext" | "captureWeb" | "setCurrentActiveTab"
> &
  Pick<typeof import("../extension/api"), "buildGuidePrompt" | "askAnthropic">;
type HarnessWindow = Window & {
  GlimpseletTest: Harness;
  guideWaiting?: boolean;
  releaseGuide?: () => void;
};
type SentMessage = {
  type: string;
  text?: string;
  action?: string;
  rect?: number[];
};
type MessageLog = { glimpseletTestMessages?: SentMessage[] };

test.beforeAll(async () => {
  testExtension = await mkdtemp(
    join(tmpdir(), "glimpselet-interaction-extension-"),
  );
  await cp(resolve("dist-extension"), testExtension, { recursive: true });
  await build({
    stdin: {
      contents:
        'export { getGuideContext, getPageContext, captureWeb, setCurrentActiveTab } from "./capture"; export { buildGuidePrompt, askAnthropic } from "./api";',
      resolveDir: resolve("extension"),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "GlimpseletTest",
    outfile: join(testExtension, "interaction-harness.js"),
  });
  await writeFile(
    join(testExtension, "interaction-harness.html"),
    '<script src="interaction-harness.js"></script>',
  );
});

test.afterAll(async () => {
  if (testExtension) await rm(testExtension, { recursive: true, force: true });
});

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "glimpselet-page-interactions-"));
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/opaque") {
      response.end(
        "<p>EXCLUDED_EMBED_SECRET</p><button>Embedded control</button>",
      );
      return;
    }
    response.end(`<style>body{height:1800px}button{margin:20px}#app{position:absolute;left:300px;top:200px;width:600px;height:450px;background:#eee}</style>
      <button id="previous">Previous focus</button><button>Time range</button><button>Share dashboard</button><button>Export dashboard</button><div id="app">Drag surface</div>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  const extension = testExtension;
  context = await launchExtensionContext(join(directory, "profile"), {
    headless: false,
    viewport: { width: 1100, height: 780 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
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
  await worker.evaluate(() => {
    const log = globalThis as typeof globalThis & MessageLog;
    log.glimpseletTestMessages = [];
    chrome.runtime.onMessage.addListener((message: SentMessage) => {
      log.glimpseletTestMessages!.push(message);
    });
  });
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

async function openHarness() {
  const harness = await context.newPage();
  await harness.goto(
    `chrome-extension://${new URL(worker.url()).host}/interaction-harness.html`,
  );
  await harness.evaluate(
    (id) => (window as HarnessWindow).GlimpseletTest.setCurrentActiveTab(id),
    tabId,
  );
  return harness;
}

async function grantActiveTabCapture() {
  // A real toolbar gesture grants activeTab; host access alone cannot take pixels.
  await site.bringToFront();
  const session = await context.browser()!.newBrowserCDPSession();
  try {
    const { targetInfos } = await session.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const target = targetInfos.find((target) => target.url === site.url());
    if (!target) throw new Error("Missing public-page tab");
    const opened = context.waitForEvent("page");
    await session.send("Extensions.triggerAction", {
      id: new URL(worker.url()).host,
      targetId: target.targetId,
    });
    await (await opened).close();
  } finally {
    await session.detach();
  }
  await site.bringToFront();
}

async function openGuide() {
  const page = await sendPage<PageContext>({ type: "glimpselet:context" });
  await site.locator("#previous").focus();
  const steps = page.elements
    .filter((element) => element.text !== "Previous focus")
    .map((element, index) => ({
      elementId: element.id,
      note: `Step ${index + 1}`,
    }));
  expect(await sendPage({ type: "glimpselet:guide", steps })).toEqual({
    ok: true,
  });
}

async function readGuideLayout(targetId: string) {
  // A scroll/resize redraw replaces the guide nodes. Read one connected layout
  // in a single browser task instead of mixing bounds from different renders.
  return site.evaluate((targetId) => {
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )?.shadowRoot;
    const card = root?.querySelector<HTMLElement>(".guide");
    const note = card?.querySelector<HTMLParagraphElement>("p");
    const target = document.querySelector(targetId);
    if (!card?.isConnected || !note?.isConnected || !target?.isConnected)
      return null;
    const buttons = Array.from(card.querySelectorAll("nav button"));
    if (buttons.some((button) => !button.isConnected)) return null;
    const bounds = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      card: bounds(card),
      passage: bounds(note),
      lineHeight: parseFloat(getComputedStyle(note).lineHeight),
      buttons: buttons.map(bounds),
      target: bounds(target),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, targetId);
}

async function expectGuidePlacement(targetId: string) {
  const sample: { current: Awaited<ReturnType<typeof readGuideLayout>> } = {
    current: null,
  };
  await expect
    .poll(async () => {
      const layout = await readGuideLayout(targetId);
      sample.current = layout;
      if (!layout) return false;
      const { card, passage, target, viewport, lineHeight, buttons } = layout;
      const inViewport =
        card.x >= 0 &&
        card.y >= 0 &&
        card.x + card.width <= viewport.width &&
        card.y + card.height <= viewport.height;
      const clearOfTarget =
        card.x + card.width <= target.x ||
        card.x >= target.x + target.width ||
        card.y + card.height <= target.y ||
        card.y >= target.y + target.height;
      const contains = (bounds: typeof passage) =>
        bounds.x >= card.x &&
        bounds.y >= card.y &&
        bounds.x + bounds.width <= card.x + card.width &&
        bounds.y + bounds.height <= card.y + card.height;
      const positive = (bounds: typeof passage) =>
        bounds.width > 0 && bounds.height > 0;
      return (
        positive(card) &&
        positive(passage) &&
        positive(target) &&
        inViewport &&
        clearOfTarget &&
        Number.isFinite(lineHeight) &&
        lineHeight > 0 &&
        passage.height >= lineHeight &&
        contains(passage) &&
        buttons.length === 3 &&
        buttons.every(positive) &&
        buttons.every(contains)
      );
    })
    .toBe(true);
  return sample.current!;
}

for (const hiddenBy of ["display", "offscreen"] as const) {
  test(`explicit public reading and Shift crop exclude a ${hiddenBy} opaque tracker while automatic reads stay blocked`, async () => {
    await site.evaluate(
      ({ url, hiddenBy }) => {
        document.body.innerHTML =
          '<h1>Public product</h1><p>Travel tumbler: 350 ml, ¥2,290</p><button>Buy</button><iframe id="tracker"></iframe>';
        const frame = document.querySelector<HTMLIFrameElement>("#tracker")!;
        frame.src = url.replace("127.0.0.1", "localhost") + "/opaque";
        frame.style.cssText =
          hiddenBy === "display"
            ? "display:none"
            : "position:absolute;top:1800px;left:0;width:4px;height:4px;border:0";
      },
      { url: origin, hiddenBy },
    );
    await expect
      .poll(
        async () =>
          (await sendPage<PageContext>({ type: "glimpselet:context" }))
            .hasPassword,
      )
      .toBe(true);
    const harness = await openHarness();
    const read = () =>
      harness.evaluate(() =>
        (window as HarnessWindow).GlimpseletTest.getPageContext(true),
      );
    const publicPage = await read();
    expect(publicPage).toMatchObject({
      hasPassword: false,
      text: "Public product Travel tumbler: 350 ml, ¥2,290 Buy",
      textScope: "top-document-text",
      excludedEmbeds: 1,
    });
    expect(publicPage).not.toHaveProperty("guideScope");
    expect(JSON.stringify(publicPage)).not.toContain("EXCLUDED_EMBED_SECRET");
    const translation = await sendPage<{ nodes: Array<{ text: string }> }>({
      type: "glimpselet:text-nodes",
    });
    expect(translation.nodes.map((node) => node.text).join(" ")).toContain(
      "350 ml",
    );
    expect(JSON.stringify(translation)).not.toContain("EXCLUDED_EMBED_SECRET");
    await expect(
      harness.evaluate(() =>
        (window as HarnessWindow).GlimpseletTest.getPageContext(),
      ),
    ).rejects.toThrow("password_page");
    await site.bringToFront();
    await site.keyboard.down("Shift");
    await site.waitForTimeout(100);
    await site.mouse.move(360, 250);
    await site.mouse.down();
    await site.mouse.move(660, 450, { steps: 12 });
    await site.mouse.up();
    await site.keyboard.up("Shift");
    await expect(
      site.locator("[data-glimpselet-crop] .selection"),
    ).toBeVisible();
    await site.keyboard.press("Escape");
    await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
    await grantActiveTabCapture();
    const captured = await harness.evaluate(() =>
      (window as HarnessWindow).GlimpseletTest.captureWeb("visible"),
    );
    expect(captured.capture.image).toMatch(/^data:image\/png;base64,/);
    const expectedPixelPage = { ...publicPage };
    delete expectedPixelPage.textScope;
    expect(captured.page).toEqual(expectedPixelPage);
    expect(captured.page).not.toHaveProperty("textScope");
    await expect(
      harness.evaluate(() =>
        (window as HarnessWindow).GlimpseletTest.captureWeb("full"),
      ),
    ).rejects.toThrow("password_page");

    // A text-only exception never admits a visible uninspectable image.
    await site.evaluate(() => {
      document.querySelector<HTMLIFrameElement>("#tracker")!.style.cssText =
        "position:absolute;left:100px;top:150px;width:300px;height:150px";
    });
    expect((await read())?.hasPassword).toBe(false);
    await expect(
      harness.evaluate(() =>
        (window as HarnessWindow).GlimpseletTest.captureWeb("visible"),
      ),
    ).rejects.toThrow("password_page");
    expect(
      await sendPage({ type: "glimpselet:select", mode: "region" }),
    ).toEqual({ error: "password_page" });
    await site.keyboard.down("Shift");
    await site.waitForTimeout(350);
    await site.keyboard.up("Shift");
    await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
    await site.evaluate(() =>
      document.body.insertAdjacentHTML(
        "beforeend",
        '<input type="password" hidden>',
      ),
    );
    await expect(read()).rejects.toThrow("password_page");
    expect(await sendPage({ type: "glimpselet:text-nodes" })).toEqual({
      error: "password_page",
    });
    await site
      .locator('input[type="password"]')
      .evaluate((input) => input.remove());
    await worker.evaluate(() =>
      chrome.storage.local.set({ blocklist: ["127.0.0.1"] }),
    );
    await expect(read()).rejects.toThrow("blocked_page");
  });
}

test("explicit guides exclude cross-origin embeds while strict reading stays blocked", async () => {
  await site.evaluate((url) => {
    document.body.innerHTML =
      "<h1>Public dashboard</h1><button>Export</button><iframe></iframe><object><p>UNCHECKED_FALLBACK</p><button>UNCHECKED_CONTROL</button></object>";
    document.querySelector("iframe")!.src = url.replace(
      "127.0.0.1",
      "localhost",
    );
  }, origin);
  await expect
    .poll(
      async () =>
        (await sendPage<PageContext>({ type: "glimpselet:context" }))
          .hasPassword,
    )
    .toBe(true);
  const guide = await sendPage<PageContext>({
    type: "glimpselet:guide-context",
  });
  expect(guide.hasPassword).toBe(false);
  expect(guide.text).toBe("Public dashboard Export");
  expect(guide.elements.map((element) => element.text)).toEqual([
    "Public dashboard",
    "Export",
  ]);
  expect(guide.guideScope).toBe("top-document-text");
  expect(guide.excludedEmbeds).toBe(2);
  expect(JSON.stringify(guide)).not.toContain("UNCHECKED");
  expect(
    await sendPage({
      type: "glimpselet:guide",
      documentKey: guide.documentKey,
      url: guide.url,
      steps: [{ elementId: guide.elements[1].id, note: "Export here" }],
    }),
  ).toEqual({ ok: true });
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toBeVisible();
  await site.evaluate(() =>
    document.body.insertAdjacentHTML("beforeend", '<input type="password">'),
  );
  expect(await sendPage({ type: "glimpselet:guide-context" })).toEqual({
    error: "password_page",
  });
  expect(
    await sendPage({
      type: "glimpselet:guide",
      steps: [{ elementId: guide.elements[1].id, note: "Export here" }],
    }),
  ).toEqual({ error: "password_page" });
});

test("explicit guide provider payload contains top-document text and no unchecked pixels", async () => {
  await site.evaluate((url) => {
    document.body.innerHTML =
      "<h1>Public dashboard</h1><button>Export</button><iframe></iframe>";
    document.querySelector("iframe")!.src = url.replace(
      "127.0.0.1",
      "localhost",
    );
  }, origin);
  const harness = await openHarness();
  const guide = await harness.evaluate(() =>
    (window as HarnessWindow).GlimpseletTest.getGuideContext(),
  );
  expect(guide.text).toBe("Public dashboard Export");
  await expect(
    harness.evaluate(() =>
      (window as HarnessWindow).GlimpseletTest.getPageContext(),
    ),
  ).rejects.toThrow("password_page");
  await expect(
    harness.evaluate(() =>
      (window as HarnessWindow).GlimpseletTest.captureWeb("visible"),
    ),
  ).rejects.toThrow("password_page");
  const payloads: unknown[] = [];
  await context.route(
    "https://api.anthropic.com/v1/messages",
    async (route) => {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Guide ready"}}\n\ndata: {"type":"message_stop"}\n\n',
      });
    },
  );
  await harness.evaluate(async (page) => {
    const api = (window as HarnessWindow).GlimpseletTest;
    return api.askAnthropic(
      {
        id: "explicit-guide",
        question: api.buildGuidePrompt("Where is Export?", page),
        kind: "guide",
        model: "sonnet",
        effort: "low",
        page,
      },
      "test-key",
      () => {},
      new AbortController().signal,
    );
  }, guide);
  expect(payloads).toHaveLength(1);
  expect(JSON.stringify(payloads[0])).toContain("Public dashboard");
  expect(JSON.stringify(payloads[0])).not.toContain('"type":"image"');
  expect(JSON.stringify(payloads[0])).not.toContain("Drag surface"); // Text in the unchecked frame.
  await worker.evaluate(() =>
    chrome.storage.local.set({ blocklist: ["127.0.0.1"] }),
  );
  await expect(
    harness.evaluate(() =>
      (window as HarnessWindow).GlimpseletTest.getGuideContext(),
    ),
  ).rejects.toThrow("blocked_page");
});

for (const change of ["password", "reload"] as const) {
  test(`an explicit guide rejects a ${change} while its content read is pending`, async () => {
    const harness = await openHarness();
    await harness.evaluate(() => {
      const original = chrome.tabs.sendMessage.bind(chrome.tabs);
      const scope = window as HarnessWindow;
      const held = new Promise<void>((done) => (scope.releaseGuide = done));
      chrome.tabs.sendMessage = (async (
        ...args: Parameters<typeof chrome.tabs.sendMessage>
      ) => {
        const result = await original(...args);
        if (args[1]?.type === "glimpselet:guide-context") {
          scope.guideWaiting = true;
          await held;
        }
        return result;
      }) as typeof chrome.tabs.sendMessage;
    });
    const read = harness.evaluate(() =>
      (window as HarnessWindow).GlimpseletTest.getGuideContext(),
    );
    const rejected = expect(read).rejects.toThrow(
      change === "password" ? "password_page" : "tab_changed",
    );
    await expect
      .poll(() =>
        harness.evaluate(() => (window as HarnessWindow).guideWaiting),
      )
      .toBe(true);
    if (change === "password")
      await site.evaluate(() =>
        document.body.insertAdjacentHTML(
          "beforeend",
          '<input type="password">',
        ),
      );
    else await site.reload();
    await harness.evaluate(() => (window as HarnessWindow).releaseGuide!());
    await rejected;
  });
}

test("Escape dismisses every guide step with page handlers stopping propagation", async () => {
  await site.evaluate(() =>
    document.addEventListener("keydown", (event) => event.stopPropagation()),
  );
  for (const index of [0, 1, 2]) {
    for (const focus of ["page", "guide"]) {
      await openGuide();
      const guide = site.locator("[data-glimpselet-overlay] .guide");
      for (let i = 0; i < index; i++)
        await guide.locator('[data-guide-control="next"]').click();
      if (focus === "page") await site.locator("#previous").focus();
      else await guide.locator('[data-guide-control="next"]').focus();
      await site.keyboard.press("Escape");
      await expect(guide).toHaveCount(0);
      await expect(
        site.locator("[data-glimpselet-overlay] svg.draw"),
      ).toHaveCount(0);
      await expect(site.locator("#previous")).toBeFocused();
    }
  }
});

test("Close guide is accessible on every step and retains focus through layout changes", async () => {
  for (const index of [0, 1, 2]) {
    await openGuide();
    const guide = site.locator("[data-glimpselet-overlay] .guide");
    for (let i = 0; i < index; i++)
      await guide.locator('[data-guide-control="next"]').click();
    const close = guide.getByRole("button", {
      name: "Close guide",
      exact: true,
    });
    await close.focus();
    await site.evaluate(() => window.scrollBy(0, 100));
    await site.setViewportSize({ width: 1050 + index * 10, height: 760 });
    await expect(close).toBeFocused();
    await close.click();
    await expect(guide).toHaveCount(0);
    await expect(site.locator("#previous")).toBeFocused();
  }
});

for (const language of ["en", "zh-TW"] as const)
  for (const height of [480, 240]) {
    test(`long ${language} guide notes keep edge targets clickable at ${height}px after scroll and resize`, async () => {
      await site.setViewportSize({ width: 320, height });
      await site.evaluate((height) => {
        document.body.innerHTML = `<style>
        body{height:1600px;margin:0}
        #export{position:absolute;left:8px;top:${height - 70}px;width:130px;height:42px;margin:0}
        #menu{position:absolute;right:8px;top:16px;width:130px;height:42px;margin:0}
        </style><div role="menu" aria-label="Drawing actions"><button id="export" role="menuitem">Export image</button></div><button id="menu">Open menu</button>`;
        for (const button of document.querySelectorAll("button"))
          button.addEventListener("click", () => {
            document.body.dataset.clicked = button.id;
          });
      }, height);
      const page = await sendPage<PageContext>({ type: "glimpselet:context" });
      const note =
        language === "en"
          ? "Choose Export image to save your drawing. Check the background, scale, and selected elements before downloading. ".repeat(
              4,
            )
          : "按下匯出圖片即可儲存你的繪圖。下載前請檢查背景、比例以及選取的元素。你可以返回上一步確認設定，再繼續完成操作。".repeat(
              6,
            );
      expect(
        await sendPage({
          type: "glimpselet:guide",
          steps: page.elements
            .filter(
              (element) =>
                element.role === "menuitem" || element.text === "Open menu",
            )
            .map((element) => ({
              elementId: element.id,
              note,
            })),
          labels:
            language === "en"
              ? {
                  next: "Next step",
                  back: "Previous step",
                  close: "Close guide",
                  done: "Finish tour",
                }
              : {
                  next: "前往下一步",
                  back: "返回上一步",
                  close: "關閉導覽",
                  done: "完成導覽",
                },
        }),
      ).toEqual({ ok: true });
      const guide = site.locator("[data-glimpselet-overlay] .guide");
      const checkPlacement = async (targetId: string) => {
        const { card, passage, lineHeight, buttons } =
          await expectGuidePlacement(targetId);
        const passageNote = guide.locator("p");
        expect(Number.isFinite(lineHeight)).toBe(true);
        expect(passage.height).toBeGreaterThanOrEqual(lineHeight);
        expect(passage.x).toBeGreaterThanOrEqual(card.x);
        expect(passage.y).toBeGreaterThanOrEqual(card.y);
        expect(passage.x + passage.width).toBeLessThanOrEqual(
          card.x + card.width,
        );
        expect(passage.y + passage.height).toBeLessThanOrEqual(
          card.y + card.height,
        );
        for (const bounds of buttons) {
          expect(bounds.x).toBeGreaterThanOrEqual(card.x);
          expect(bounds.y).toBeGreaterThanOrEqual(card.y);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            card.x + card.width,
          );
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(
            card.y + card.height,
          );
        }
        if (
          await passageNote.evaluate(
            (note) => note.scrollHeight > note.clientHeight,
          )
        ) {
          await passageNote.hover();
          const pageScroll = await site.evaluate(() => scrollY);
          await site.mouse.wheel(0, 5000);
          await expect
            .poll(() => passageNote.evaluate((note) => note.scrollTop))
            .toBeGreaterThan(0);
          expect(await site.evaluate(() => scrollY)).toBe(pageScroll);
        }
        await site.locator(targetId).click({ timeout: 2000 });
        await expect(site.locator("body")).toHaveAttribute(
          "data-clicked",
          targetId.slice(1),
        );
      };
      await checkPlacement("#export");
      await site.setViewportSize({ width: 280, height });
      await checkPlacement("#export");
      await site.evaluate(() => window.scrollBy(0, 60));
      await checkPlacement("#export");
      await guide.locator('[data-guide-control="next"]').click();
      await checkPlacement("#menu");
      await guide.locator('[data-guide-control="back"]').click();
      await checkPlacement("#export");
    });
  }

for (const [language, labels, wideControls] of [
  ["en", en, false],
  ["zh-TW", zhTW, false],
  ["en", en, true],
] as const) {
  test(`the observed Excalidraw menu target stays clickable with long ${language} notes${wideControls ? " and wide control lettering" : ""} at 320x240`, async () => {
    await site.setViewportSize({ width: 320, height: 240 });
    await site.evaluate(() => {
      // This is the actual menuitem rectangle observed in the live smoke test.
      document.body.innerHTML = `<style>
        body{height:1600px;margin:0}
        #export{position:absolute;left:20px;top:126px;width:212px;height:32px;margin:0}
        #settings{position:absolute;left:20px;top:360px;width:130px;height:32px;margin:0}
        </style><div role="menu" aria-label="Drawing actions"><button id="export" role="menuitem">Export image</button></div><button id="settings">Export settings</button>`;
      document.querySelector("#export")!.addEventListener("click", () => {
        document.body.dataset.clicked = "export";
      });
    });
    const target = site.getByRole("menuitem", {
      name: "Export image",
      exact: true,
    });
    expect(await target.boundingBox()).toEqual({
      x: 20,
      y: 126,
      width: 212,
      height: 32,
    });
    const page = await sendPage<PageContext>({ type: "glimpselet:context" });
    const element = page.elements.find(
      (element) => element.role === "menuitem",
    );
    const settings = page.elements.find(
      (element) => element.text === "Export settings",
    );
    expect(element).toBeDefined();
    expect(settings).toBeDefined();
    const note = (
      language === "en"
        ? "Choose Export image to save your drawing. Check the background, scale, and selected elements before downloading. ".repeat(
            4,
          )
        : "按下匯出圖片即可儲存你的繪圖。下載前請檢查背景、比例以及選取的元素。你可以返回上一步確認設定，再繼續完成操作。".repeat(
            6,
          )
    )
      .trim()
      .slice(0, 360);
    expect(
      await sendPage({
        type: "glimpselet:guide",
        steps: [
          { elementId: element!.id, note },
          { elementId: settings!.id, note },
        ],
        labels: {
          next: labels.next,
          back: labels.back,
          close: labels.guideClose,
          done: labels.guideDone,
          title: labels.guideAction,
        },
      }),
    ).toEqual({ ok: true });
    if (wideControls) {
      await site.evaluate(() => {
        const root = document.querySelector(
          "[data-glimpselet-overlay]",
        )!.shadowRoot!;
        const style = document.createElement("style");
        style.textContent = ".guide button{font-family:monospace}";
        root.append(style);
        window.dispatchEvent(new Event("resize"));
      });
    }
    const guide = site.locator("[data-glimpselet-overlay] .guide");
    const { card, passage, lineHeight, buttons, viewport } =
      await expectGuidePlacement("#export");
    expect(viewport).toEqual({ width: 320, height: 240 });
    const passageNote = guide.locator("p");
    await expect(passageNote).toHaveText(note);
    expect(Number.isFinite(lineHeight)).toBe(true);
    expect(passage.height).toBeGreaterThanOrEqual(lineHeight);
    for (const bounds of [passage, ...buttons]) {
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(card.x);
      expect(bounds!.y).toBeGreaterThanOrEqual(card.y);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        card.x + card.width,
      );
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        card.y + card.height,
      );
    }
    await expect(guide.locator("nav button")).toHaveText([
      labels.back,
      labels.next,
      labels.guideClose,
    ]);
    await passageNote.hover();
    await site.mouse.wheel(0, 5000);
    await expect
      .poll(() => passageNote.evaluate((note) => note.scrollTop))
      .toBeGreaterThan(0);
    expect(await site.evaluate(() => scrollY)).toBe(0);
    await target.click({ timeout: 2000 });
    await expect(site.locator("body")).toHaveAttribute(
      "data-clicked",
      "export",
    );
  });
}

test("the first Shift drag at 100 ms crosses activation without operating the page", async () => {
  await site.evaluate(() => {
    document.addEventListener(
      "pointerdown",
      () => (document.body.dataset.operated = "true"),
    );
    document.addEventListener("pointermove", (event) => {
      if (event.buttons) document.body.dataset.operated = "true";
    });
  });
  await site.mouse.move(748, 157);
  await site.keyboard.down("Shift");
  await site.waitForTimeout(100);
  await site.mouse.down();
  for (let i = 1; i <= 7; i++) {
    await site.waitForTimeout(100);
    await site.mouse.move(748 + (297 * i) / 7, 157 + (403 * i) / 7);
  }
  await site.mouse.up();
  await site.keyboard.up("Shift");
  const crop = site.locator("[data-glimpselet-crop]");
  await expect(crop.locator(".selection")).toBeVisible();
  await expect(
    crop.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  expect(await crop.locator(".selection").boundingBox()).toEqual({
    x: 748,
    y: 157,
    width: 297,
    height: 403,
  });
  expect(await site.locator("body").getAttribute("data-operated")).toBeNull();
  await crop.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(crop).toHaveCount(0);
});

for (const [rule, css] of [
  ["empty", "div:empty { display: none }"],
  ["root", "html > div { display: none !important }"],
] as const)
  for (const mode of ["shift", "region"] as const) {
    test(`${mode} crop remains visible and intercepts dragging when page CSS hides ${rule} divs`, async () => {
      await site.addStyleTag({
        content: css,
      });
      await site.evaluate(() => {
        document.addEventListener("pointerdown", () => {
          document.body.dataset.operated = "true";
        });
        document.addEventListener("pointermove", (event) => {
          if (event.buttons) document.body.dataset.operated = "true";
        });
      });
      let selected:
        | Promise<{ rect?: number[]; cancelled?: boolean }>
        | undefined;
      if (mode === "region") {
        selected = sendPage({ type: "glimpselet:select", mode: "region" });
        // Closing a failed test's tab also closes this pending selection channel.
        void selected.catch(() => undefined);
      } else {
        await site.keyboard.down("Shift");
        await site.waitForTimeout(250);
      }
      const crop = site.locator("[data-glimpselet-crop]");
      await expect(crop.locator(".surface")).toBeVisible();
      expect(await crop.boundingBox()).toEqual(
        await site.evaluate(() => ({
          x: 0,
          y: 0,
          width: document.documentElement.clientWidth,
          height: innerHeight,
        })),
      );
      await site.mouse.move(500, 300);
      await site.mouse.down();
      await site.mouse.move(750, 480, { steps: 12 });
      await site.mouse.up();
      if (mode === "shift") await site.keyboard.up("Shift");
      await expect(crop.locator(".selection")).toBeVisible();
      expect(await crop.locator(".selection").boundingBox()).toEqual({
        x: 500,
        y: 300,
        width: 250,
        height: 180,
      });
      expect(
        await site.locator("body").getAttribute("data-operated"),
      ).toBeNull();
      await crop.getByRole("button", { name: "Confirm", exact: true }).click();
      if (selected)
        expect(await selected).toEqual({ rect: [500, 300, 250, 180] });
      else
        await expect
          .poll(async () =>
            worker.evaluate(() =>
              (
                globalThis as typeof globalThis & MessageLog
              ).glimpseletTestMessages!.filter(
                (message) => message.type === "glimpselet:crop-selected",
              ),
            ),
          )
          .toEqual([
            expect.objectContaining({
              type: "glimpselet:crop-selected",
              rect: [500, 300, 250, 180],
            }),
          ]);
      await expect(crop).toHaveCount(0);
    });
  }

test("slow Shift hold, cancellation and re-entry leave one usable crop", async () => {
  for (const delay of [350, 100, 350]) {
    await site.keyboard.down("Shift");
    await site.waitForTimeout(delay);
    await site.mouse.move(350, 250);
    await site.mouse.down();
    await site.mouse.move(650, 450, { steps: 12 });
    await site.mouse.up();
    await site.keyboard.up("Shift");
    const crop = site.locator("[data-glimpselet-crop]");
    await expect(crop).toHaveCount(1);
    await expect(
      crop.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeEnabled();
    await site.keyboard.press("Escape");
    await expect(crop).toHaveCount(0);
  }
});

test("Shift typing, Tab, modifier shortcuts, editable targets and disabled mode stay on the page", async () => {
  for (const key of ["Tab", "A", "Control", "Alt", "Meta"]) {
    await site.locator("#previous").focus();
    await site.keyboard.down("Shift");
    await site.keyboard.press(key);
    await site.waitForTimeout(250);
    await site.keyboard.up("Shift");
    await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
  }
  await site.evaluate(() => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.id = "editor";
    editable.textContent = "Draft";
    document.body.append(editable);
    editable.focus();
  });
  await site.keyboard.down("Shift");
  await site.waitForTimeout(100);
  await site.locator("#editor").click({ modifiers: ["Shift"] });
  await site.waitForTimeout(250);
  await site.keyboard.up("Shift");
  await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
  await worker.evaluate(() =>
    chrome.storage.local.set({ shiftCropEnabled: false }),
  );
  await site.locator("#previous").focus();
  await site.keyboard.down("Shift");
  await site.waitForTimeout(100);
  await site.mouse.click(400, 300);
  await site.waitForTimeout(250);
  await site.keyboard.up("Shift");
  await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
});

test("selection actions keep rendered line breaks and words split across spans", async () => {
  await site.evaluate(() => {
    document.body.innerHTML =
      '<p id="passage"><span>instead</span><br><span>relying on </span><span>trans</span><span>formations</span> <b>and ordinary inline text.</b></p>';
  });
  for (const action of ["Ask", "Explain", "Translate"]) {
    const expected = await site.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#passage")!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return getSelection()!.toString().trim();
    });
    expect(expected).toBe(
      "instead\nrelying on transformations and ordinary inline text.",
    );
    await site
      .locator("[data-glimpselet-overlay] .popover")
      .getByRole("button", { name: action, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          await worker.evaluate(() => {
            return (globalThis as typeof globalThis & MessageLog)
              .glimpseletTestMessages!.filter(
                (message) => message.type === "glimpselet:selection",
              )
              .at(-1);
          }),
      )
      .toMatchObject({ text: expected, action: action.toLowerCase() });
  }
});

function selectionPdf(): Buffer {
  const stream =
    "BT /F1 14 Tf 50 720 Td (In this work we propose the Transformer.) Tj 0 -24 Td (This multiline passage checks word boundaries.) Tj 0 -24 Td (Use the rendered text instead) Tj 0 -24 Td (relying on concatenated DOM text.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
}

test("bundled PDF.js reader selection actions preserve the rendered multiline passage", async () => {
  const id = new URL(worker.url()).host;
  await site.goto(`chrome-extension://${id}/reader.html`);
  await site.locator("#file").setInputFiles({
    name: "multiline.pdf",
    mimeType: "application/pdf",
    buffer: selectionPdf(),
  });
  const spans = site.locator(".pdf-text-layer span");
  await expect(spans).toHaveCount(4);
  for (const action of ["Ask", "Explain", "Translate"]) {
    const expected = await site.evaluate(() => {
      const spans = document.querySelectorAll(".pdf-text-layer span");
      const range = document.createRange();
      range.setStart(spans[0].firstChild!, 0);
      range.setEnd(spans[3].firstChild!, spans[3].textContent!.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return getSelection()!.toString().trim();
    });
    expect(expected).toContain("instead\nrelying");
    await site
      .locator("[data-glimpselet-overlay] .popover")
      .getByRole("button", { name: action, exact: true })
      .click();
    await expect
      .poll(() =>
        worker.evaluate(() =>
          (globalThis as typeof globalThis & MessageLog)
            .glimpseletTestMessages!.filter(
              (message) => message.type === "glimpselet:selection",
            )
            .at(-1),
        ),
      )
      .toMatchObject({ text: expected, action: action.toLowerCase() });
  }
});

async function selectGuidePassage(kind: "webpage" | "reader") {
  return site.evaluate((kind) => {
    const range = document.createRange();
    if (kind === "reader") {
      const spans = document.querySelectorAll(".pdf-text-layer span");
      range.setStart(spans[0].firstChild!, 0);
      range.setEnd(
        spans[spans.length - 1].firstChild!,
        spans[spans.length - 1].textContent!.length,
      );
    } else range.selectNodeContents(document.querySelector("#passage")!);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString().trim();
  }, kind);
}

for (const kind of ["webpage", "reader"] as const) {
  test(`${kind} selection tools yield to guide navigation and work again after close`, async () => {
    if (kind === "reader") {
      const id = new URL(worker.url()).host;
      await site.goto(`chrome-extension://${id}/reader.html`);
      await site.locator("#file").setInputFiles({
        name: "guided-section.pdf",
        mimeType: "application/pdf",
        buffer: selectionPdf(),
      });
      await expect(site.locator(".pdf-text-layer span")).toHaveCount(4);
    } else {
      await site.evaluate(() => {
        document.body.innerHTML =
          '<main><h2>Attention section</h2><p id="passage">This selected section explains <span>trans</span><span>formations</span><br>and attention weights.</p><button>Compare attention heads</button><button>Read the next section</button></main>';
      });
    }

    const expected = await selectGuidePassage(kind);
    expect(expected).toContain("\n");
    const popover = site.locator("[data-glimpselet-overlay] .popover");
    await expect(popover).toBeVisible();
    const page = await sendPage<PageContext>({
      type: "glimpselet:guide-context",
    });
    const steps = page.elements.slice(0, 3).map((element, index) => ({
      elementId: element.id,
      note: `Guide the selected passage: step ${index + 1}`,
    }));
    expect(steps.length).toBe(3);
    const guide = site.locator("[data-glimpselet-overlay] .guide");
    const expectSelection = async () => {
      expect(await site.evaluate(() => getSelection()!.toString().trim())).toBe(
        expected,
      );
    };
    const startGuide = async () => {
      expect(await sendPage({ type: "glimpselet:guide", steps })).toEqual({
        ok: true,
      });
      await expect(guide).toBeVisible();
      await expect(popover).toHaveCount(0);
      await expectSelection();
    };
    await startGuide();

    const checkStep = async (index: number) => {
      await expect(guide.locator("p")).toHaveText(steps[index].note);
      await expect(guide.locator('[data-guide-control="next"]')).toBeVisible();
      await expect(guide.locator('[data-guide-control="back"]')).toBeVisible();
      await site.evaluate(() =>
        document.dispatchEvent(new Event("selectionchange")),
      );
      // Wait beyond the content script's delay so a resurrected toolbar is seen.
      await site.waitForTimeout(80);
      await expect(popover).toHaveCount(0);
      await expectSelection();
    };
    for (let index = 0; index < steps.length; index++) {
      await checkStep(index);
      if (index + 1 < steps.length)
        await guide.locator('[data-guide-control="next"]').click();
    }
    for (let index = steps.length - 2; index >= 0; index--) {
      await guide.locator('[data-guide-control="back"]').click();
      await checkStep(index);
    }
    await guide.locator('[data-guide-control="close"]').click();
    await expect(guide).toHaveCount(0);
    await expectSelection();

    // Queue a toolbar before guide start and close the guide before its delay.
    // The old selection callback must remain canceled after the guide is gone.
    await site.evaluate(() =>
      document.dispatchEvent(new Event("selectionchange")),
    );
    await startGuide();
    await guide
      .locator('[data-guide-control="close"]')
      .evaluate((button) => (button as HTMLButtonElement).click());
    await site.waitForTimeout(80);
    await expect(guide).toHaveCount(0);
    await expect(popover).toHaveCount(0);
    await expectSelection();

    for (const action of ["Explain", "Translate", "Ask"]) {
      expect(await selectGuidePassage(kind)).toBe(expected);
      await popover.getByRole("button", { name: action, exact: true }).click();
      await expect
        .poll(() =>
          worker.evaluate(() =>
            (globalThis as typeof globalThis & MessageLog)
              .glimpseletTestMessages!.filter(
                (message) => message.type === "glimpselet:selection",
              )
              .at(-1),
          ),
        )
        .toMatchObject({ text: expected, action: action.toLowerCase() });
      await expect(popover).toHaveCount(0);
      await expectSelection();
    }
  });
}
