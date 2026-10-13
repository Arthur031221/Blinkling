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
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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

function chatRequests() {
  // The bridge uses kind="ask" for background suggestions too. Only chat
  // actions carry a conversation session; count them separately.
  return requests.filter((request) => request.cliSession !== undefined);
}

function sectionPdf(selectable = true): Buffer {
  const streams = selectable
    ? [
        "BT /F1 18 Tf 54 720 Td (First page) Tj ET",
        "BT /F1 18 Tf 54 720 Td (Introduction) Tj 0 -32 Td (In this work we propose the Transformer.) Tj 0 -32 Td (Training takes twelve hours on eight P100 GPUs.) Tj 0 -64 Td (Background) Tj 0 -32 Td (UNRELATED_SECTION discusses recurrent networks.) Tj ET",
      ]
    : [
        "q 0.8 0.8 0.8 rg 54 620 480 100 re f Q",
        "q 0.4 0.4 0.4 rg 54 620 480 100 re f Q",
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

async function openReader(selectable = true) {
  const reader = await context.newPage();
  await reader.goto(`chrome-extension://${extensionId}/reader.html`);
  await reader.locator("#file").setInputFiles({
    name: "sections.pdf",
    mimeType: "application/pdf",
    buffer: sectionPdf(selectable),
  });
  if (!selectable) {
    await expect(reader.locator(".pdf-page canvas")).toBeVisible();
    await expect(reader.locator("#page-label")).toHaveText("Page 1 of 2");
    return reader;
  }
  await expect(reader.locator(".pdf-text-layer")).toContainText("First page");
  await reader.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(reader.locator(".pdf-text-layer")).toContainText("In this work");
  return reader;
}
async function selectIntroductionWithMouse(reader: Page): Promise<string> {
  const first = reader
    .locator(".pdf-text-layer span")
    .filter({ hasText: /^In this work/ })
    .first();
  const last = reader
    .locator(".pdf-text-layer span")
    .filter({ hasText: /^Training takes/ })
    .first();
  await reader.bringToFront();
  await first.scrollIntoViewIfNeeded();
  await last.scrollIntoViewIfNeeded();
  const start = (await first.boundingBox())!;
  const end = (await last.boundingBox())!;
  await reader.mouse.move(start.x + 1, start.y + start.height / 2);
  await reader.mouse.down();
  await reader.mouse.move(end.x + end.width - 1, end.y + end.height / 2, {
    steps: 12,
  });
  await reader.mouse.up();
  const selected = await reader.evaluate(() =>
    getSelection()!.toString().trim(),
  );
  expect(selected).toContain("In this work we propose the Transformer.");
  expect(selected).toContain("Training takes twelve hours on eight P100 GPUs.");
  expect(selected).not.toContain("UNRELATED_SECTION");
  return selected;
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

type NativeControl = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
};

// Chrome's browser-owned dialog is outside the page tree. Identify the native
// light-theme Allow and focused Deny controls in an actual desktop capture.
// Connected components avoid assuming a dialog location or screen dimensions.
const nativeControlsScript = `import json,sys,subprocess
ppm=subprocess.check_output(['ffmpeg','-loglevel','error','-i',sys.argv[1],'-frames:v','1','-f','image2pipe','-vcodec','ppm','-'])
magic,size,maximum,data=ppm.split(b'\\n',3)
width,height=map(int,size.split())
assert magic==b'P6' and maximum==b'255' and len(data)==width*height*3
rows=[]
for name,colors in [('Allow',[bytes([211,227,253]),bytes([200,215,240])]),('Deny',[bytes([13,80,187]),bytes([11,87,208])])]:
 points={(i%width,i//width) for i in range(width*height) if data[3*i:3*i+3] in colors}
 largest=[]
 while points:
  seed=points.pop();queue=[seed];component=[seed]
  while queue:
   x,y=queue.pop()
   for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
    if p in points: points.remove(p);queue.append(p);component.append(p)
  if len(component)>500:
   xs,ys=zip(*component);w=max(xs)-min(xs)+1;h=max(ys)-min(ys)+1
   if 40<=w<=150 and 20<=h<=80 and len(component)>len(largest): largest=component
 if len(largest)>500:
  xs,ys=zip(*largest);x=min(xs);y=min(ys);w=max(xs)-x+1;h=max(ys)-y+1
  if 40<=w<=150 and 20<=h<=80:
   rows.append(dict(name=name,x=x,y=y,width=w,height=h,pixels=len(largest)))
print(json.dumps(rows))`;

function nativeControls(path: string): NativeControl[] {
  return JSON.parse(
    execFileSync("python3", ["-c", nativeControlsScript, path], {
      timeout: 15_000,
    }).toString(),
  );
}

const nativeInputScript = `import ctypes,sys
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p
p=x.XOpenDisplay(None)
if not p: raise RuntimeError('No X11 display')
x.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int]
x.XCloseDisplay.argtypes=[ctypes.c_void_p]
x.XStringToKeysym.argtypes=[ctypes.c_char_p];x.XStringToKeysym.restype=ctypes.c_ulong
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XKeysymToKeycode.restype=ctypes.c_uint
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
if sys.argv[1] in ['click','move']:
 t.XTestFakeMotionEvent(p,-1,int(sys.argv[2]),int(sys.argv[3]),0)
 if sys.argv[1]=='click':
  t.XTestFakeButtonEvent(p,1,1,0);t.XTestFakeButtonEvent(p,1,0,0)
else:
 k=x.XKeysymToKeycode(p,x.XStringToKeysym(sys.argv[2].encode()))
 t.XTestFakeKeyEvent(p,k,1,0);t.XTestFakeKeyEvent(p,k,0,0)
x.XSync(p,0);x.XCloseDisplay(p)`;

function nativeInput(...args: string[]) {
  execFileSync("python3", ["-c", nativeInputScript, ...args]);
}

function captureDesktop(path: string) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-i",
      process.env.DISPLAY!,
      "-frames:v",
      "1",
      path,
    ],
    { timeout: 15_000 },
  );
}

