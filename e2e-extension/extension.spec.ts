import en from "../extension/locales/en.json" with { type: "json" };
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
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../bridge/src/extension-install";

interface DocumentPictureInPicture {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}
declare global {
  interface Window {
    documentPictureInPicture: DocumentPictureInPicture;
  }
}

let server: Server,
  bridge: ExtensionBridge,
  context: BrowserContext,
  worker: Worker,
  origin: string,
  panel: Page,
  site: Page,
  directory: string;
let extensionId: string;
let providerRequests: ProviderRequest[];
let providerResponder: AnswerProvider;
test.beforeEach(async () => {
  providerRequests = [];
  providerResponder = (request) =>
    runCliProvider(request, {
      command: process.execPath,
      argsPrefix: [resolve("e2e-extension/mock-claude.cjs")],
    });
  directory = await mkdtemp(join(tmpdir(), "glimpselet-extension-e2e-"));
  const fixture = await readFile(resolve("e2e-extension/fixture.html"));
  server = createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/install") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(installGuide("/tmp/glimpselet-extension-e2e"));
      return;
    }
    if (requestUrl.pathname === "/install-guide.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(INSTALL_GUIDE_SCRIPT);
      return;
    }
    if (requestUrl.pathname === "/install/status") {
      const connected = bridge.installStatus(
        requestUrl.searchParams.get("code") || "",
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = connected === undefined ? 401 : 200;
      res.end(
        JSON.stringify(
          connected === undefined
            ? { error: "pairing_expired" }
            : { connected, mode: bridge.mode },
        ),
      );
      return;
    }
    if (requestUrl.pathname === "/assets/glimpselet-welcome-sample.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      void readFile(
        resolve("public/assets/glimpselet-welcome-sample.html"),
      ).then(
        (body) => res.end(body),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
      return;
    }
    if (requestUrl.pathname === "/assets/logo.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      void readFile(resolve("public/assets/logo.svg")).then(
        (body) => res.end(body),
        () => {
          res.statusCode = 404;
          res.end();
        },
      );
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      req.url === "/password"
        ? '<title>Sign in</title><input type="password"><p>Private account</p>'
        : fixture,
    );
  });
  bridge = new ExtensionBridge(server, () => origin, {
    provider: (request) => {
      providerRequests.push(request);
      return providerResponder(request);
    },
    sessions: new ExtensionSessions(directory, async () => []),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${addr.port}`;
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
      "--window-position=0,0",
      "--window-size=1100,780",
      "--auto-select-tab-capture-source-by-title=Notebook exports",
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
  const opened = context.waitForEvent("page");
  await site.bringToFront();
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const siteCdp = await context.newCDPSession(site);
  const { targetInfos } = await browserCdp.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const targetInfo = targetInfos.find((target) => target.url === origin + "/");
  if (!targetInfo)
    throw new Error(
      "Fixture tab target not found: " + JSON.stringify(targetInfos),
    );
  await browserCdp.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: targetInfo.targetId,
  });
  await siteCdp.detach();
  await browserCdp.detach();
  panel = await opened;
  panel.setDefaultTimeout(10000);
  site.setDefaultTimeout(10000);
  await panel.waitForLoadState();
  await panel.getByRole("button", { name: "Settings", exact: true }).click();
  await panel
    .locator(".dialog input")
    .nth(0)
    .fill(origin.replace("http:", "ws:") + "/extension");
  await panel.locator(".dialog input").nth(1).fill(bridge.issueCode());
  await panel.getByRole("button", { name: en.pair, exact: true }).click();
  await panel.getByRole("button", { name: en.close, exact: true }).click();
  await expect(panel.locator(".connection")).toHaveClass(/online/);
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
});

for (const backend of ["bridge", "api"] as const) {
  test(`screenshot translation sends its captured pixels in ${backend} mode`, async () => {
    const apiCalls: Array<{
      messages: Array<{
        content: Array<{
          type: string;
          source?: { data: string };
          text?: string;
        }>;
      }>;
    }> = [];
    if (backend === "api") {
      await context.route(
        "https://api.anthropic.com/v1/messages",
        async (route) => {
          if (route.request().method() === "OPTIONS") {
            await route.fulfill({
              status: 204,
              headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers": "*",
                "access-control-allow-methods": "POST, OPTIONS",
              },
            });
            return;
          }
          const input = route.request().postDataJSON();
          apiCalls.push(input);
          const question = input.messages
            .at(-1)
            .content.find(
              (block: { type: string }) => block.type === "text",
            ).text;
          const answer = question.includes("Give 3 to 5")
            ? JSON.stringify({
                questions: [
                  "What is this page?",
                  "Where is export?",
                  "Explain the Japanese text.",
                ],
              })
            : "Translated screenshot.";
          const events = [
            { type: "message_start", message: { usage: { input_tokens: 70 } } },
            {
              type: "content_block_delta",
              delta: { type: "text_delta", text: answer },
            },
            {
              type: "message_delta",
              delta: { stop_reason: "end_turn" },
              usage: { output_tokens: 20 },
            },
            { type: "message_stop" },
          ];
          await route.fulfill({
            contentType: "text/event-stream",
            headers: { "access-control-allow-origin": "*" },
            body: events
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
          });
        },
      );
      await worker.evaluate(async () => {
        await chrome.storage.local.set({ backend: "api" });
        await chrome.storage.session.set({ apiKey: "fixture-key" });
      });
      await panel.reload();
      await expect(panel.locator(".suggestions button")).toHaveCount(3);
    }
    if (backend === "bridge") {
      await panel
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await panel.getByLabel(en.targetLanguage).selectOption("ja");
      await panel.getByRole("button", { name: en.close, exact: true }).click();
    }
    await panel.getByRole("button", { name: en.visible, exact: true }).click();
    await expect(panel.locator(".capture-chip img")).toBeVisible();
    await panel
      .locator(".capture-chip .quick-actions")
      .getByRole("button", { name: en.translate, exact: true })
      .click();
    await expect(panel.locator(".thread article").last()).toContainText(
      backend === "api" ? "Translated screenshot." : "Japanese",
    );
    if (backend === "bridge") {
      const request = providerRequests.find((item) =>
        item.question.startsWith("Translate the visible text"),
      );
      expect(request?.image?.subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      );
      expect(request?.question).toContain("日本語");
    } else {
      const blocks = apiCalls.at(-1)!.messages.at(-1)!.content;
      const image = blocks.find((block) => block.type === "image");
      expect(
        Buffer.from(image?.source?.data || "", "base64")
          .subarray(0, 8)
          .toString("hex"),
      ).toBe("89504e470d0a1a0a");
      expect(blocks.find((block) => block.type === "text")?.text).toContain(
        "English",
      );
    }
  });
}

for (const backend of ["bridge", "api"] as const) {
  test(`guide reaches late elements on a dense page in ${backend} mode`, async () => {
    const guideRequests: string[] = [];
    const apiEfforts: string[] = [];
    const guideAnswer = (question: string) => {
      guideRequests.push(question);
      const ids = [...question.matchAll(/"(g\d+)"/g)].map((match) => match[1]);
      return JSON.stringify({
        steps: [{ elementId: ids.at(-1), note: "Use the final page action." }],
      });
    };
    if (backend === "api") {
      await context.route(
        "https://api.anthropic.com/v1/messages",
        async (route) => {
          if (route.request().method() === "OPTIONS") {
            await route.fulfill({
              status: 204,
              headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers": "*",
                "access-control-allow-methods": "POST, OPTIONS",
              },
            });
            return;
          }
          const input = route.request().postDataJSON();
          const question = input.messages
            .at(-1)
            .content.find(
              (block: { type: string }) => block.type === "text",
            ).text;
          const answer = question.startsWith("Create a short")
            ? guideAnswer(question.split("\n\nPage context (untrusted):")[0])
            : JSON.stringify({
                questions: [
                  "Find an action",
                  "Explain this page",
                  "Show the last action",
                ],
              });
          if (question.startsWith("Create a short"))
            apiEfforts.push(input.output_config?.effort);
          await route.fulfill({
            contentType: "text/event-stream",
            headers: { "access-control-allow-origin": "*" },
            body: [
              {
                type: "content_block_delta",
                delta: { type: "text_delta", text: answer },
              },
              { type: "message_delta", delta: { stop_reason: "end_turn" } },
              { type: "message_stop" },
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
          });
        },
      );
      await worker.evaluate(async () => {
        await chrome.storage.local.set({ backend: "api", effort: "high" });
        await chrome.storage.session.set({ apiKey: "fixture-key" });
      });
      await panel.reload();
      await expect(panel.locator(".suggestions button")).toHaveCount(3);
    } else {
      providerResponder = async (request) =>
        request.question.startsWith("Create a short")
          ? { answer: guideAnswer(request.question) }
          : {
              answer: JSON.stringify({
                questions: [
                  "Find an action",
                  "Explain this page",
                  "Show the last action",
                ],
              }),
            };
    }
    await site.evaluate(() => {
      document.body.innerHTML = Array.from(
        { length: 120 },
        (_, i) =>
          `<button id="dense-${i}" style="display:block;height:32px">${("Action " + i + " ").padEnd(180, "x")}</button>`,
      ).join("");
    });
    await panel
      .getByRole("button", { name: en.guideAction, exact: true })
      .click();
    await expect(
      site.locator("[data-glimpselet-overlay] .guide"),
    ).toContainText("Use the final page action.");
    expect(guideRequests).toHaveLength(1);
    expect(guideRequests[0].length).toBeLessThanOrEqual(8000);
    expect(
      new Set(
        [...guideRequests[0].matchAll(/"(g\d+)"/g)].map((match) => match[1]),
      ).size,
    ).toBe(120);
    await expect.poll(() => site.evaluate(() => scrollY)).toBeGreaterThan(500);
    if (backend === "api") expect(apiEfforts).toEqual(["high"]);
  });
}

test("switching tabs hides stale suggestions and refreshes after an automatic reply", async () => {
  let releaseOld: (() => void) | undefined;
  const oldQuestions = {
    answer: JSON.stringify({
      questions: [
        "Old page question one?",
        "Old page question two?",
        "Old page question three?",
      ],
    }),
  };
  const currentQuestions = {
    answer: JSON.stringify({
      questions: [
        "Current page question one?",
        "Current page question two?",
        "Current page question three?",
      ],
    }),
  };
  providerResponder = (request) => {
    if (
      request.question.startsWith("Give 3 to 5") &&
      request.page?.url.endsWith("/slow-suggestions")
    ) {
      return new Promise((resolveAnswer) => {
        releaseOld = () => resolveAnswer(oldQuestions);
        request.signal.addEventListener("abort", releaseOld, { once: true });
      });
    }
    return Promise.resolve(currentQuestions);
  };
  try {
    await site.goto(origin + "/slow-suggestions");
    await site.bringToFront();
    await expect.poll(() => Boolean(releaseOld)).toBe(true);
    const next = await context.newPage();
    await next.goto(origin + "/current-page");
    await next.bringToFront();
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    releaseOld!();
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    await expect(panel.locator(".suggestions")).toContainText(
      "Current page question one?",
    );
    await expect(panel.locator(".suggestions")).not.toContainText("Old page");
    expect(
      providerRequests.some(
        (request) =>
          request.question.startsWith("Give 3 to 5") &&
          request.page?.url.endsWith("/current-page"),
      ),
    ).toBe(true);
  } finally {
    releaseOld?.();
  }
});

test("switching tabs preserves a foreground answer and refreshes the new page afterward", async () => {
  let releaseForeground: (() => void) | undefined;
  providerResponder = (request) => {
    if (request.question === "Hold this foreground answer.") {
      request.onText("Foreground answer started.");
      return new Promise((resolveAnswer) => {
        releaseForeground = () =>
          resolveAnswer({ answer: "Foreground answer kept." });
        request.signal.addEventListener("abort", releaseForeground, {
          once: true,
        });
      });
    }
    return Promise.resolve({
      answer: JSON.stringify({
        questions: [
          "New page question one?",
          "New page question two?",
          "New page question three?",
        ],
      }),
    });
  };
  try {
    await panel
      .locator(".composer textarea")
      .fill("Hold this foreground answer.");
    await panel.locator(".composer button.send").click();
    await expect.poll(() => Boolean(releaseForeground)).toBe(true);
    const next = await context.newPage();
    await next.goto(origin + "/new-page");
    await next.bringToFront();
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    releaseForeground!();
    await expect(panel.locator(".thread article").last()).toContainText(
      "Foreground answer kept.",
    );
    await expect(panel.locator(".suggestions")).toContainText(
      "New page question one?",
    );
  } finally {
    releaseForeground?.();
  }
});
test("Stop keeps a page refresh queued until provider cleanup finishes", async () => {
  let finishProvider: (() => void) | undefined;
  let aborted = false;
  providerResponder = (request) => {
    if (request.question === "Keep this reply pending.") {
      request.onText("Partial reply kept.");
      return new Promise((resolveAnswer) => {
        finishProvider = () => resolveAnswer({ answer: "Provider stopped." });
        request.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
          },
          { once: true },
        );
      });
    }
    return Promise.resolve({
      answer: JSON.stringify({
        questions: [
          "After stop question one?",
          "After stop question two?",
          "After stop question three?",
        ],
      }),
    });
  };
  try {
    await panel.locator(".composer textarea").fill("Keep this reply pending.");
    await panel.locator(".composer button.send").click();
    await expect.poll(() => Boolean(finishProvider)).toBe(true);
    const next = await context.newPage();
    await next.goto(origin + "/after-stop");
    await next.bringToFront();
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    await panel.getByRole("button", { name: /Stop/ }).click();
    await expect.poll(() => aborted).toBe(true);
    await panel.locator(".composer textarea").fill("Next question");
    await expect(panel.locator(".composer button.stop")).toBeVisible();
    await expect(panel.locator(".composer button.send")).toHaveCount(0);
    expect(
      providerRequests.some((request) =>
        request.page?.url.endsWith("/after-stop"),
      ),
    ).toBe(false);
    finishProvider!();
    await expect(panel.locator(".suggestions")).toContainText(
      "After stop question one?",
    );
    await expect(panel.locator(".thread article").last()).toContainText(
      "Partial reply kept.",
    );
    await expect(panel.locator(".composer button.send")).toBeEnabled();
  } finally {
    finishProvider?.();
  }
});

test.afterEach(async () => {
  await context?.close();
  await bridge?.close();
  if (server?.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

test("welcome page auto-pairs an existing install tab and completes its real guide tutorial", async () => {
  const code = bridge.issueCode();
  const welcome = await context.newPage();
  welcome.setDefaultTimeout(10000);
  await welcome.goto(`${origin}/install#code=${code}`);
  await expect
    .poll(async () =>
      welcome.evaluate(async () => {
        const response = await fetch(
          `/install/status?code=${location.hash.slice(6)}`,
        );
        const status = (await response.json()) as { connected?: boolean };
        return status.connected === true;
      }),
    )
    .toBe(true);
  await expect(welcome.locator("#connection")).toHaveClass(/connected/);
  const sampleUrl = `${origin}/assets/glimpselet-welcome-sample.html`;
  await expect
    .poll(() => context.pages().some((page) => page.url() === sampleUrl))
    .toBe(true);
  const sample = context.pages().find((page) => page.url() === sampleUrl)!;
  sample.setDefaultTimeout(10000);
  await expect(sample.locator("#tour-request")).toContainText("step 1");
  const guideTry = welcome.getByRole("button", {
    name: "Open sample + request guide",
    exact: true,
  });
  await guideTry.click();
  await expect(sample.locator("#tour-request")).toContainText("step 5");
  await expect(panel.locator(".float-start").last()).toContainText("5/8");
  await sample.bringToFront();
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const sampleTarget = targetInfos.find((target) => target.url === sampleUrl);
  if (!sampleTarget) throw new Error("Welcome sample tab target not found");
  await browserCdp.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: sampleTarget.targetId,
  });
  await browserCdp.detach();
  await panel.locator(".float-start button").last().click();
  await expect(panel.locator(".message .answer").last()).toContainText(
    "Choose Save these brewing notes",
  );
  const guide = sample.locator("[data-glimpselet-overlay] .guide");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("Save these brewing notes");
  await expect(
    sample.locator("[data-glimpselet-overlay] svg.draw .ink"),
  ).toBeVisible();
  await expect(welcome.locator(".step").nth(4)).toHaveClass(/done/);
  await expect(welcome.locator(".progress")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
});

