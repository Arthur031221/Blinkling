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
import { PanelError } from "../bridge/src/errors";
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

type PrivacyGateControl = { waiting: boolean; release: () => void };
async function holdAutomaticPrivacyCheck(page: Page, reject = false) {
  await page.evaluate((reject) => {
    const original = chrome.scripting.executeScript.bind(chrome.scripting);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const control = { waiting: false, release };
    (window as Window & { privacyGate?: PrivacyGateControl }).privacyGate =
      control;
    let checks = 0;
    chrome.scripting.executeScript = (async (
      injection: Parameters<typeof chrome.scripting.executeScript>[0],
    ) => {
      const result = await original(injection);
      if (
        injection.func?.toString().includes("current-password") &&
        ++checks === 3
      ) {
        control.waiting = true;
        await held;
        if (reject) return result.map((item) => ({ ...item, result: true }));
      }
      return result;
    }) as typeof chrome.scripting.executeScript;
  }, reject);
}

function twoPagePdf(): Buffer {
  const streams = [
    "BT /F1 20 Tf 54 720 Td (PDF_PAGE_ALPHA) Tj ET",
    "BT /F1 20 Tf 54 720 Td (PDF_PAGE_BETA) Tj ET",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${Buffer.byteLength(streams[0])} >>\nstream\n${streams[0]}\nendstream`,
    `<< /Length ${Buffer.byteLength(streams[1])} >>\nstream\n${streams[1]}\nendstream`,
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
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

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
    if (requestUrl.pathname === "/nested-password") {
      const kind = requestUrl.searchParams.get("kind");
      const nested =
        kind === "shadow"
          ? '<div id="nested"></div><script>document.querySelector("#nested").attachShadow({mode:"open"}).innerHTML=\'<input autocomplete="section-login current-password">\';</script>'
          : kind === "object"
            ? '<object data="/password" type="text/html"></object>'
            : `<iframe src="${kind === "opaque" ? origin.replace("127.0.0.1", "localhost") : origin}/password"></iframe>`;
      res.end(`${fixture.toString()}<p>PRIVATE_ACCOUNT_PAGE_TEXT</p>${nested}`);
      return;
    }
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

test("selection excludes private content between public endpoints and closes stale actions", async () => {
  await site.evaluate(() => {
    document.body.innerHTML =
      '<p id="start">Public introduction.</p><div data-private>PRIVATE_ACCOUNT_NUMBER_4831</div><div contenteditable>PRIVATE_UNSAVED_DRAFT</div><p id="end">Public conclusion.</p>';
    const range = document.createRange();
    range.setStart(document.querySelector("#start")!.firstChild!, 0);
    range.setEnd(document.querySelector("#end")!.firstChild!, 18);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await site.waitForTimeout(150);
  await expect(site.locator("[data-glimpselet-overlay] .popover")).toHaveCount(
    0,
  );
  expect(
    providerRequests.some((request) =>
      request.question.includes("PRIVATE_ACCOUNT_NUMBER_4831"),
    ),
  ).toBe(false);

  await site.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#start")!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const popover = site.locator("[data-glimpselet-overlay] .popover");
  await expect(popover).toBeVisible();
  await site.evaluate(() =>
    document.querySelector("#start")!.setAttribute("data-private", ""),
  );
  await popover.getByRole("button", { name: en.explain, exact: true }).click();
  await expect(popover).toHaveCount(0);
  await site.waitForTimeout(150);
  expect(
    providerRequests.some((request) =>
      request.question.startsWith("Explain this selected text:"),
    ),
  ).toBe(false);

  for (const dispatch of [false, true]) {
    await site.evaluate(() => {
      document.querySelector("#start")!.removeAttribute("data-private");
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#start")!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect(popover).toBeVisible();
    await site.evaluate((dispatch) => {
      const oldButton = document
        .querySelector("[data-glimpselet-overlay]")!
        .shadowRoot!.querySelector<HTMLButtonElement>(".popover button")!;
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("div[data-private]")!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      if (dispatch) document.dispatchEvent(new Event("selectionchange"));
      oldButton.click();
    }, dispatch);
    await expect(popover).toHaveCount(0);
    expect(
      providerRequests.some((request) =>
        request.question.startsWith("Explain this selected text:"),
      ),
    ).toBe(false);
  }

  await site.evaluate(() => {
    document.querySelector("#start")!.removeAttribute("data-private");
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#start")!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: en.explain, exact: true }).click();
  await expect
    .poll(() =>
      providerRequests.some((request) =>
        request.question.includes(
          "Explain this selected text: Public introduction.",
        ),
      ),
    )
    .toBe(true);
});

test("JPEG, WebP and GIF attachments reach the provider as PNG", async () => {
  for (const mimeType of ["image/jpeg", "image/webp", "image/gif"]) {
    const base64 =
      mimeType === "image/gif"
        ? "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        : await site.evaluate((type) => {
            const canvas = document.createElement("canvas");
            canvas.width = 2;
            canvas.height = 2;
            canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
            return canvas.toDataURL(type).split(",")[1];
          }, mimeType);
    const previous = providerRequests.filter(
      (request) => request.question === en.explainCapture,
    ).length;
    await panel.locator('input[type="file"]').setInputFiles({
      name: `attachment.${mimeType.split("/")[1]}`,
      mimeType,
      buffer: Buffer.from(base64, "base64"),
    });
    await expect(panel.locator(".capture-chip img")).toBeVisible();
    await panel
      .locator(".capture-chip")
      .getByRole("button", { name: en.explain, exact: true })
      .click();
    await expect
      .poll(
        () =>
          providerRequests.filter(
            (request) => request.question === en.explainCapture,
          ).length,
      )
      .toBe(previous + 1);
    const request = providerRequests
      .filter((request) => request.question === en.explainCapture)
      .at(-1)!;
    expect(request.image?.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    await expect(panel.locator(".composer button.send")).toBeVisible();
    await panel
      .locator(".capture-chip")
      .getByRole("button", { name: en.remove, exact: true })
      .click();
  }
});

test("a slow attachment cannot replace a newer image or restore a removed preview", async () => {
  const image = await site.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await panel.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    const scope = window as Window & { releaseAttachment?: () => void };
    window.createImageBitmap = (async (file: File) => {
      if (file.name.startsWith("slow"))
        await new Promise<void>(
          (resolve) => (scope.releaseAttachment = resolve),
        );
      return decode(file);
    }) as typeof createImageBitmap;
  });
  const input = panel.locator('input[type="file"]');
  const file = (name: string) => ({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  for (const remove of [false, true]) {
    await input.setInputFiles(file("slow.png"));
    await expect
      .poll(() =>
        panel.evaluate(() =>
          Boolean(
            (window as Window & { releaseAttachment?: () => void })
              .releaseAttachment,
          ),
        ),
      )
      .toBe(true);
    await input.setInputFiles(file("newer.png"));
    await expect(panel.locator(".capture-chip")).toContainText("newer.png");
    if (remove)
      await panel
        .locator(".capture-chip")
        .getByRole("button", { name: en.remove, exact: true })
        .click();
    await panel.evaluate(() => {
      const scope = window as Window & { releaseAttachment?: () => void };
      scope.releaseAttachment!();
      delete scope.releaseAttachment;
    });
    await panel.waitForTimeout(150);
    if (remove) await expect(panel.locator(".capture-chip")).toHaveCount(0);
    else
      await expect(panel.locator(".capture-chip")).toContainText("newer.png");
  }
});

test("Chrome registers the global crop shortcut and Settings explains the Mac binding", async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  expect(
    commands.find((command) => command.name === "crop-global")?.shortcut,
  ).toBe("Ctrl+Shift+7");
  expect(
    commands.find((command) => command.name === "crop-screen")?.shortcut,
  ).toBe("Ctrl+Shift+S");
  await panel.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(panel.locator(".dialog")).toContainText(en.globalCropShortcut);
  await panel.getByRole("button", { name: en.close, exact: true }).click();
});

test("automatic questions exclude nested form choices while preserving safe labels", async () => {
  await context.route(origin + "/choice-privacy", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<title>Article</title><p>Public article text</p><label for="choice">Safe field label</label><select id="choice"><option>PRIVATE_NATIVE_CHOICE</option></select><div role="option"><span>PRIVATE_NESTED_CHOICE</span><h2 aria-label="PRIVATE_HEADING_LABEL">PRIVATE_HEADING_TEXT</h2></div><div role="combobox" aria-label="Safe dropdown label">PRIVATE_SELECTION</div><button>Safe action</button>',
    });
  });
  await site.goto(origin + "/choice-privacy");
  await expect
    .poll(() =>
      providerRequests.find(
        (request) =>
          request.question.startsWith("Give 3 to 5") &&
          request.page?.url.endsWith("/choice-privacy"),
      ),
    )
    .toBeTruthy();
  const page = providerRequests.find((request) =>
    request.page?.url.endsWith("/choice-privacy"),
  )!.page!;
  expect(JSON.stringify(page)).not.toContain("PRIVATE_");
  expect(page.text).toContain("Public article text");
  expect(page.elements.map((element) => element.text)).toContain(
    "Safe field label",
  );
  expect(page.elements.map((element) => element.text)).toContain(
    "Safe dropdown label",
  );
});

for (const startup of [false, true]) {
  test(`${startup ? "startup auto-pairing" : "re-pairing"} moves questions, page text and captures to the new project`, async () => {
    const secondServer = createServer();
    let secondOrigin = "";
    const secondRequests: ProviderRequest[] = [];
    const secondDirectory = await mkdtemp(join(directory, "new-project-"));
    const secondBridge = new ExtensionBridge(secondServer, () => secondOrigin, {
      provider: (request) => {
        secondRequests.push(request);
        return providerResponder(request);
      },
      sessions: new ExtensionSessions(secondDirectory, async () => []),
    });
    try {
      secondServer.listen(0, "127.0.0.1");
      await once(secondServer, "listening");
      const address = secondServer.address();
      if (!address || typeof address === "string")
        throw new Error("No second port");
      secondOrigin = `http://127.0.0.1:${address.port}`;
      const previousSession = await panel
        .locator(".foot span")
        .first()
        .innerText();
      if (startup) {
        await context.addInitScript(() => {
          if (!location.search.includes("delayedCredentials=1")) return;
          const session = chrome.storage.session;
          const read = session.get.bind(session);
          session.get = (async (keys: string[]) => {
            const saved = await read(keys);
            if (!keys.includes("bridgeToken")) return saved;
            return new Promise((resolve) => {
              (
                window as Window & { releaseCredentials?: () => void }
              ).releaseCredentials = () => resolve(saved);
            });
          }) as typeof session.get;
        });
        const automaticUrl = new URL(panel.url());
        automaticUrl.searchParams.set("pairPort", String(address.port));
        automaticUrl.searchParams.set("pairCode", secondBridge.issueCode());
        automaticUrl.searchParams.set("delayedCredentials", "1");
        await panel.close();
        const opened = context.waitForEvent("page");
        await worker.evaluate(
          (url) =>
            chrome.windows.create({
              url,
              type: "popup",
              width: 460,
              height: 720,
            }),
          automaticUrl.href,
        );
        panel = await opened;
        await panel.waitForLoadState();
        await expect(panel.locator(".connection")).toContainText(
          secondDirectory.split("/").at(-1)!,
        );
        await panel.evaluate(() => {
          (window as Window & { releaseCredentials?: () => void })
            .releaseCredentials!();
          history.replaceState(null, "", location.pathname);
        });
        await expect(panel.locator(".suggestions button")).toHaveCount(3);
        const sockets = (
          secondBridge as unknown as {
            sockets: { clients: Set<import("ws").WebSocket> };
          }
        ).sockets.clients;
        const retiredSockets = [...sockets];
        for (const socket of retiredSockets)
          socket.close(4000, "Reconnect probe");
        await expect
          .poll(() =>
            [...sockets].some(
              (socket) =>
                socket.readyState === 1 && !retiredSockets.includes(socket),
            ),
          )
          .toBe(true);
        await expect(panel.locator(".connection")).toHaveClass(/online/);
        await expect(panel.locator(".connection")).toContainText(
          secondDirectory.split("/").at(-1)!,
        );
      } else {
        await panel
          .getByRole("button", { name: en.settings, exact: true })
          .click();
        await panel
          .locator(".dialog input")
          .nth(0)
          .fill(secondOrigin.replace("http:", "ws:") + "/extension");
        await panel
          .locator(".dialog input")
          .nth(1)
          .fill(secondBridge.issueCode());
        await panel.getByRole("button", { name: en.pair, exact: true }).click();
      }
      await expect(panel.locator(".connection")).toContainText(
        secondDirectory.split("/").at(-1)!,
      );
      await expect(panel.locator(".foot span").first()).not.toHaveText(
        previousSession,
      );
      if (!startup)
        await panel
          .getByRole("button", { name: en.close, exact: true })
          .click();
      await panel
        .getByRole("button", { name: en.visible, exact: true })
        .click();
      await expect(panel.locator(".capture-chip img")).toBeVisible();
      await panel
        .locator(".composer textarea")
        .fill("Only the new project should receive this capture.");
      await panel.locator(".composer button.send").click();
      try {
        await expect
          .poll(() =>
            secondRequests.some(
              (request) =>
                request.question ===
                "Only the new project should receive this capture.",
            ),
          )
          .toBe(true);
      } catch (error) {
        console.log("Pairing request diagnostics", {
          status: await panel.locator(".status").innerText(),
          connection: await panel.locator(".connection").innerText(),
          draft: await panel.locator(".composer textarea").inputValue(),
          thread: (await panel.locator(".thread").innerText()).slice(-1000),
          newQuestions: secondRequests.map((request) => request.question),
          oldQuestions: providerRequests.map((request) => request.question),
        });
        throw error;
      }
      const request = secondRequests.find(
        (entry) =>
          entry.question ===
          "Only the new project should receive this capture.",
      )!;
      expect(request.cliSession?.project).toBe(secondDirectory);
      expect(request.page?.title).toBe("Notebook exports");
      expect(request.page?.text).toContain(
        "このページは研究ノートの使い方を説明します。",
      );
      await expect(panel.locator(".foot span").first()).toContainText(
        request.cliSession!.id.slice(0, 8),
      );
      expect(Buffer.isBuffer(request.image)).toBe(true);
      expect(request.image!.length).toBeGreaterThan(100);
      expect(
        providerRequests.some((entry) => entry.question === request.question),
      ).toBe(false);
      await expect(panel.locator(".composer button.send")).toBeVisible();
      const expectedToken = await worker.evaluate(
        async () =>
          (await chrome.storage.session.get("bridgeToken")).bridgeToken,
      );
      const expectedSession = await panel
        .locator(".foot span")
        .first()
        .innerText();
      await panel.reload();
      await expect(panel.locator(".connection")).toContainText(
        secondDirectory.split("/").at(-1)!,
      );
      await expect(panel.locator(".foot span").first()).toHaveText(
        expectedSession,
      );
      expect(
        await worker.evaluate(
          async () =>
            (await chrome.storage.session.get("bridgeToken")).bridgeToken,
        ),
      ).toBe(expectedToken);
      await panel
        .locator(".composer textarea")
        .fill("Stay in the new project after reloading.");
      await panel.locator(".composer button.send").click();
      await expect
        .poll(() =>
          secondRequests.some(
            (entry) =>
              entry.question === "Stay in the new project after reloading.",
          ),
        )
        .toBe(true);
      expect(
        providerRequests.some(
          (entry) =>
            entry.question === "Stay in the new project after reloading.",
        ),
      ).toBe(false);
    } finally {
      await secondBridge.close();
      if (secondServer.listening)
        await new Promise<void>((resolve) =>
          secondServer.close(() => resolve()),
        );
    }
  });
}