async function attachDesktop(name: string) {
  const path = test.info().outputPath(`${name}.png`);
  captureDesktop(path);
  await test.info().attach(name, { path, contentType: "image/png" });
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
  const selected = chatRequests().at(-1)!;
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
  const wholePage = chatRequests().at(-1)!;
  expect(wholePage.page?.text).toContain("UNRELATED_SECTION");
  expect(wholePage.image).toBeInstanceOf(Buffer);
});

test("PDF translation stays disabled until text is selected and clears on a page click", async () => {
  const reader = await openReader();
  const translate = reader.getByRole("button", {
    name: "Translate selection",
    exact: true,
  });
  await expect(translate).toBeDisabled();
  await selectIntroductionWithMouse(reader);
  await expect(translate).toBeEnabled();
  await reader.locator(".pdf-text-layer").click({ position: { x: 20, y: 20 } });
  await expect
    .poll(() => reader.evaluate(() => getSelection()!.toString()))
    .toBe("");
  await expect(translate).toBeDisabled();
  await expect(
    reader.getByRole("button", { name: "Summarize selection", exact: true }),
  ).toBeDisabled();
  expect(chatRequests()).toHaveLength(0);
});

test("a forced empty PDF translation rejects the action before sending any answer request", async () => {
  const reader = await openReader();
  await reader.locator('[data-action="translate"]').dispatchEvent("click");
  await expect(reader.locator("#status")).toHaveText("Select a passage first.");
  expect(chatRequests()).toHaveLength(0);
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    "",
  );
});

test("a PDF without selectable text explains why translation is unavailable and never sends an empty passage", async () => {
  const reader = await openReader(false);
  await expect(reader.locator(".pdf-text-layer span")).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: "Translate selection", exact: true }),
  ).toBeDisabled();
  await expect(reader.locator("#selection-help")).toContainText(
    /no selectable text|selection is unavailable/i,
  );
  await reader.locator('[data-action="translate"]').dispatchEvent("click");
  await expect(reader.locator("#status")).toContainText(
    /no selectable text|selection is unavailable/i,
  );
  expect(chatRequests()).toHaveLength(0);
  await expect(
    reader.getByRole("button", { name: "Summarize page", exact: true }),
  ).toBeEnabled();
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
  const passage = await selectIntroductionWithMouse(reader);
  await expect(
    reader.getByRole("button", { name: "Translate selection", exact: true }),
  ).toBeEnabled();
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
  expect(translations[0].question).toContain(passage);
  expect(translations[0].page?.text).toBe(passage);
  expect(translations[0].question).not.toContain("UNRELATED_SECTION");
  expect(translations[0].image).toBeUndefined();
  expect(chatRequests()).toHaveLength(1);
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
  expect(chatRequests().at(-1)?.image).toBeUndefined();
});