test("paired chat streams and follows up, captures a page and cancels", async () => {
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
  await panel.locator(".composer textarea").fill("How do I export?");
  await panel.locator(".composer button.send").click();
  await expect(panel.locator(".message .answer p").last()).toContainText(
    "Export notebook",
  );
  await panel
    .locator(".composer textarea")
    .fill("What does the Japanese paragraph say?");
  await panel.locator(".composer button.send").click();
  await expect(panel.locator(".message")).toHaveCount(2);
  await expect(panel.locator(".message .answer p").last()).toContainText(
    "Japanese",
  );
  await panel.getByRole("button", { name: en.visible, exact: true }).click();
  await expect(panel.locator(".capture-chip img")).toBeVisible();
  const dimensions = await panel
    .locator(".capture-chip img")
    .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(dimensions[0]).toBeGreaterThan(600);
  await panel.locator(".composer textarea").fill("slow request");
  await panel.locator(".composer button.send").click();
  await panel.getByRole("button", { name: /Stop/ }).click();
  await expect(panel.locator(".live-answer")).toHaveCount(0);
});

test("guide follows offscreen elements, translation restores and element selection works", async () => {
  await panel
    .locator(".composer textarea")
    .fill("show me where the export button is");
  await panel.locator(".composer button.send").click();
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toContainText(
    "Export notebook",
  );
  await site
    .locator("[data-glimpselet-overlay] .guide")
    .getByRole("button", { name: en.next, exact: true })
    .click();
  await expect.poll(() => site.evaluate(() => scrollY)).toBeGreaterThan(500);
  await site.keyboard.press("Escape");
  await expect(site.locator("[data-glimpselet-overlay] .guide")).toHaveCount(0);
  const original = await site.locator("#foreign").textContent();
  await panel
    .getByRole("button", { name: en.translatePage, exact: true })
    .click();
  await expect(site.locator("#foreign")).toContainText("Translated:");
  await panel.getByRole("button", { name: en.restore, exact: true }).click();
  await expect(site.locator("#foreign")).toHaveText(original!);
  await site.evaluate(() => scrollTo(0, 0));
  await panel.getByRole("button", { name: en.element, exact: true }).click();
  await expect(site.locator("[data-glimpselet-overlay] .shade")).toBeVisible();
  const box = await site.locator("#export").boundingBox();
  await site.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(panel.locator(".capture-chip img")).toBeVisible();
  const width = await panel
    .locator(".capture-chip img")
    .evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(width).toBeLessThan(350);
});

