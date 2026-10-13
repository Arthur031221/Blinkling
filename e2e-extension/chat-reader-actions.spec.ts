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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { ExtensionBridge } from "../bridge/src/extension-bridge";
import { ExtensionSessions } from "../bridge/src/extension-sessions";
import { runCliProvider } from "../bridge/src/provider-cli";
import type { AnswerProvider, ProviderRequest } from "../bridge/src/provider";
import en from "../extension/locales/en.json" with { type: "json" };

let server: Server,
  bridge: ExtensionBridge,
  context: BrowserContext,
  worker: Worker;
let panel: Page,
  site: Page,
  directory: string,
  origin: string,
  extensionId: string;
let requests: ProviderRequest[], responder: AnswerProvider;

function sectionPdf(): Buffer {
  const streams = [
    "BT /F1 18 Tf 54 720 Td (First page) Tj ET",
    "BT /F1 18 Tf 54 720 Td (Introduction) Tj 0 -32 Td (In this work we propose the Transformer.) Tj 0 -32 Td (Training takes twelve hours on eight P100 GPUs.) Tj 0 -64 Td (Background) Tj 0 -32 Td (UNRELATED_SECTION discusses recurrent networks.) Tj ET",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    ...streams.map(
      (stream) =>
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
}

test.beforeEach(async () => {
  requests = [];
  responder = (request) =>
    runCliProvider(request, {
      command: process.execPath,
      argsPrefix: [resolve("e2e-extension/mock-claude.cjs")],
    });
  directory = await mkdtemp(join(tmpdir(), "glimpselet-chat-reader-"));
  server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/paper.pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.end(sectionPdf());
    } else if (url.pathname.startsWith("/assets/")) {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".js") ? "text/javascript" : "text/html",
      );
      void readFile(resolve(`public${url.pathname}`)).then(
        (body) => res.end(body),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<title>Readable dashboard</title><h1>Dashboards</h1><button>Export</button><p>Readable page context for suggested questions.</p><a href="/dashboards" id="dashboards">Dashboards</a><script>document.querySelector("#dashboards").onclick=e=>{e.preventDefault();document.querySelector("input")?.remove();history.pushState({},"","/dashboards");document.title="Readable dashboard";document.querySelector("p").textContent="A new readable dashboard page";};</script>',
      );
    }
  });
  bridge = new ExtensionBridge(server, () => origin, {
    provider: (request) => {
      requests.push(request);
      return responder(request);
    },
    sessions: new ExtensionSessions(directory, async () => []),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  origin = `http://127.0.0.1:${address.port}`;
  const extension = resolve("dist-extension");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium",
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
  extensionId = new URL(worker.url()).host;
  await worker.evaluate(() =>
    chrome.storage.local.set({
      consented: true,
      locale: "en",
      targetLocale: "zh-TW",
      pipSize: { width: 420, height: 650 },
    }),
  );
  site = await context.newPage();
  await site.goto(origin);
  await Promise.all(
    context
      .pages()
      .filter((page) => page !== site)
      .map((page) => page.close()),
  );
  const sourceTab = await worker.evaluate(
    async (url) =>
      (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
    origin + "/",
  );
  await site.bringToFront();
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const target = targetInfos.find((target) => target.url === origin + "/");
  if (!target) throw new Error("Fixture tab target missing");
  const opened = context.waitForEvent("page");
  await browserCdp.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: target.targetId,
  });
  panel = await opened;
  await browserCdp.detach();
  await panel.goto(
    `chrome-extension://${extensionId}/panel.html?sourceTab=${sourceTab}&pairPort=${address.port}&pairCode=${bridge.issueCode()}`,
  );
  await expect(panel.locator(".connection")).toHaveClass(/online/);
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
});
test.afterEach(async () => {
  await context?.close();
  await bridge?.close();
  if (server?.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

async function openReader() {
  const reader = await context.newPage();
  await reader.goto(`chrome-extension://${extensionId}/reader.html`);
  await reader.locator("#file").setInputFiles({
    name: "sections.pdf",
    mimeType: "application/pdf",
    buffer: sectionPdf(),
  });
  await expect(reader.locator(".pdf-text-layer")).toContainText("First page");
  await reader.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(reader.locator(".pdf-text-layer")).toContainText("In this work");
  return reader;
}
async function selectIntroduction(reader: Page) {
  await reader.evaluate(() => {
    const spans = [...document.querySelectorAll(".pdf-text-layer span")];
    const first = spans.find((span) =>
      span.textContent?.startsWith("In this work"),
    )!;
    const last = spans.find((span) =>
      span.textContent?.startsWith("Training takes"),
    )!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 0);
    range.setEnd(last.firstChild!, last.textContent!.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

async function activate(page: Page) {
  await page.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const target = targetInfos.find((target) => target.url === page.url());
  if (!target) throw new Error("Activation target missing");
  await cdp.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: target.targetId,
  });
  await cdp.detach();
}

test("clears an obsolete password warning after clicking an SPA sidebar link", async () => {
  await site.evaluate(() => {
    const password = document.createElement("input");
    password.type = "password";
    document.body.append(password);
  });
  await panel.getByRole("button", { name: en.visible, exact: true }).click();
  await expect(panel.locator(".toolbar .status")).toHaveText(en.passwordPage);
  await site.getByRole("link", { name: "Dashboards", exact: true }).click();
  await expect(site).toHaveURL(origin + "/dashboards");
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
  await expect(panel.locator(".toolbar .status")).not.toHaveText(
    en.passwordPage,
  );
});

test("Guide practice has one keyboard-accessible action and keeps its step through permission recovery", async () => {
  await site.goto(origin + "/assets/glimpselet-welcome-sample.html");
  await activate(site);
  await site.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("glimpselet:tutorial-action", {
        detail: { version: 1, action: "guide", step: 5 },
      }),
    ),
  );
  await expect(panel.locator(".float-start").last()).toContainText("5/8");
  const guides = panel.getByRole("button", {
    name: en.guideAction,
    exact: true,
  });
  await expect(guides).toHaveCount(1);
  await panel.evaluate(() => {
    const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
    let denied = true;
    chrome.tabs.captureVisibleTab = ((...args: Parameters<typeof original>) => {
      if (denied) {
        denied = false;
        return Promise.reject(
          new Error(
            "Either the '<all_urls>' or 'activeTab' permission is required.",
          ),
        );
      }
      return original(...args);
    }) as typeof chrome.tabs.captureVisibleTab;
  });
  await guides.focus();
  await panel.keyboard.press("Enter");
  await expect(panel.locator(".toolbar .status")).toContainText(
    "try Guide again",
  );
  await expect(panel.locator(".float-start").last()).toContainText("5/8");
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toHaveCount(0);
  await activate(site);
  await guides.click();
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toBeVisible();
  await expect(panel.locator(".float-start").last()).not.toContainText("5/8");
  await expect(
    panel
      .locator(".capture-buttons")
      .getByRole("button", { name: en.guideAction, exact: true }),
  ).toBeVisible();
});

test("streams safe Markdown in readable narrow and wide light/dark bubbles", async () => {
  const markdown =
    '**Key points**\n\n- First point\n- Second point\n\n```js\nconst value = 1;\n```\n\n[Source](https://example.com)\n\n<img src="https://tracker.invalid/pixel" onerror="window.pwned=1"><script>window.pwned=1</script>[bad](javascript:alert(1)) ![image](https://tracker.invalid/image)';
  let finish!: () => void;
  responder = async (request) => {
    request.onText(markdown);
    await new Promise<void>((resolve) => {
      finish = resolve;
      request.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return {
      answer: markdown,
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      sessionId: request.cliSession?.id,
    };
  };
  const remote: string[] = [];
  context.on("request", (request) => {
    if (request.url().includes("tracker.invalid")) remote.push(request.url());
  });
  await panel
    .getByRole("textbox", { name: en.question })
    .fill("Explain this passage");
  await panel.locator(".send").click();
  await expect(panel.locator(".answer strong")).toHaveText("Key points");
  await expect(panel.locator(".answer li")).toHaveCount(2);
  await expect(panel.locator(".answer pre code")).toContainText("const value");
  await expect(panel.locator(".answer a").first()).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  finish();
  await expect(panel.locator(".toolbar .status")).toHaveText("Answer ready.");
  expect(requests.at(-1)?.image).toBeUndefined();
  for (const colorScheme of ["light", "dark"] as const) {
    await panel.emulateMedia({ colorScheme });
    for (const width of [320, 420, 520]) {
      await panel.setViewportSize({ width, height: 700 });
      await expect(panel.locator(".answer strong")).toBeVisible();
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  expect(remote).toEqual([]);
  await expect(
    panel.locator(
      ".answer img, .answer script, .answer [onerror], .answer a[href^='javascript:']",
    ),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: en.pin, exact: true }).click();
  await expect(
    panel.getByRole("button", { name: en.unpin, exact: true }),
  ).toBeVisible();
});
