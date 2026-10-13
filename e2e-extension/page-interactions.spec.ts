import {
  test,
  expect,
  chromium,
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
  server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
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
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
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