test("full page capture stitches native frames and restores the source scroll", async () => {
  await site.evaluate(() => scrollTo(0, 320));
  const metrics = await site.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    y: scrollY,
  }));
  await panel.getByRole("button", { name: en.fullPage, exact: true }).click();
  const thumbnail = panel.locator(".capture-chip img");
  await expect(thumbnail).toBeVisible();
  const dimensions = await thumbnail.evaluate((image: HTMLImageElement) => [
    image.naturalWidth,
    image.naturalHeight,
  ]);
  expect(dimensions).toEqual([metrics.width, metrics.height]);
  expect(await site.evaluate(() => scrollY)).toBe(metrics.y);
});

test("real Document PiP renders the bubble and remains open after switching pages", async () => {
  await panel.locator(".float-start button").click();
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(true);
  await panel.evaluate(() =>
    window.documentPictureInPicture.window!.resizeTo(428, 650),
  );
  await expect
    .poll(() =>
      panel.evaluate(() => window.documentPictureInPicture.window!.innerWidth),
    )
    .toBeGreaterThanOrEqual(320);
  await site.bringToFront();
  const info = await panel.evaluate(() => {
    const pip = window.documentPictureInPicture.window!;
    return {
      open: !pip.closed,
      title: pip.document.body.textContent,
      width: pip.innerWidth,
      height: pip.innerHeight,
    };
  });
  expect(info.open).toBe(true);
  expect(info.title).toContain("Glimpselet");
  expect(info.width).toBeGreaterThanOrEqual(320);
  expect(info.width).toBeLessThanOrEqual(520);
  await panel.evaluate(() => window.documentPictureInPicture.window!.close());
  await expect(panel.locator(".app")).toBeVisible();
});