async function prepareFloatingReaderPermission() {
  await panel
    .getByRole("textbox", { name: en.question })
    .fill("Keep this PDF conversation");
  await panel.locator(".send").click();
  await expect(panel.locator(".toolbar .status")).toHaveText("Answer ready.");
  const session = chatRequests().at(-1)!.cliSession!.id;
  const attachment = await site.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await panel.locator('input[type="file"]').setInputFiles({
    name: "kept.png",
    mimeType: "image/png",
    buffer: Buffer.from(attachment, "base64"),
  });
  await expect(panel.locator(".capture-chip img")).toBeVisible();
  const attachmentSource = await panel
    .locator(".capture-chip img")
    .getAttribute("src");
  await panel
    .getByRole("textbox", { name: en.question })
    .fill("My unfinished PDF question");
  await panel
    .locator(".top-actions")
    .getByRole("button", { name: en.float, exact: true })
    .click();
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(true);
  const reader = await context.newPage();
  const freshUrl = `${origin.replace("127.0.0.1", "127.0.0.2")}/paper.pdf`;
  const permissionOrigin = `${new URL(freshUrl).origin}/*`;
  await reader.route(freshUrl, (route) =>
    route.fulfill({ contentType: "application/pdf", body: sectionPdf() }),
  );
  expect(
    await worker.evaluate(
      (origins) => chrome.permissions.contains({ origins }),
      [permissionOrigin],
    ),
  ).toBe(false);
  await reader.goto(
    `chrome-extension://${extensionId}/reader.html?url=${encodeURIComponent(freshUrl)}`,
  );
  await expect
    .poll(() =>
      panel.evaluate(() => Boolean(window.documentPictureInPicture.window)),
    )
    .toBe(false);
  await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
    "My unfinished PDF question",
  );
  await expect(panel.locator(".capture-chip img")).toHaveAttribute(
    "src",
    attachmentSource!,
  );
  await expect(panel.locator(".connection")).toHaveClass(/online/);
  return { reader, session, attachmentSource, permissionOrigin };
}

test("reader explains a floating chat interruption before requesting new PDF site access", async () => {
  const { reader } = await prepareFloatingReaderPermission();
  await expect(reader.locator("#permission-note")).toContainText(
    /briefly close floating chat|floating chat.*temporar|temporar.*floating chat/i,
  );
  await expect(reader.locator("#permission-note")).toContainText(/permission/i);
  await expect(
    reader.getByRole("button", { name: "Resume floating chat", exact: true }),
  ).toBeEnabled();
  await expect(reader.locator(".pdf-page")).toHaveCount(0);
});

test("reader permission recovery stays visible after scrolling a loaded paper", async () => {
  const reader = await openReader();
  await reader.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await reader.evaluate(() => scrollY)).toBeGreaterThan(100);
  await reader
    .locator("#pdf-url")
    .fill(`${origin.replace("127.0.0.1", "127.0.0.2")}/paper.pdf`);
  await expect(reader.locator("#permission-recovery")).toBeVisible();
  await expect(reader.locator("#permission-note")).toBeInViewport();
  await expect(reader.locator("#resume-panel")).toBeInViewport();
});