test("a second live panel keeps ownership long enough to finish its answer", async () => {
  const originalProvider = providerResponder;
  providerResponder = async (request) => {
    if (request.question !== "Finish in the new panel")
      return originalProvider(request);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1800);
      request.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Answer interrupted by another panel"));
        },
        { once: true },
      );
    });
    return {
      answer: "New panel answer completed",
      sessionId: request.cliSession?.id,
    };
  };
  const opened = context.waitForEvent("page");
  await worker.evaluate(
    (url) =>
      chrome.windows.create({ url, type: "popup", width: 420, height: 620 }),
    panel.url(),
  );
  const second = await opened;
  try {
    await expect(second.locator(".connection")).toHaveClass(/online/);
    await expect(panel.locator(".connection")).not.toHaveClass(/online/);
    await expect(second.locator(".suggestions button")).toHaveCount(3);
    await second.locator(".composer textarea").fill("Finish in the new panel");
    await second.locator(".composer button.send").click();
    await expect(second.locator(".thread article").last()).toContainText(
      "New panel answer completed",
    );
    expect(
      providerRequests.filter(
        (request) => request.question === "Finish in the new panel",
      ),
    ).toHaveLength(1);
    await expect(second.locator(".connection")).toHaveClass(/online/);
    await expect(panel.locator(".connection")).not.toHaveClass(/online/);
  } finally {
    await second.close();
  }
});