async function clickInBubble(label: string) {
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send("Target.getTargets");
  const openerCdp = await context.newCDPSession(panel);
  const { targetInfo: opener } = await openerCdp.send("Target.getTargetInfo");
  await openerCdp.detach();
  const candidates = targetInfos.filter(
    (t) => t.type === "page" && t.url === "about:blank",
  );
  const target =
    candidates.find((t) => t.openerId === opener.targetId) ||
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!target) throw new Error("PiP target not found");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  try {
    const reply = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("PiP activation timed out")),
        10000,
      );
      cdp.on("Target.receivedMessageFromTarget", (event) => {
        if (event.sessionId !== sessionId) return;
        const response = JSON.parse(event.message);
        if (response.id !== 71) return;
        clearTimeout(timer);
        if (response.error || response.result?.exceptionDetails)
          reject(new Error(JSON.stringify(response)));
        else resolve();
      });
    });
    const expression =
      "[...document.querySelectorAll('button')].find(b=>b.textContent.trim() === " +
      JSON.stringify(label.trim()) +
      ").click()";
    await cdp.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 71,
        method: "Runtime.evaluate",
        params: { expression, userGesture: true },
      }),
    });
    await reply;
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId });
    await cdp.detach();
  }
}

async function clickBubble(label: string) {
  await panel.evaluate((name) => {
    const pip = window.documentPictureInPicture.window;
    const buttons = [...(pip?.document.querySelectorAll("button") || [])];
    const button = buttons.find(
      (candidate) =>
        candidate.textContent?.trim() === name.trim() ||
        candidate.getAttribute("aria-label") === name ||
        candidate.getAttribute("title") === name,
    );
    if (!button)
      throw new Error(
        `Bubble button not found: ${name}; found ${buttons.map((candidate) => candidate.textContent?.trim()).join(" | ")}`,
      );
    button.click();
  }, label);
}