for (const outcome of ["grant", "deny", "cancel"] as const) {
  test(`native PDF site permission ${outcome} preserves the paired chat and resumes it in one click`, async () => {
    const { reader, session, attachmentSource, permissionOrigin } =
      await prepareFloatingReaderPermission();
    await expect(reader.locator("#permission-note")).toContainText(
      /briefly close floating chat|floating chat.*temporar|temporar.*floating chat/i,
    );
    await reader.getByRole("button", { name: "Open URL", exact: true }).click();
    nativeInput("move", "0", "0");
    await expect(reader.locator("#resume-panel")).toBeHidden();
    await expect(reader.locator(".pdf-page")).toHaveCount(0);
    expect(
      await worker.evaluate(
        (origins) => chrome.permissions.contains({ origins }),
        [permissionOrigin],
      ),
    ).toBe(false);
    let controls: NativeControl[] = [];
    const promptPath = test
      .info()
      .outputPath(`native-permission-${outcome}.png`);
    try {
      await expect
        .poll(
          () => {
            captureDesktop(promptPath);
            controls = nativeControls(promptPath);
            return controls.length === 2;
          },
          {
            message:
              "Chrome must display its real optional site permission prompt",
            timeout: 15_000,
          },
        )
        .toBe(true);
    } finally {
      const treePath = test
        .info()
        .outputPath("native-permission-controls.json");
      await writeFile(treePath, JSON.stringify(controls, null, 2));
      await test.info().attach("native-permission-controls", {
        path: treePath,
        contentType: "application/json",
      });
      await test.info().attach(`native-permission-${outcome}`, {
        path: promptPath,
        contentType: "image/png",
      });
    }
    if (outcome === "cancel") nativeInput("key", "Escape");
    else {
      const label = outcome === "grant" ? "Allow" : "Deny";
      const button = controls.find((control) => control.name === label)!;
      expect(button).toBeDefined();
      expect(button.width).toBeGreaterThan(0);
      nativeInput(
        "click",
        String(Math.round(button.x + button.width / 2)),
        String(Math.round(button.y + button.height / 2)),
      );
    }
    if (outcome === "grant") {
      await expect(reader.locator(".pdf-text-layer")).toContainText(
        "First page",
      );
      expect(
        await worker.evaluate(
          (origins) => chrome.permissions.contains({ origins }),
          [permissionOrigin],
        ),
      ).toBe(true);
    } else {
      await expect(reader.locator("#status")).toContainText(
        /Permission was not granted/,
      );
      await expect(reader.locator(".pdf-page")).toHaveCount(0);
      expect(
        await worker.evaluate(
          (origins) => chrome.permissions.contains({ origins }),
          [permissionOrigin],
        ),
      ).toBe(false);
    }
    const resume = reader.getByRole("button", {
      name: "Resume floating chat",
      exact: true,
    });
    await expect(resume).toBeEnabled();
    await expect(reader.locator("#permission-recovery")).toContainText(
      /Resume floating chat/,
    );
    await resume.click();
    await expect
      .poll(() =>
        reader.evaluate(() => {
          const doc = window.documentPictureInPicture.window?.document;
          return doc
            ? {
                online: Boolean(doc.querySelector(".connection.online")),
                draft:
                  doc.querySelector<HTMLTextAreaElement>("textarea")?.value,
                attachment: doc
                  .querySelector<HTMLImageElement>(".capture-chip img")
                  ?.getAttribute("src"),
                messages: doc.querySelectorAll(".message").length,
              }
            : null;
        }),
      )
      .toEqual({
        online: true,
        draft: "My unfinished PDF question",
        attachment: attachmentSource,
        messages: 1,
      });
    await expect(reader.locator("#resume-panel")).toBeHidden();
    await attachDesktop(`floating-chat-resumed-${outcome}`);
    // Sending the retained draft proves the same conversation and attachment
    // survive the native prompt, including after denied or dismissed requests.
    await reader.evaluate(() =>
      window.documentPictureInPicture
        .window!.document.querySelector<HTMLButtonElement>(".send")!
        .click(),
    );
    await expect
      .poll(
        () =>
          requests.filter(
            (request) => request.question === "My unfinished PDF question",
          ).length,
      )
      .toBe(1);
    await test.info().attach("provider-requests", {
      body: JSON.stringify(
        requests.map(({ kind, question, cliSession, image }) => ({
          kind,
          question,
          cliSession,
          image: Boolean(image),
        })),
        null,
        2,
      ),
      contentType: "application/json",
    });
    await expect.poll(() => chatRequests().length).toBe(2);
    const resumed = chatRequests().at(-1)!;
    expect(resumed.question).toBe("My unfinished PDF question");
    expect(resumed.cliSession?.id).toBe(session);
    expect(resumed.cliSession?.resume).toBe(true);
    expect(resumed.image).toBeInstanceOf(Buffer);
  });
}

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
    const spans = await reader
      .locator(".pdf-text-layer span")
      .allTextContents();
    const firstLine = spans.findIndex((text) =>
      text.startsWith("In this work we propose"),
    );
    const lastLine = spans.findIndex((text) => /P100 GPUs\./.test(text));
    expect(firstLine).toBeGreaterThanOrEqual(0);
    expect(lastLine).toBeGreaterThan(firstLine);
    const expectedPassage = spans.slice(firstLine, lastLine + 1).join("\n");
    const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
    const last = reader
      .locator(".pdf-text-layer span")
      .filter({ hasText: /P100 GPUs\./ })
      .last();
    await reader.bringToFront();
    await first.scrollIntoViewIfNeeded();
    await last.scrollIntoViewIfNeeded();
    const start = (await first.boundingBox())!;
    const end = (await last.boundingBox())!;
    // Use the browser's native drag selection; Shift starts the crop action.
    await reader.mouse.move(start.x + 0.1, start.y + start.height / 2);
    await reader.mouse.down();
    await reader.mouse.move(end.x + end.width - 1, end.y + end.height / 2, {
      steps: 24,
    });
    await reader.mouse.up();
    const selection = await reader.evaluate(() => getSelection()!.toString());
    await reader.screenshot({
      path: test.info().outputPath("arxiv-selected-introduction.png"),
    });
    await writeFile(
      test.info().outputPath("arxiv-selected-introduction.txt"),
      selection,
    );
    expect(normalize(selection)).toBe(normalize(expectedPassage));
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
    const selected = chatRequests().at(-1)!;
    expect(selected.page?.text).toBe(selection.trim());
    expect(selected.question).toContain(selection.trim());
    expect(selected.question).not.toContain("Background");
    expect(selected.image).toBeUndefined();
    await expect(panel.getByRole("textbox", { name: en.question })).toHaveValue(
      "",
    );
  });
}