test("interrupted session initialization offers a working new session", async () => {
  providerResponder = async (request) => {
    if (request.question === "Start failed conversation")
      throw new PanelError(
        "session_initialization",
        "Choose New session to try again.",
        409,
      );
    return {
      answer: "A new conversation works",
      sessionId: request.cliSession?.id,
    };
  };
  await panel.locator(".composer textarea").fill("Start failed conversation");
  await panel.locator(".composer button.send").click();
  await expect(panel.locator(".status")).toHaveText(en.sessionInitialization);
  const previous = providerRequests.find(
    (request) => request.question === "Start failed conversation",
  )!.cliSession!.id;
  await panel.getByRole("button", { name: en.sessions, exact: true }).click();
  await panel.getByRole("button", { name: en.newThread }).click();
  await expect(panel.locator(".sessions")).toHaveCount(0);
  await panel.locator(".composer textarea").fill("Try the new conversation");
  await panel.locator(".composer button.send").click();
  await expect(panel.locator(".thread article").last()).toContainText(
    "A new conversation works",
  );
  const current = providerRequests.find(
    (request) => request.question === "Try the new conversation",
  )!.cliSession!;
  expect(current.id).not.toBe(previous);
  expect(current.resume).toBe(false);
});

test("same-URL semantic DOM changes refresh once and ignore identical re-renders", async () => {
  const automaticRequests = () =>
    providerRequests.filter((request) =>
      request.question.startsWith("Give 3 to 5"),
    );
  await expect.poll(() => automaticRequests().length).toBeGreaterThan(0);
  const initialCount = automaticRequests().length;
  await site.evaluate(() => {
    document.querySelector("#foreign")!.textContent =
      "Same URL refreshed article marker.";
  });
  await expect
    .poll(() =>
      automaticRequests().some((request) =>
        request.page?.text.includes("Same URL refreshed article marker."),
      ),
    )
    .toBe(true);
  const refreshedCount = automaticRequests().length;
  expect(refreshedCount).toBe(initialCount + 1);
  await site.evaluate(() => {
    const paragraph = document.querySelector("#foreign")!;
    paragraph.replaceWith(paragraph.cloneNode(true));
    document
      .querySelector("#export")!
      .setAttribute("aria-label", "Export notebook");
    const privateBlock = document.createElement("div");
    privateBlock.dataset.private = "true";
    privateBlock.textContent = "Private data";
    document.body.append(privateBlock);
    privateBlock.firstChild!.textContent = "Changed private data";
    const password = document.createElement("input");
    password.type = "password";
    password.value = "secret input value";
    document.body.append(password);
    const overlay = document.createElement("div");
    overlay.dataset.glimpseletOverlay = "true";
    overlay.textContent = "Overlay only";
    document.body.append(overlay);
    overlay.firstChild!.textContent = "Changed overlay only";
  });
  await site.waitForTimeout(1300);
  expect(automaticRequests()).toHaveLength(refreshedCount);
});

for (const kind of ["shadow", "frame", "opaque", "object"] as const) {
  for (const mode of ["suggest", "passive"] as const) {
    test(`${kind} password gate prevents ${mode} requests and visible capture`, async () => {
      if (mode === "passive") {
        await panel
          .getByRole("button", { name: en.passive, exact: true })
          .click();
        await expect
          .poll(() =>
            providerRequests.some(
              (request) => request.question === en.passivePrompt,
            ),
          )
          .toBe(true);
        await expect(panel.locator(".composer button.send")).toBeVisible();
        await site.waitForTimeout(300);
      }
      providerRequests = [];
      await site.goto(`${origin}/nested-password?kind=${kind}`);
      await expect(panel.locator(".suggestions button")).toHaveCount(0);
      await site.waitForTimeout(1600);
      expect(providerRequests).toHaveLength(0);
      await panel
        .getByRole("button", { name: en.visible, exact: true })
        .click();
      await expect(panel.locator(".status")).toContainText(en.passwordPage);
      await expect(panel.locator(".capture-chip")).toHaveCount(0);
      expect(providerRequests).toHaveLength(0);
    });
  }
}

for (const kind of ["shadow", "frame"] as const) {
  test(`same-URL ${kind} password changes pause and restore questions`, async () => {
    await site.evaluate(async (kind) => {
      const host = document.createElement(kind === "frame" ? "iframe" : "div");
      host.id = "nested-privacy";
      document.body.append(host);
      if (host instanceof HTMLIFrameElement) {
        await new Promise<void>((resolve) => {
          if (host.contentDocument?.readyState === "complete") resolve();
          else host.addEventListener("load", () => resolve(), { once: true });
        });
        host.contentDocument!.body.innerHTML = '<input type="text">';
      } else
        host.attachShadow({ mode: "open" }).innerHTML = '<input type="text">';
    }, kind);
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    await site.waitForTimeout(1000);
    const initialCount = providerRequests.length;
    await site.evaluate((kind) => {
      const host = document.querySelector("#nested-privacy")!;
      const root =
        kind === "frame"
          ? (host as HTMLIFrameElement).contentDocument!
          : host.shadowRoot!;
      root.querySelector("input")!.autocomplete = "new-password";
    }, kind);
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    await site.waitForTimeout(900);
    expect(providerRequests).toHaveLength(initialCount);
    await site.evaluate((kind) => {
      const host = document.querySelector("#nested-privacy")!;
      const root =
        kind === "frame"
          ? (host as HTMLIFrameElement).contentDocument!
          : host.shadowRoot!;
      root.querySelector("input")!.removeAttribute("autocomplete");
    }, kind);
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    expect(providerRequests.length).toBeGreaterThan(initialCount);
  });
}