test("shared screen crops in the full screen opener, preserves pixels and cancels cleanly", async () => {
  await panel.locator(".float-start button").click();
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture?.window?.document.querySelector(
            ".app",
          )?.textContent || "",
      ),
    )
    .toContain("Glimpselet");
  await clickInBubble(en.share);
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window!.document.querySelector(
            "video",
          )?.videoWidth || 0,
      ),
    )
    .toBeGreaterThan(600);
  await clickInBubble(en.region);
  const frozen = panel.locator("[data-glimpselet-frozen-crop]");
  await expect(frozen).toBeVisible();
  await expect
    .poll(() => panel.evaluate(() => innerWidth))
    .toBeGreaterThan(700);
  const bubbleOpacity = await panel.evaluate(
    () => window.documentPictureInPicture.window!.document.body.style.opacity,
  );
  expect(bubbleOpacity).toBe("0.25");
  const image = await frozen.locator("img").boundingBox();
  const x = image!.x + 80,
    y = image!.y + 100;
  await panel.mouse.move(x, y);
  await panel.mouse.down();
  await panel.mouse.move(x + 240, y + 160);
  await panel.mouse.up();
  await expect(frozen.locator("[data-handle]")).toHaveCount(8);
  await panel.keyboard.press("Enter");
  await expect(frozen).toHaveCount(0);
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const img =
          window.documentPictureInPicture.window!.document.querySelector(
            ".capture-chip img",
          ) as HTMLImageElement;
        return img.naturalWidth;
      }),
    )
    .toBeGreaterThan(100);
  const pixels = await panel.evaluate(() => {
    const img = window.documentPictureInPicture.window!.document.querySelector(
      ".capture-chip img",
    ) as HTMLImageElement;
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(pixels[1]).toBeGreaterThan(80);
  await clickInBubble(en.region);
  await expect(frozen).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(frozen).toHaveCount(0);
  expect(
    await panel.evaluate(
      () => window.documentPictureInPicture.window!.document.body.style.opacity,
    ),
  ).toBe("");
});

