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

test("bubble displays unavailable guide text and clears an earlier highlight", async () => {
  const original = responder;
  let unavailable = false;
  const reason =
    "I cannot reliably identify the export menu from these controls.";
  responder = async (request) => {
    if (!request.question.includes("Create a short, actionable guide"))
      return original(request);
    const target = request.page!.elements.find(
      (element) => element.text === "Export",
    )!;
    const answer = JSON.stringify(
      unavailable
        ? {
            status: "unavailable",
            reason,
            steps: [
              {
                elementId: target.id,
                note: "Unrelated highlight",
                action: "none",
              },
            ],
          }
        : {
            steps: [
              { elementId: target.id, note: "Use Export", action: "none" },
            ],
          },
    );
    request.onText(answer);
    return { answer };
  };
  const guide = panel.getByRole("button", {
    name: en.guideAction,
    exact: true,
  });
  await guide.click();
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toContainText(
    "Use Export",
  );
  await expect(site.locator("[data-glimpselet-overlay] .guide p")).toHaveText(
    "Use Export",
  );
  await expect(guide).toBeEnabled();
  unavailable = true;
  await guide.click();
  await expect(panel.locator(".message .answer").last()).toContainText(reason);
  await expect(panel.locator(".toolbar .status")).toHaveText(en.answerReady);
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toHaveCount(0);
  await expect(site.locator("[data-glimpselet-overlay] svg.draw")).toHaveCount(
    0,
  );
});

test("an unavailable PDF guide is handled without restoring its instruction into the draft", async () => {
  const reader = await openReader();
  const original = responder;
  const reason = "This PDF has no reliably identified diagram target.";
  responder = async (request) => {
    if (!request.question.includes("Create a short, actionable guide"))
      return original(request);
    const answer = JSON.stringify({
      status: "unavailable",
      reason,
      steps: [],
    });
    request.onText(answer);
    return { answer };
  };
  await reader.locator('[data-action="guide"]').click();
  await expect(panel.locator(".message .answer").last()).toContainText(reason);
  await expect(panel.locator(".toolbar .status")).toHaveText(en.answerReady);
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    "",
  );
  await expect(reader.locator("[data-glimpselet-overlay] .guide")).toHaveCount(
    0,
  );
  expect(
    requests.filter((request) =>
      request.question.includes("Create a short, actionable guide"),
    ),
  ).toHaveLength(1);
});