test("a password appearing during region selection rejects the resulting capture", async () => {
  await panel.getByRole("button", { name: en.region, exact: true }).click();
  await expect(site.locator("[data-glimpselet-crop] .surface")).toBeVisible();
  await site.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).innerHTML = '<input type="password">';
  });
  await site.mouse.move(60, 80);
  await site.mouse.down();
  await site.mouse.move(340, 260);
  await site.mouse.up();
  await site.keyboard.press("Enter");
  await expect(panel.locator(".status")).toContainText(en.passwordPage);
  await expect(panel.locator(".capture-chip")).toHaveCount(0);
});

test("a password appearing between full page frames discards the capture and restores scroll", async () => {
  await site.evaluate(() => scrollTo(0, 400));
  const originalScroll = await site.evaluate(() => scrollY);
  await panel.evaluate(() => {
    const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
    let count = 0;
    chrome.tabs.captureVisibleTab = (async (
      windowId: number,
      options: chrome.tabs.ImageDetails,
    ) => {
      const image = await original(windowId, options);
      if (++count === 1) {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => {
            const host = document.createElement("div");
            document.body.append(host);
            host.attachShadow({ mode: "open" }).innerHTML =
              '<input type="password">';
          },
        });
      }
      return image;
    }) as typeof chrome.tabs.captureVisibleTab;
  });
  await panel.getByRole("button", { name: en.fullPage, exact: true }).click();
  await expect(panel.locator(".status")).toContainText(en.passwordPage);
  await expect(panel.locator(".capture-chip")).toHaveCount(0);
  await expect.poll(() => site.evaluate(() => scrollY)).toBe(originalScroll);
});

test("a password appearing after context collection prevents automatic transmission", async () => {
  await panel.evaluate(() => {
    const original = chrome.tabs.sendMessage.bind(chrome.tabs);
    let inserted = false;
    let contexts = 0;
    chrome.tabs.sendMessage = (async (
      tabId: number,
      message: { type?: string },
    ) => {
      const result = await original(tabId, message);
      if (
        !inserted &&
        message.type === "glimpselet:context" &&
        ++contexts === 2
      ) {
        inserted = true;
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const host = document.createElement("div");
            document.body.append(host);
            host.attachShadow({ mode: "open" }).innerHTML =
              '<input autocomplete="current-password">';
          },
        });
      }
      return result;
    }) as typeof chrome.tabs.sendMessage;
  });
  const initialCount = providerRequests.length;
  await site.evaluate(() => {
    document.querySelector("#foreign")!.textContent = "Account page changed.";
  });
  await expect(panel.locator(".suggestions button")).toHaveCount(0);
  await site.waitForTimeout(1700);
  expect(providerRequests).toHaveLength(initialCount);
});

for (const action of ["clear", "send"] as const) {
  test(`automatic refresh waits for a draft and resumes after ${action}`, async () => {
    await panel
      .locator(".composer textarea")
      .fill("Keep my draft ready to send.");
    const initialCount = providerRequests.length;
    await site.evaluate(() => {
      document.querySelector("#foreign")!.textContent = "Draft page changed.";
    });
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    await site.waitForTimeout(1200);
    expect(providerRequests).toHaveLength(initialCount);
    await expect(panel.locator(".composer button.send")).toBeEnabled();
    if (action === "clear") await panel.locator(".composer textarea").fill("");
    else {
      await panel.locator(".composer button.send").click();
      await expect
        .poll(() =>
          providerRequests.some(
            (request) => request.question === "Keep my draft ready to send.",
          ),
        )
        .toBe(true);
    }
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    expect(providerRequests.length).toBeGreaterThan(initialCount);
    expect(providerRequests.at(-1)!.page?.text).toContain(
      "Draft page changed.",
    );
  });
}