test("Shift selects a region directly on the page with handles and Enter", async () => {
  await site.bringToFront();
  await site.keyboard.down("Shift");
  await site.waitForTimeout(230);
  await site.keyboard.up("Shift");
  const overlay = site.locator("[data-glimpselet-crop] .surface");
  await expect(overlay).toBeVisible();
  await site.mouse.move(60, 80);
  await site.mouse.down();
  await site.mouse.move(340, 260);
  await site.mouse.up();
  await expect(
    site.locator("[data-glimpselet-crop] [data-handle]"),
  ).toHaveCount(8);
  await site.keyboard.press("Enter");
  await expect(panel.locator(".capture-chip img")).toBeVisible();
  const dimensions = await panel
    .locator(".capture-chip img")
    .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(dimensions).toEqual([280, 180]);
});

test("Shift+Tab never starts page crop", async () => {
  await site.bringToFront();
  await site.keyboard.down("Shift");
  await site.keyboard.press("Tab");
  await site.waitForTimeout(260);
  await site.keyboard.up("Shift");
  await expect(site.locator("[data-glimpselet-crop]")).toHaveCount(0);
});

test("compacting and expanding keeps the shared video and crop available", async () => {
  await panel.locator(".float-start button").click();
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture?.window)),
    )
    .toBe(true);
  await clickInBubble(en.share);
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window!.document.querySelector(
            "video",
          )?.videoWidth || 0,
      ),
    )
    .toBeGreaterThan(600);
  await clickBubble(en.compact);
  await expect
    .poll(() =>
      panel.evaluate(() =>
        window.documentPictureInPicture
          .window!.document.querySelector(".app")
          ?.classList.contains("compact"),
      ),
    )
    .toBe(true);
  await clickBubble(en.expand);
  await expect
    .poll(() =>
      panel.evaluate(() =>
        window.documentPictureInPicture
          .window!.document.querySelector(".app")
          ?.classList.contains("expanded"),
      ),
    )
    .toBe(true);
  expect(
    await panel.evaluate(
      () =>
        window.documentPictureInPicture.window!.document.querySelector("video")
          ?.videoWidth || 0,
    ),
  ).toBeGreaterThan(600);
  await clickInBubble(en.region);
  const frozen = panel.locator("[data-glimpselet-frozen-crop]");
  await expect(frozen).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(frozen).toHaveCount(0);
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          window.documentPictureInPicture.window!.document.querySelector(
            "video",
          )?.videoWidth || 0,
      ),
    )
    .toBeGreaterThan(600);
});