test("bubble translates inline grammatical omission and restores the exact source nodes", async () => {
  await site.evaluate(() => {
    document.body.innerHTML =
      '<p id="fragments"> \n<span>この記事は</span><a href="#verifiable">検証可能</a><span>な</span><a href="#sources">参考文献や出典</a><span>が全く示されていないか、不十分です。</span>\t </p>';
    const scope = window as Window & { sourceNodes?: Node[] };
    const walker = document.createTreeWalker(
      document.querySelector("#fragments")!,
      NodeFilter.SHOW_TEXT,
    );
    scope.sourceNodes = [];
    let node: Node | null;
    while ((node = walker.nextNode())) scope.sourceNodes.push(node);
  });
  const originalValues = await site.evaluate(() =>
    (window as Window & { sourceNodes: Node[] }).sourceNodes.map(
      (node) => node.nodeValue,
    ),
  );
  const original = responder;
  responder = async (request) => {
    if (!request.question.includes('Return JSON only: {"nodes":'))
      return original(request);
    expect(request.question).toContain('"omit":true');
    const nodes = JSON.parse(request.question.split("\n").at(-1)!) as Array<{
      id: string;
      text: string;
    }>;
    expect(nodes.map((node) => node.text)).toEqual([
      "この記事は",
      "検証可能",
      "な",
      "参考文献や出典",
      "が全く示されていないか、不十分です。",
    ]);
    const translated = [
      "This article ",
      "does not cite ",
      "",
      "any sources",
      " or has insufficient citations.",
    ];
    return {
      answer: JSON.stringify({
        nodes: nodes.map((node, index) =>
          index === 2
            ? { id: node.id, omit: true }
            : { id: node.id, text: translated[index] },
        ),
      }),
    };
  };
  await panel
    .getByRole("button", { name: en.translatePage, exact: true })
    .click();
  await expect(panel.locator(".toolbar .status")).toHaveText(
    en.translationApplied,
  );
  expect(await site.locator("#fragments").textContent()).toBe(
    " \nThis article does not cite any sources or has insufficient citations.\t ",
  );
  expect(
    await site.evaluate(() =>
      (window as Window & { sourceNodes: Node[] }).sourceNodes.every(
        (node) => node.isConnected,
      ),
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: en.restore, exact: true }).click();
  await expect(site.locator("[data-glimpselet-translated]")).toHaveCount(0);
  expect(
    await site.evaluate(() =>
      (window as Window & { sourceNodes: Node[] }).sourceNodes.map(
        (node) => node.nodeValue,
      ),
    ),
  ).toEqual(originalValues);
  expect(
    await site
      .locator("#fragments a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(["#verifiable", "#sources"]);
});

test("bubble retranslates an omitted fragment from its original source and retained ID", async () => {
  const sources = [
    "この記事は",
    "検証可能",
    "な",
    "参考文献や出典",
    "が全く示されていないか、不十分です。",
  ];
  await site.evaluate((values) => {
    document.body.innerHTML = '<p id="repeat-fragments"></p>';
    const paragraph = document.querySelector("p")!;
    for (const value of values) {
      const span = document.createElement("span");
      span.textContent = value;
      paragraph.append(span);
    }
  }, sources);
  const original = responder;
  let originalSource: Array<{ id: string; text: string }> | undefined;
  let round = 0;
  const secondTranslation = [
    "本文完全缺乏",
    "可驗證",
    "的",
    "參考文獻和來源",
    "，或引用不足。",
  ];
  responder = async (request) => {
    if (!request.question.includes('Return JSON only: {"nodes":'))
      return original(request);
    const nodes = JSON.parse(request.question.split("\n").at(-1)!) as Array<{
      id: string;
      text: string;
    }>;
    expect(nodes.map(({ text }) => text)).toEqual(sources);
    if (originalSource) expect(nodes).toEqual(originalSource);
    else originalSource = nodes;
    round++;
    const values =
      round === 1
        ? [
            "This article lacks ",
            "verifiable ",
            "",
            "references or sources",
            ", or its citations are insufficient.",
          ]
        : secondTranslation;
    return {
      answer: JSON.stringify({
        nodes: nodes.map(({ id }, index) =>
          round === 1 && index === 2
            ? { id, omit: true }
            : { id, text: values[index] },
        ),
      }),
    };
  };
  await panel
    .getByRole("button", { name: en.translatePage, exact: true })
    .click();
  await expect(panel.locator(".toolbar .status")).toHaveText(
    en.translationApplied,
  );
  expect(
    await site.locator("#repeat-fragments span").nth(2).textContent(),
  ).toBe("");
  await panel.getByRole("button", { name: en.translated, exact: true }).click();
  await expect(site.locator("#repeat-fragments")).toHaveText(
    secondTranslation.join(""),
  );
  await expect(panel.locator(".toolbar .status")).toHaveText(
    en.translationApplied,
  );
  expect(round).toBe(2);
  await panel.getByRole("button", { name: en.restore, exact: true }).click();
  await expect(panel.locator(".toolbar .status")).toHaveText(
    `${en.restored} 5`,
  );
  expect(await site.locator("#repeat-fragments").textContent()).toBe(
    sources.join(""),
  );
});

test("bubble keeps escaped translation requests within the limit and preserves every source ID", async () => {
  const sources = ['"'.repeat(3500), "出".repeat(1432)];
  await site.evaluate((values) => {
    document.body.replaceChildren();
    for (const [index, value] of values.entries()) {
      const paragraph = document.createElement("p");
      paragraph.id = `escaped-${index}`;
      paragraph.textContent = value;
      document.body.append(paragraph);
    }
  }, sources);
  const original = responder;
  const received: Array<{ id: string; text: string }> = [];
  responder = async (request) => {
    if (!request.question.includes('Return JSON only: {"nodes":'))
      return original(request);
    if (request.question.length > 8000)
      throw new Error("Translation request exceeds the API question limit");
    const nodes = JSON.parse(request.question.split("\n").at(-1)!) as Array<{
      id: string;
      text: string;
    }>;
    received.push(...nodes);
    return {
      answer: JSON.stringify({
        nodes: nodes.map(({ id, text }) => ({
          id,
          text: text.startsWith('"') ? "Quoted text" : "Source text",
        })),
      }),
    };
  };
  await panel
    .getByRole("button", { name: en.translatePage, exact: true })
    .click();
  await expect(panel.locator(".toolbar .status")).toHaveText(
    en.translationApplied,
  );
  expect(received.map(({ text }) => text)).toEqual(sources);
  expect(new Set(received.map(({ id }) => id)).size).toBe(sources.length);
  await expect(site.locator("#escaped-0")).toHaveText("Quoted text");
  await expect(site.locator("#escaped-1")).toHaveText("Source text");
  await panel.getByRole("button", { name: en.restore, exact: true }).click();
  await expect(panel.locator(".toolbar .status")).toHaveText(
    `${en.restored} 2`,
  );
  expect(await site.locator("#escaped-0").textContent()).toBe(sources[0]);
  expect(await site.locator("#escaped-1").textContent()).toBe(sources[1]);
});

test("bubble rejects extra duplicate or unknown translation IDs before writing", async () => {
  await site.evaluate(() => {
    document.body.innerHTML = '<p id="source">検証可能な出典</p>';
  });
  const original = responder;
  let extraId = "unknown";
  responder = async (request) => {
    if (!request.question.includes('Return JSON only: {"nodes":'))
      return original(request);
    const source = JSON.parse(request.question.split("\n").at(-1)!) as Array<{
      id: string;
      text: string;
    }>;
    return {
      answer: JSON.stringify({
        nodes: [
          ...source.map(({ id }) => ({ id, text: "verifiable sources" })),
          {
            id: extraId === "duplicate" ? source[0].id : extraId,
            text: "extra",
          },
        ],
      }),
    };
  };
  const translate = panel.getByRole("button", {
    name: en.translatePage,
    exact: true,
  });
  for (const id of ["unknown", "duplicate"]) {
    extraId = id;
    await expect(translate).toBeEnabled();
    await translate.click();
    await expect(panel.locator(".toolbar .status")).toHaveText(
      en.translationIncomplete,
    );
    await expect(translate).toBeEnabled();
    await expect(site.locator("#source")).toHaveText("検証可能な出典");
    await expect(site.locator("[data-glimpselet-translated]")).toHaveCount(0);
  }
});

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
  await expect(panel.locator(".float-start").last()).toContainText(
    en.guideCapturePermission,
  );
  const guides = panel.getByRole("button", {
    name: en.guideAction,
    exact: true,
  });
  await expect(guides).toHaveCount(1);
  for (const width of [320, 420, 520]) {
    await panel.setViewportSize({ width, height: 700 });
    await expect(guides).toBeVisible();
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await panel.evaluate(() => {
    const contains = chrome.permissions.contains.bind(chrome.permissions);
    chrome.permissions.contains = ((permissions) =>
      permissions.origins?.some((origin) =>
        origin.startsWith("http://127.0.0.1:"),
      )
        ? Promise.resolve(false)
        : contains(permissions)) as typeof chrome.permissions.contains;
    const original = chrome.scripting.executeScript.bind(chrome.scripting);
    let denied = true;
    const request = chrome.permissions.request.bind(chrome.permissions);
    chrome.permissions.request = ((permissions) => {
      if (
        denied &&
        permissions.origins?.some((origin) =>
          origin.startsWith("http://127.0.0.1:"),
        )
      ) {
        denied = false;
        return Promise.resolve(false);
      }
      return request(permissions);
    }) as typeof chrome.permissions.request;
    chrome.scripting.executeScript = ((
      ...args: Parameters<typeof original>
    ) => {
      if (denied && args[0].func && !args[0].args) {
        return Promise.reject(
          new Error(
            "Either the '<all_urls>' or 'activeTab' permission is required.",
          ),
        );
      }
      return original(...args);
    }) as typeof chrome.scripting.executeScript;
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
  let markdown =
    '**Key points**\n\n- First point\n- Second point\n\n```js\nconst value = 1;\n```\n\n[Source](https://example.com)\n\n<img src="https://tracker.invalid/pixel" onerror="window.pwned=1"><script>window.pwned=1</script>[bad](javascript:alert(1)) ![image](https://tracker.invalid/image)';
  markdown += "\n\n" + "A paragraph to exercise scrolling.\n\n".repeat(30);
  let finish!: () => void;
  let continueStreaming!: () => void;
  responder = async (request) => {
    request.onText(markdown);
    continueStreaming = () => {
      const more = "\n\nThe latest streamed paragraph.";
      markdown += more;
      request.onText(more);
    };
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
  const thread = panel.locator(".thread");
  await expect
    .poll(() =>
      thread.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(72);
  await thread.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  continueStreaming();
  await expect(panel.locator(".answer .markdown")).toContainText(
    "The latest streamed paragraph",
  );
  expect(await thread.evaluate((element) => element.scrollTop)).toBe(0);
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

test("summarizes the selected PDF section while retaining a whole-page summary", async () => {
  const reader = await openReader();
  const original = responder;
  responder = async (request) => {
    if (request.kind !== "ask") return original(request);
    const answer = request.question.startsWith(
      "Summarize only this selected PDF passage",
    )
      ? "**Introduction:** The Transformer trains in twelve hours on eight P100 GPUs."
      : "Whole page: Introduction and Background.";
    request.onText(answer);
    return { answer, sessionId: request.cliSession?.id };
  };
  await selectIntroduction(reader);
  await reader
    .getByRole("button", { name: "Summarize selection", exact: true })
    .click();
  await expect(panel.locator(".message .answer").last()).toContainText(
    "Introduction: The Transformer trains",
  );
  const selected = requests.filter((request) => request.kind === "ask").at(-1)!;
  expect(selected.question).toContain(
    "Summarize only this selected PDF passage",
  );
  expect(selected.question).toContain(
    "In this work we propose the Transformer",
  );
  expect(selected.question).not.toContain("UNRELATED_SECTION");
  expect(selected.page?.text).not.toContain("UNRELATED_SECTION");
  expect(selected.image).toBeUndefined();
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    "",
  );
  await reader
    .getByRole("button", { name: "Summarize page", exact: true })
    .click();
  await expect(panel.locator(".message .answer").last()).toContainText(
    "Whole page: Introduction and Background",
  );
  const wholePage = requests
    .filter((request) => request.kind === "ask")
    .at(-1)!;
  expect(wholePage.page?.text).toContain("UNRELATED_SECTION");
  expect(wholePage.image).toBeInstanceOf(Buffer);
});

test("reader translation submits once in the target language and PDF popover Ask remains editable and text-only", async () => {
  const reader = await openReader();
  const original = responder;
  responder = async (request) => {
    if (request.kind !== "ask") return original(request);
    const answer = "**翻譯：** 本研究提出 Transformer。";
    request.onText(answer);
    return { answer, sessionId: request.cliSession?.id };
  };
  await selectIntroduction(reader);
  await reader
    .getByRole("button", { name: "Translate selection", exact: true })
    .click();
  await expect(panel.locator(".message .answer").last()).toContainText(
    "本研究提出 Transformer",
  );
  const translations = requests.filter((request) =>
    request.question.startsWith("Translate this selected text"),
  );
  expect(translations).toHaveLength(1);
  expect(translations[0].question).toContain("繁體中文");
  expect(translations[0].question).toContain(
    "In this work we propose the Transformer",
  );
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    "",
  );
  await selectIntroduction(reader);
  const popover = reader.locator("[data-glimpselet-overlay] .popover");
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: en.send, exact: true }).click();
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    /In this work/,
  );
  await panel.locator(".send").click();
  await expect(panel.locator(".toolbar .status")).toHaveText("Answer ready.");
  expect(
    requests.filter((request) => request.kind === "ask").at(-1)?.image,
  ).toBeUndefined();
});

// An opt-in smoke uses the original paper without introducing a network
// dependency into the deterministic extension suite.
if (process.env.GLIMPSELET_REAL_PDF) {
  test("actual arXiv PDF keeps a native selected introduction separate from Background", async () => {
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extensionId}/reader.html`);
    await reader
      .locator("#file")
      .setInputFiles(process.env.GLIMPSELET_REAL_PDF!);
    await expect(reader.locator(".pdf-text-layer")).toContainText(
      "Attention Is All You Need",
    );
    await reader
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(reader.locator(".pdf-text-layer")).toContainText(
      "In this work we propose the Transformer",
    );
    const first = reader
      .locator(".pdf-text-layer span")
      .filter({ hasText: /^In this work we propose/ })
      .first();
    const last = reader
      .locator(".pdf-text-layer span")
      .filter({ hasText: /P100 GPUs\./ })
      .last();
    await reader.bringToFront();
    await first.scrollIntoViewIfNeeded();
    await last.scrollIntoViewIfNeeded();
    const start = (await first.boundingBox())!;
    const end = (await last.boundingBox())!;
    // Select the first line, then extend it to the end of the paragraph using
    // the browser's native selection rather than constructing a DOM Range.
    await reader.mouse.click(start.x + 1, start.y + start.height / 2, {
      clickCount: 3,
    });
    await reader.keyboard.down("Shift");
    await reader.mouse.click(end.x + end.width - 1, end.y + end.height / 2);
    await reader.keyboard.up("Shift");
    await reader.screenshot({
      path: test.info().outputPath("arxiv-selected-introduction.png"),
    });
    const selection = await reader.evaluate(() => getSelection()!.toString());
    expect(selection).toContain("In this work we propose the Transformer");
    expect(selection).toContain("twelve hours on eight P100 GPUs");
    expect(selection).not.toContain("Background");
    const original = responder;
    responder = async (request) => {
      if (request.kind !== "ask") return original(request);
      const answer =
        "**Selected introduction:** The Transformer uses attention and allows parallel training.";
      request.onText(answer);
      return { answer, sessionId: request.cliSession?.id };
    };
    await reader
      .getByRole("button", { name: "Summarize selection", exact: true })
      .click();
    await expect(panel.locator(".message .answer").last()).toContainText(
      "Selected introduction",
    );
    const selected = requests
      .filter((request) => request.kind === "ask")
      .at(-1)!;
    expect(selected.page?.text).toBe(selection.trim());
    expect(selected.question).toContain(selection.trim());
    expect(selected.question).not.toContain("Background");
    expect(selected.image).toBeUndefined();
    await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
      "",
    );
  });
}