for (const backend of ["bridge", "api"] as const) {
  for (const action of ["stop", "draft"] as const) {
    test(`${backend} ${action} during the final privacy check prevents automatic dispatch`, async () => {
      const apiRequests: string[] = [];
      if (backend === "api") {
        await context.route(
          "https://api.anthropic.com/v1/messages",
          async (route) => {
            const headers = {
              "access-control-allow-origin": "*",
              "access-control-allow-headers": "*",
              "access-control-allow-methods": "POST, OPTIONS",
            };
            if (route.request().method() === "OPTIONS") {
              await route.fulfill({ status: 204, headers });
              return;
            }
            apiRequests.push(route.request().postData()!);
            await route.fulfill({
              contentType: "text/event-stream",
              headers,
              body: [
                {
                  type: "content_block_delta",
                  delta: {
                    type: "text_delta",
                    text: JSON.stringify({
                      questions: [
                        "API question one?",
                        "API question two?",
                        "API question three?",
                      ],
                    }),
                  },
                },
                { type: "message_stop" },
              ]
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
      const requestCount = () =>
        backend === "api" ? apiRequests.length : providerRequests.length;
      const initialCount = requestCount();
      await holdAutomaticPrivacyCheck(panel);
      await site.evaluate(() => {
        document.querySelector("#foreign")!.textContent =
          "Final privacy gate page.";
      });
      await expect
        .poll(() =>
          panel.evaluate(
            () =>
              (window as Window & { privacyGate?: PrivacyGateControl })
                .privacyGate?.waiting,
          ),
        )
        .toBe(true);
      if (action === "stop") {
        await panel.getByRole("button", { name: /Stop/ }).click();
        await expect(panel.locator(".composer button.send")).toBeVisible();
      } else
        await panel
          .locator(".composer textarea")
          .fill("Draft typed while checking.");
      await panel.evaluate(() =>
        (
          window as Window & { privacyGate?: PrivacyGateControl }
        ).privacyGate!.release(),
      );
      await expect(panel.locator(".composer button.send")).toBeVisible();
      await site.waitForTimeout(1100);
      expect(requestCount()).toBe(initialCount);
      if (action === "stop")
        await expect(panel.locator(".status")).toContainText(en.stopped);
      else {
        await expect(panel.locator(".composer textarea")).toHaveValue(
          "Draft typed while checking.",
        );
        await panel.locator(".composer textarea").fill("");
        await expect(panel.locator(".suggestions button")).toHaveCount(3);
        expect(requestCount()).toBeGreaterThan(initialCount);
      }
    });
  }
}

test("transient privacy rejection retries the same public page", async () => {
  const initialCount = providerRequests.length;
  await holdAutomaticPrivacyCheck(panel, true);
  await site.evaluate(() => {
    document.querySelector("#foreign")!.textContent = "Transient privacy page.";
  });
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          (window as Window & { privacyGate?: PrivacyGateControl }).privacyGate
            ?.waiting,
      ),
    )
    .toBe(true);
  await panel.evaluate(() =>
    (
      window as Window & { privacyGate?: PrivacyGateControl }
    ).privacyGate!.release(),
  );
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
  expect(providerRequests).toHaveLength(initialCount + 1);
  expect(providerRequests.at(-1)!.page?.text).toContain(
    "Transient privacy page.",
  );
});

test("same-URL password field changes pause and restore automatic questions", async () => {
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
  const input = await site.evaluateHandle(() => {
    const field = document.createElement("input");
    field.type = "text";
    field.value = "PRIVATE_PASSWORD_VALUE";
    document.body.append(field);
    return field;
  });
  await site.waitForTimeout(800);
  const initialCount = providerRequests.length;
  await input.evaluate((field) => (field.type = "password"));
  await expect(panel.locator(".suggestions button")).toHaveCount(0);
  await site.waitForTimeout(800);
  expect(providerRequests).toHaveLength(initialCount);
  await input.evaluate((field) => (field.type = "text"));
  await expect(panel.locator(".suggestions button")).toHaveCount(3);
  expect(providerRequests.length).toBeGreaterThan(initialCount);
  expect(
    providerRequests.some((request) =>
      request.page?.text.includes("PRIVATE_PASSWORD_VALUE"),
    ),
  ).toBe(false);
});

test("same-URL changes queue behind a foreground answer and refresh afterward", async () => {
  let releaseForeground: (() => void) | undefined;
  providerResponder = (request) => {
    if (request.question === "Hold same-URL foreground answer.")
      return new Promise((resolveAnswer) => {
        releaseForeground = () =>
          resolveAnswer({ answer: "Foreground answer completed." });
      });
    return Promise.resolve({
      answer: JSON.stringify({
        questions: [
          "Updated page question one?",
          "Updated page question two?",
          "Updated page question three?",
        ],
      }),
    });
  };
  try {
    await panel
      .locator(".composer textarea")
      .fill("Hold same-URL foreground answer.");
    await panel.locator(".composer button.send").click();
    await expect.poll(() => Boolean(releaseForeground)).toBe(true);
    await site.evaluate(() => {
      document.querySelector("#foreign")!.textContent =
        "Queued same URL page revision.";
    });
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    releaseForeground!();
    await expect(panel.locator(".thread article").last()).toContainText(
      "Foreground answer completed.",
    );
    await expect
      .poll(() =>
        providerRequests.some(
          (request) =>
            request.question.startsWith("Give 3 to 5") &&
            request.page?.text.includes("Queued same URL page revision."),
        ),
      )
      .toBe(true);
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
  } finally {
    releaseForeground?.();
  }
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
    await panel.getByRole("button", { name: en.settings }).click();
    await expect(panel.locator(".dialog select").first()).toBeDisabled();
    await panel.getByRole("button", { name: en.close, exact: true }).click();
    await panel.locator(".composer textarea").fill("Keep this unsent draft.");
    await panel.locator(".composer textarea").press("Enter");
    await expect(panel.locator(".composer textarea")).toHaveValue(
      "Keep this unsent draft.",
    );
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
    await expect(panel.locator(".composer button.send")).toBeEnabled();
    expect(
      providerRequests.some((request) =>
        request.page?.url.endsWith("/after-stop"),
      ),
    ).toBe(false);
    await panel.locator(".composer textarea").fill("");
    await expect(panel.locator(".suggestions")).toContainText(
      "After stop question one?",
    );
    await expect(panel.locator(".thread article").last()).toContainText(
      "Partial reply kept.",
    );
    await expect(panel.locator(".composer button.send")).toBeDisabled();
  } finally {
    finishProvider?.();
  }
});

test("direct API Stop waits for stream cleanup before refreshing the page", async () => {
  const apiQuestions: string[] = [];
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
        .content.find((block: { type: string }) => block.type === "text").text;
      apiQuestions.push(question);
      const pending = question.startsWith("Keep API reply pending.");
      const events: unknown[] = [
        {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: pending
              ? "Partial API reply kept."
              : JSON.stringify({
                  questions: [
                    "API question one?",
                    "API question two?",
                    "API question three?",
                  ],
                }),
          },
        },
      ];
      if (!pending) events.push({ type: "message_stop" });
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
  type StopControl = {
    release: () => void;
    waiting: boolean;
    aborted: boolean;
    released: boolean;
  };
  await panel.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolveCleanup) => {
      releaseCleanup = resolveCleanup;
    });
    const state = {
      release: releaseCleanup,
      waiting: false,
      aborted: false,
      released: false,
    };
    (window as Window & { apiStopControl?: StopControl }).apiStopControl =
      state;
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (!String(args[1]?.body).includes("Keep API reply pending."))
        return response;
      const reader = response.body!.getReader();
      let first = true;
      let finishRead:
        | ((result: ReadableStreamReadResult<Uint8Array>) => void)
        | undefined;
      Object.defineProperty(response.body, "getReader", {
        value: () => ({
          read: () => {
            if (first) {
              first = false;
              return reader.read();
            }
            state.waiting = true;
            return new Promise<ReadableStreamReadResult<Uint8Array>>(
              (resolveRead) => {
                finishRead = resolveRead;
              },
            );
          },
          cancel: async () => {
            // Native streams close on the first cancel; later cancels resolve immediately.
            if (state.aborted) return;
            state.aborted = true;
            finishRead?.({ done: true, value: undefined });
            await cleanup;
            await reader.cancel();
          },
          releaseLock: () => {
            reader.releaseLock();
            state.released = true;
          },
        }),
      });
      return response;
    };
  });
  const control = async (key: "waiting" | "aborted" | "released") =>
    panel.evaluate(
      (property) =>
        (window as Window & { apiStopControl?: StopControl }).apiStopControl?.[
          property
        ],
      key,
    );
  try {
    await panel.locator(".composer textarea").fill("Keep API reply pending.");
    await panel.locator(".composer button.send").click();
    await expect.poll(() => control("waiting")).toBe(true);
    await panel.getByRole("button", { name: en.settings }).click();
    await expect(panel.locator(".dialog select").first()).toBeDisabled();
    await panel.getByRole("button", { name: en.close, exact: true }).click();
    await panel.locator(".composer textarea").fill("Keep this unsent draft.");
    await panel.locator(".composer textarea").press("Enter");
    await expect(panel.locator(".composer textarea")).toHaveValue(
      "Keep this unsent draft.",
    );
    const next = await context.newPage();
    await next.goto(origin + "/after-api-stop");
    await next.bringToFront();
    await expect(panel.locator(".suggestions button")).toHaveCount(0);
    await panel.getByRole("button", { name: /Stop/ }).click();
    await expect.poll(() => control("aborted")).toBe(true);
    await panel.locator(".composer textarea").fill("Next question");
    await expect(panel.locator(".composer button.stop")).toBeVisible();
    await expect(panel.locator(".composer button.send")).toHaveCount(0);
    expect(
      apiQuestions.some((question) =>
        question.includes(origin + "/after-api-stop"),
      ),
    ).toBe(false);
    await panel.evaluate(() =>
      (
        window as Window & { apiStopControl?: StopControl }
      ).apiStopControl?.release(),
    );
    await expect(panel.locator(".composer button.send")).toBeEnabled();
    expect(
      apiQuestions.some((question) =>
        question.includes(origin + "/after-api-stop"),
      ),
    ).toBe(false);
    await panel.locator(".composer textarea").fill("");
    await expect(panel.locator(".suggestions")).toContainText(
      "API question one?",
    );
    await expect(panel.locator(".thread article").last()).toContainText(
      "Partial API reply kept.",
    );
    await expect(panel.locator(".composer button.send")).toBeDisabled();
    expect(await control("released")).toBe(true);
  } finally {
    await panel.evaluate(() =>
      (
        window as Window & { apiStopControl?: StopControl }
      ).apiStopControl?.release(),
    );
  }
});