test("bubble has no horizontal overflow in light and dark modes at compact widths", async () => {
  const responsive = await context.newPage();
  await responsive.goto(`chrome-extension://${extensionId}/panel.html`);
  await expect(responsive.locator(".app")).toBeVisible();
  await responsive
    .locator(".app")
    .evaluate((element) => element.classList.add("in-pip"));
  const widths = [320, 390, 520];
  const backgrounds = new Set<string>();
  for (const colorScheme of ["light", "dark"] as const) {
    await responsive.emulateMedia({ colorScheme });
    for (const width of widths) {
      await responsive.setViewportSize({ width, height: 650 });
      const measurements = await responsive.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        app: document.querySelector(".app")?.scrollWidth,
        background: getComputedStyle(document.querySelector(".app")!)
          .backgroundColor,
      }));
      backgrounds.add(measurements.background);
      expect(
        measurements.scroll,
        `${colorScheme} ${width}px document overflow`,
      ).toBeLessThanOrEqual(measurements.width);
      expect(
        measurements.body,
        `${colorScheme} ${width}px body overflow`,
      ).toBeLessThanOrEqual(measurements.width);
      expect(
        measurements.app,
        `${colorScheme} ${width}px bubble overflow`,
      ).toBeLessThanOrEqual(measurements.width);
    }
  }
  expect(backgrounds.size).toBeGreaterThan(1);
  await responsive.close();
});