test("composing Enter keeps a draft without sending it", async () => {
  const requestCount = providerRequests.length;
  const composer = panel.locator(".composer textarea");
  await composer.fill("這是尚未輸入完的問題");
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
  });
  await expect(composer).toHaveValue("這是尚未輸入完的問題");
  expect(providerRequests).toHaveLength(requestCount);
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

test("remote welcome installs on the browser computer in both languages", async () => {
  const tunnel = "ssh -N -L 37115:127.0.0.1:37115 levi@linux-host";
  await context.route(origin + "/install/status?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        connected: false,
        mode: "tunnel",
        tunnelCommand: tunnel,
      }),
    });
  });
  const welcome = await context.newPage();
  await welcome.goto(`${origin}/install#code=${bridge.issueCode()}`);
  await expect(welcome.locator("#install-remote")).toBeVisible();
  await expect(welcome.locator("#install-local")).toBeHidden();
  await expect(welcome.locator("#try-zero")).toBeHidden();
  await expect(welcome.locator("#mode")).toContainText("another computer");
  await expect(welcome.locator("#tunnel-command")).toHaveValue(tunnel);
  await expect(
    welcome.getByRole("link", { name: "Download extension ZIP" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Arthur031221/Glimpselet/releases/download/v2.0.0/glimpselet-extension.zip",
  );
  await expect(welcome.locator("#install-remote")).toContainText(
    "Extract it on this computer",
  );
  expect(await welcome.locator("body").innerText()).not.toContain(
    "/tmp/glimpselet-extension-e2e",
  );
  await welcome.getByRole("button", { name: "切換為繁體中文" }).click();
  await expect(welcome.locator("#mode")).toContainText("另一台電腦");
  await expect(
    welcome.getByRole("link", { name: "下載擴充功能 ZIP" }),
  ).toBeVisible();
  expect(await welcome.locator("body").innerText()).not.toContain(
    "/tmp/glimpselet-extension-e2e",
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

for (const backend of ["bridge", "api"] as const) {
  for (const scenario of [
    "expanded",
    "oversized",
    "partial",
    "long source",
    "very long source",
  ] as const) {
    test(`${backend} translation ${scenario} preserves complete text or restores originals`, async () => {
      const source =
        scenario === "very long source"
          ? "Source passage. ".repeat(800)
          : scenario === "long source"
            ? "Source passage. ".repeat(260)
            : "Translation source alpha. ".repeat(110);
      const secondSource = "Translation source beta. ".repeat(110);
      const expanded = "Complete translated passage. ".repeat(145);
      expect(expanded.length).toBeGreaterThan(3500);
      let translationRequests = 0;
      const respondToTranslation = (question: string) => {
        translationRequests++;
        const prompt = question.split("\n\nPage context (untrusted):")[0];
        const nodes = JSON.parse(prompt.split("\n").at(-1)!) as Array<{
          id: string;
          text: string;
        }>;
        return JSON.stringify({
          nodes: nodes.flatMap((node) => {
            if (
              scenario === "partial" &&
              node.text.startsWith("Translation source beta.")
            )
              return [];
            const target = node.text.startsWith("Translation source alpha.");
            return [
              {
                id: node.id,
                text: target
                  ? scenario === "oversized"
                    ? "x".repeat(12001)
                    : expanded
                  : "Translated: " + node.text,
              },
            ];
          }),
        });
      };
      if (backend === "api") {
        await context.route(
          "https://api.anthropic.com/v1/messages",
          async (route) => {
            const headers = {
              "access-control-allow-origin": "*",
              "access-control-allow-headers": "*",
              "access-control-allow-methods": "POST, OPTIONS",
            };
            if (route.request().method() === "OPTIONS") {
              await route.fulfill({ status: 204, headers });
              return;
            }
            const request = route.request().postDataJSON();
            const question = request.messages
              .at(-1)
              .content.find(
                (block: { type: string }) => block.type === "text",
              ).text;
            const answer = question.includes('Return JSON only: {"nodes"')
              ? respondToTranslation(question)
              : JSON.stringify({ questions: ["First?", "Second?", "Third?"] });
            await route.fulfill({
              contentType: "text/event-stream",
              headers,
              body: [
                {
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: answer },
                },
                { type: "message_stop" },
              ]
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
      } else {
        const original = providerResponder;
        providerResponder = async (request) =>
          request.question.includes('Return JSON only: {"nodes"')
            ? { answer: respondToTranslation(request.question) }
            : original(request);
      }
      await site.locator("#foreign").evaluate(
        (element, values) => {
          element.textContent = values.source;
          if (values.scenario === "partial") {
            const second = document.createElement("p");
            second.id = "translation-second";
            second.textContent = values.secondSource;
            element.after(second);
          }
        },
        { source, secondSource, scenario },
      );
      await site.bringToFront();
      await expect(panel.locator(".suggestions button")).toHaveCount(3);
      const translate = panel.getByRole("button", {
        name: en.translate,
        exact: true,
      });
      await expect(translate).toBeEnabled();
      await translate.click();
      if (scenario === "expanded") {
        await expect(site.locator("#foreign")).toHaveText(expanded);
        await expect(panel.locator(".status")).toHaveText(
          en.translationApplied,
        );
        await panel
          .getByRole("button", { name: en.restore, exact: true })
          .click();
        await expect(site.locator("#foreign")).toHaveText(source);
      } else {
        await expect(panel.locator(".status")).toContainText(
          scenario === "partial"
            ? en.partialFailureRestore
            : en.translationIncomplete,
        );
        await expect(site.locator("#foreign")).toHaveText(source);
        if (scenario === "partial") {
          expect(translationRequests).toBeGreaterThanOrEqual(2);
          await expect(site.locator("#translation-second")).toHaveText(
            secondSource,
          );
        }
        if (scenario === "long source" || scenario === "very long source")
          expect(translationRequests).toBe(0);
        await expect(
          panel.getByRole("button", { name: en.restore, exact: true }),
        ).not.toBeVisible();
      }
    });
  }
}

test("translation preserves dynamic site updates and invalidates delayed node responses", async () => {
  const send = async (message: Record<string, unknown>) =>
    worker.evaluate(
      async ({ url, message }) => {
        const tab = (await chrome.tabs.query({})).find(
          (entry) => entry.url === url,
        );
        if (!tab?.id) throw new Error("Source tab missing");
        return chrome.tabs.sendMessage(tab.id, message);
      },
      { url: site.url(), message },
    );
  const update = (value: string) =>
    site.locator("#foreign").evaluate((element, value) => {
      element.firstChild!.nodeValue = value;
    }, value);
  const collect = async () => {
    const result = (await send({ type: "glimpselet:text-nodes" })) as {
      nodes: Array<{ id: string; text: string }>;
    };
    return result.nodes.find((node) => node.text.startsWith("Price $"))!;
  };
  const translate = (id: string, text: string) =>
    send({ type: "glimpselet:translate", nodes: [{ id, text }] });
  await update("Price $10");
  const first = await collect();
  expect(first.text).toBe("Price $10");
  await update("Price $12");
  expect(await translate(first.id, "Stale price")).toEqual({ applied: 0 });
  await expect(site.locator("#foreign")).toHaveText("Price $12");
  const second = await collect();
  expect(second.id).not.toBe(first.id);
  expect(second.text).toBe("Price $12");
  expect(await translate(second.id, "Prix 12")).toEqual({ applied: 1 });
  await update("Price $15");
  expect(await send({ type: "glimpselet:restore" })).toEqual({ restored: 0 });
  await expect(site.locator("#foreign")).toHaveText("Price $15");
  const third = await collect();
  expect(third.id).not.toBe(second.id);
  expect(await translate(second.id, "Stale restored price")).toEqual({
    applied: 0,
  });
  expect(await translate(third.id, "Prix 15")).toEqual({ applied: 1 });
  expect(await send({ type: "glimpselet:restore" })).toEqual({ restored: 1 });
  await expect(site.locator("#foreign")).toHaveText("Price $15");
  const fourth = await collect();
  expect(await translate(fourth.id, "Prix 15")).toEqual({ applied: 1 });
  await site.locator("#foreign").evaluate((element) => {
    element.hidden = true;
  });
  expect(await send({ type: "glimpselet:restore" })).toEqual({ restored: 1 });
  await site.locator("#foreign").evaluate((element) => {
    element.hidden = false;
  });
  await expect(site.locator("#foreign")).toHaveText("Price $15");
  const fifth = await collect();
  expect(await translate(fifth.id, "")).toEqual({ applied: 1 });
  expect(await send({ type: "glimpselet:restore" })).toEqual({ restored: 1 });
  await expect(site.locator("#foreign")).toHaveText("Price $15");
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

for (const backend of ["bridge", "api"] as const) {
  test(`large shared screen crop reaches the provider in ${backend} mode`, async () => {
    const receivedImages: string[] = [];
    if (backend === "api") {
      await context.route(
        "https://api.anthropic.com/v1/messages",
        async (route) => {
          const headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS",
          };
          if (route.request().method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          const request = route.request().postDataJSON();
          for (const message of request.messages) {
            for (const content of message.content) {
              if (content.type === "image")
                receivedImages.push(
                  `data:image/png;base64,${content.source.data}`,
                );
            }
          }
          await route.fulfill({
            contentType: "text/event-stream",
            headers,
            body: [
              {
                type: "content_block_delta",
                delta: {
                  type: "text_delta",
                  text: JSON.stringify({
                    questions: ["First?", "Second?", "Third?"],
                  }),
                },
              },
              { type: "message_stop" },
            ]
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
    }
    await expect(panel.locator(".suggestions button")).toHaveCount(3);
    await panel
      .locator(".composer textarea")
      .fill("Describe this large shared screen crop.");
    await panel.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4096;
        canvas.height = 2160;
        const drawing = canvas.getContext("2d")!;
        const pixels = drawing.createImageData(canvas.width, canvas.height);
        const words = new Uint32Array(pixels.data.buffer);
        let seed = 0x12345678;
        for (let index = 0; index < words.length; index++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          words[index] = (seed & 0xffffff) | 0xff000000;
        }
        drawing.putImageData(pixels, 0, 0);
        // Keep the real canvas and its real MediaStream alive throughout selection.
        document.body.append(canvas);
        canvas.style.display = "none";
        return canvas.captureStream(2);
      };
    });
    await panel.locator(".float-start button").click();
    await clickInBubble(en.share);
    await expect
      .poll(() =>
        panel.evaluate(
          () =>
            window.documentPictureInPicture.window!.document.querySelector(
              "video",
            )?.videoWidth,
        ),
      )
      .toBe(4096);
    await clickInBubble(en.region);
    const frozen = panel.locator("[data-glimpselet-frozen-crop]");
    await expect(frozen).toBeVisible();
    const nativeFrame = await frozen
      .locator("img")
      .evaluate((node: HTMLImageElement) => ({
        width: node.naturalWidth,
        height: node.naturalHeight,
        length: node.src.length,
      }));
    expect(nativeFrame).toMatchObject({ width: 4096, height: 2160 });
    expect(nativeFrame.length).toBeGreaterThan(5_000_000);
    const bounds = (await frozen.locator("img").boundingBox())!;
    await panel.mouse.move(
      bounds.x + bounds.width * 0.05,
      bounds.y + bounds.height * 0.05,
    );
    await panel.mouse.down();
    await panel.mouse.move(
      bounds.x + bounds.width * 0.95,
      bounds.y + bounds.height * 0.95,
    );
    await panel.mouse.up();
    await expect(frozen.locator("[data-handle]")).toHaveCount(8);
    const selectedBounds = (await frozen.locator(".selection").boundingBox())!;
    const nativeCrop = await frozen
      .locator("img")
      .evaluate((node: HTMLImageElement, bounds) => {
        const imageBounds = node.getBoundingClientRect();
        const scale = node.naturalWidth / imageBounds.width;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bounds.width * scale);
        canvas.height = Math.round(bounds.height * scale);
        canvas
          .getContext("2d")!
          .drawImage(
            node,
            (bounds.x - imageBounds.x) * scale,
            (bounds.y - imageBounds.y) * scale,
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        return {
          width: canvas.width,
          height: canvas.height,
          length: canvas.toDataURL("image/png").length,
        };
      }, selectedBounds);
    expect(nativeCrop.length).toBeGreaterThan(5_000_000);
    await panel.keyboard.press("Enter");
    await expect(frozen).toHaveCount(0);
    await panel.evaluate(() =>
      window.documentPictureInPicture
        .window!.document.querySelector<HTMLButtonElement>(".composer .send")!
        .click(),
    );
    await expect
      .poll(
        () =>
          backend === "api"
            ? receivedImages.length
            : providerRequests.filter(
                (request) =>
                  request.question ===
                  "Describe this large shared screen crop.",
              ).length,
        { timeout: 5000 },
      )
      .toBe(1);
    const image =
      backend === "api"
        ? receivedImages[0]
        : providerRequests
            .find(
              (request) =>
                request.question === "Describe this large shared screen crop.",
            )!
            .image!.toString("base64");
    const received =
      backend === "api" ? image : `data:image/png;base64,${image}`;
    const outgoing = await panel.evaluate(
      () =>
        window.documentPictureInPicture.window!.document.querySelector<HTMLImageElement>(
          ".capture-chip img",
        )!.src,
    );
    expect(outgoing.startsWith("data:image/png;base64,")).toBe(true);
    expect(outgoing.length).toBeLessThanOrEqual(5_000_000);
    if (backend === "api") expect(received).toBe(outgoing);
    const dimensions = await panel.evaluate(async (data) => {
      const decoded = await createImageBitmap(await (await fetch(data)).blob());
      const result = [decoded.width, decoded.height];
      decoded.close();
      return result;
    }, received);
    expect(dimensions[0]).toBeGreaterThan(500);
    expect(dimensions[0]).toBeLessThan(nativeCrop.width);
    expect(dimensions[0] / dimensions[1]).toBeCloseTo(4096 / 2160, 1);
  });
}

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

for (const backend of ["bridge", "api"] as const) {
  test(`dense PDF page thumbnails reach the provider in ${backend} mode`, async () => {
    const receivedImages: string[] = [];
    if (backend === "api") {
      await context.route(
        "https://api.anthropic.com/v1/messages",
        async (route) => {
          const headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS",
          };
          if (route.request().method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          const request = route.request().postDataJSON();
          for (const message of request.messages)
            for (const content of message.content) {
              if (content.type === "image")
                receivedImages.push(
                  `data:image/png;base64,${content.source.data}`,
                );
            }
          await route.fulfill({
            contentType: "text/event-stream",
            headers,
            body: [
              {
                type: "content_block_delta",
                delta: {
                  type: "text_delta",
                  text: JSON.stringify({
                    questions: ["First?", "Second?", "Third?"],
                  }),
                },
              },
              { type: "message_stop" },
            ]
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
    }
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extensionId}/reader.html`);
    await reader
      .locator("#file")
      .setInputFiles(resolve("public/assets/glimpselet-welcome-sample.pdf"));
    await expect(reader.locator(".pdf-page")).toBeVisible();
    const nativeLength = await reader
      .locator(".pdf-page canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        canvas.width = canvas.height = 1600;
        const drawing = canvas.getContext("2d")!;
        const pixels = drawing.createImageData(1600, 1600);
        const words = new Uint32Array(pixels.data.buffer);
        let seed = 0x12345678;
        for (let index = 0; index < words.length; index++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          words[index] = (seed & 0xffffff) | 0xff000000;
        }
        drawing.putImageData(pixels, 0, 0);
        drawing.fillStyle = "rgb(220,30,50)";
        drawing.fillRect(0, 0, 200, 200);
        drawing.fillStyle = "rgb(30,70,220)";
        drawing.fillRect(1400, 1400, 200, 200);
        return canvas.toDataURL("image/png").length;
      });
    expect(nativeLength).toBeGreaterThan(5_000_000);
    await reader.locator('[data-action="summary"]').click();
    await expect
      .poll(
        () =>
          backend === "api"
            ? receivedImages.length
            : providerRequests.filter((request) =>
                request.question.startsWith("Summarize this PDF page"),
              ).length,
        { timeout: 5000 },
      )
      .toBe(1);
    const image =
      backend === "api"
        ? receivedImages[0]
        : `data:image/png;base64,${providerRequests.find((request) => request.question.startsWith("Summarize this PDF page"))!.image!.toString("base64")}`;
    expect(image.length).toBeGreaterThan(1000);
    expect(image.length).toBeLessThanOrEqual(5_000_000);
    const decoded = await panel.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(data)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const drawing = canvas.getContext("2d")!;
      drawing.drawImage(bitmap, 0, 0);
      bitmap.close();
      const sample = (position: number) =>
        Array.from(
          drawing.getImageData(
            Math.floor(canvas.width * position),
            Math.floor(canvas.height * position),
            1,
            1,
          ).data,
        );
      return {
        width: canvas.width,
        height: canvas.height,
        first: sample(0.05),
        last: sample(0.95),
      };
    }, image);
    expect(decoded.width).toBeGreaterThanOrEqual(640);
    expect(decoded.width).toBeLessThan(1600);
    expect(decoded.height).toBe(decoded.width);
    expect(decoded.first).toEqual([220, 30, 50, 255]);
    expect(decoded.last).toEqual([30, 70, 220, 255]);
    await expect(reader.locator("#status")).toContainText("Summary");
    await expect(panel.locator(".status")).toHaveText(en.answerReady);
    await reader.close();
  });
}

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

for (const mode of ["suggestions", "passive"] as const) {
  test(`background PDF context never redirects ${mode} from the active web page`, async () => {
    if (mode === "passive")
      await panel
        .getByRole("button", { name: en.passive, exact: true })
        .click();
    const automatic = () =>
      providerRequests.filter((request) =>
        mode === "passive"
          ? request.question === en.passivePrompt
          : request.question.startsWith("Give 3 to 5"),
      );
    await expect.poll(() => automatic().length).toBeGreaterThan(0);
    await expect(
      panel.getByRole("button", { name: en.stop, exact: true }),
    ).toHaveCount(0);
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extensionId}/reader.html`);
    await site.bringToFront();
    await expect.poll(() => automatic().at(-1)?.page?.url).toBe(origin + "/");
    await site.waitForTimeout(1200);
    await expect(
      panel.getByRole("button", { name: en.stop, exact: true }),
    ).toHaveCount(0);
    const before = automatic().length;
    await reader.locator("#file").setInputFiles({
      name: "background-pages.pdf",
      mimeType: "application/pdf",
      buffer: twoPagePdf(),
    });
    await expect(reader.locator("#page-label")).toContainText("Page 1 of 2");
    await reader.waitForTimeout(1500);
    expect(automatic()).toHaveLength(before);
    expect(
      automatic().some((request) =>
        request.page?.text.includes("PDF_PAGE_ALPHA"),
      ),
    ).toBe(false);
    await panel
      .locator(".composer textarea")
      .fill("Check the current foreground source.");
    await panel.locator(".composer button.send").click();
    await expect
      .poll(() =>
        providerRequests.some(
          (request) =>
            request.question === "Check the current foreground source." &&
            request.page?.url === origin + "/",
        ),
      )
      .toBe(true);
    await expect(
      panel.getByRole("button", { name: en.stop, exact: true }),
    ).toHaveCount(0);
    await reader.bringToFront();
    await expect
      .poll(() =>
        automatic().some((request) =>
          request.page?.text.includes("PDF_PAGE_ALPHA"),
        ),
      )
      .toBe(true);
    await expect(
      panel.getByRole("button", { name: en.stop, exact: true }),
    ).toHaveCount(0);
    const readerCount = automatic().length;
    await reader.locator("#next").click();
    await expect(reader.locator("#page-label")).toContainText("Page 2 of 2");
    await expect
      .poll(() =>
        automatic().some((request) =>
          request.page?.text.includes("PDF_PAGE_BETA"),
        ),
      )
      .toBe(true);
    expect(automatic()).toHaveLength(readerCount + 1);
    await reader.close();
  });
}

for (const mode of ["suggestions", "passive"] as const) {
  test(`same-URL PDF page revisions refresh ${mode} context`, async () => {
    if (mode === "passive")
      await panel
        .getByRole("button", { name: en.passive, exact: true })
        .click();
    const automatic = () =>
      providerRequests.filter((request) =>
        mode === "passive"
          ? request.question === en.passivePrompt
          : request.question.startsWith("Give 3 to 5"),
      );
    const reader = await context.newPage();
    reader.setDefaultTimeout(15000);
    await reader.goto(`chrome-extension://${extensionId}/reader.html`);
    await reader.locator("#file").setInputFiles({
      name: "two-pages.pdf",
      mimeType: "application/pdf",
      buffer: twoPagePdf(),
    });
    await expect(reader.locator("#page-label")).toContainText("Page 1 of 2");
    await expect
      .poll(() =>
        automatic().some((request) =>
          request.page?.text.includes("PDF_PAGE_ALPHA"),
        ),
      )
      .toBe(true);
    const firstCount = automatic().length;
    await reader.locator("#next").click();
    await expect(reader.locator("#page-label")).toContainText("Page 2 of 2");
    await expect
      .poll(() =>
        automatic().some((request) =>
          request.page?.text.includes("PDF_PAGE_BETA"),
        ),
      )
      .toBe(true);
    expect(automatic()).toHaveLength(firstCount + 1);
    if (mode === "passive")
      await expect(panel.locator(".thread article")).toHaveCount(2);
    await reader.close();
  });
}

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