test("PDF guide takes priority over automatic page suggestions", async () => {
  const reader = await context.newPage();
  await reader.goto(`chrome-extension://${extensionId}/reader.html`);
  await reader
    .locator("#file")
    .setInputFiles(resolve("public/assets/glimpselet-welcome-sample.pdf"));
  await expect(reader.locator(".pdf-page")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: en.stop, exact: true }),
  ).toBeVisible();
  await reader
    .getByRole("button", { name: "Guide me through this section", exact: true })
    .click();
  await expect(reader.locator("#status")).toContainText("Guide request sent");
  await expect(
    reader.locator("[data-glimpselet-overlay] .guide"),
  ).toBeVisible();
  await expect(panel.locator(".status")).toHaveText(en.answerReady);
  await reader.close();
});

test("bundled PDF.js reader renders the sample, exposes page context and selected text", async () => {
  const reader = await context.newPage();
  reader.setDefaultTimeout(15000);
  await reader.goto(`chrome-extension://${extensionId}/reader.html`);
  await reader
    .locator("#file")
    .setInputFiles(resolve("public/assets/glimpselet-welcome-sample.pdf"));
  await expect(reader.locator(".pdf-page")).toBeVisible();
  await expect(reader.locator(".pdf-text-layer span").first()).toBeVisible();
  await expect(reader.locator("#page-label")).toContainText("Page 1 of 1");
  const span = reader
    .locator(".pdf-text-layer span")
    .filter({ hasText: /Glimpselet/i })
    .first();
  await expect(span).toBeVisible();
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  const selected = await reader.evaluate(
    () => getSelection()?.toString().trim() || "",
  );
  expect(selected).toMatch(/Glimpselet/i);
  await reader.getByRole("button", { name: "Ask about page" }).click();
  await expect(panel.locator(".composer textarea")).toHaveValue(
    new RegExp(selected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await expect(panel.locator(".composer button.send")).toBeEnabled();
  const original = await reader
    .locator(".pdf-text-layer span")
    .first()
    .textContent();
  await panel
    .getByRole("button", { name: en.translatePage, exact: true })
    .click();
  await expect(reader.locator(".pdf-text-layer span").first()).toContainText(
    "Translated:",
  );
  await panel.getByRole("button", { name: en.restore, exact: true }).click();
  await expect(reader.locator(".pdf-text-layer span").first()).toHaveText(
    original!,
  );
  await expect(panel.locator(".composer button.send")).toBeEnabled();
  await reader
    .getByRole("button", {
      name: "Guide me through this section",
      exact: true,
    })
    .click();
  await expect(
    reader.locator("[data-glimpselet-overlay] .guide"),
  ).toBeVisible();
  await reader.keyboard.press("Escape");
  await expect(reader.locator("[data-glimpselet-overlay] .guide")).toHaveCount(
    0,
  );
  await reader.close();
});
