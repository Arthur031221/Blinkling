import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { ExtensionBridge } from "../bridge/dist/extension-bridge.js";
import { ExtensionSessions } from "../bridge/dist/extension-sessions.js";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../bridge/dist/extension-install.js";
import en from "../extension/locales/en.json" with { type: "json" };

const here = resolve(".");
const publicMode = process.env.BLINKLING_RECORD_PUBLIC === "1";
const publicUrl = "https://github.com/microsoft/TypeScript";
const browserChannel = process.env.BLINKLING_RECORD_BROWSER || "chromium";
if (!process.env.BLINKLING_RECORD_IN_XVFB) {
  const childEnv = { ...process.env };
  delete childEnv.DISPLAY;
  delete childEnv.SSH_CONNECTION;
  childEnv.BLINKLING_RECORD_IN_XVFB = "1";
  const result = spawnSync(
    "xvfb-run",
    [
      "-a",
      "-s",
      "-screen 0 1280x800x24",
      process.execPath,
      resolve("scripts/record-demo.mjs"),
    ],
    { stdio: "inherit", env: childEnv },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const extension = resolve(
  process.env.BLINKLING_EXTENSION_DIR || "dist-extension",
);
const fixtureFile = resolve("e2e-extension/fixture.html");
const mockCli = resolve("e2e-extension/mock-claude.cjs");
const output = resolve("assets/demo.gif");
const shots = resolve("assets/screenshots");
const store = resolve("assets/store");
const temp = await mkdtemp(join(tmpdir(), "blinkling-record-"));
const videoFile = join(temp, "desktop.mp4");
const profile = join(temp, "profile");
const screen = process.env.DISPLAY;
let server;
let bridge;
let browserContext;
let ffmpeg;
let recordingStartedAt = 0;
const featureSegments = [];
let windowManager;
let appPage;
let sitePage;
let pipPage;
let port;

function mockCliProvider(request) {
  if (publicMode && request.question.includes('"questions"')) {
    const answer = JSON.stringify({
      questions: [
        "What does TypeScript add to JavaScript?",
        "How does the compiler check types?",
        "Where can I find the project documentation?",
      ],
    });
    return (async () => {
      for (let offset = 0; offset < answer.length; offset += 32) {
        if (request.signal.aborted)
          throw new Error("Mock suggestion request cancelled.");
        await new Promise((done) => setTimeout(done, 120));
        request.onText(answer.slice(offset, offset + 32));
      }
      return { answer };
    })();
  }
  return new Promise((resolve, reject) => {
    const fixtureEnv = { ...process.env };
    delete fixtureEnv.SSH_CONNECTION;
    const child = spawn(process.execPath, [mockCli, "-p", request.question], {
      cwd: here,
      stdio: ["ignore", "pipe", "ignore"],
      env: fixtureEnv,
    });
    let buffer = "";
    let answer = "";
    let result;
    let stream = Promise.resolve();
    const abort = () => child.kill("SIGTERM");
    request.signal.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        const delta =
          item.type === "stream_event" ? item.event?.delta : undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          stream = stream
            .then(() => new Promise((done) => setTimeout(done, 250)))
            .then(() => {
              if (request.signal.aborted) return;
              answer += delta.text;
              request.onText(delta.text);
            });
        }
        if (item.type === "result") result = item;
      }
    });
    child.once("error", reject);
    child.once("close", async (code) => {
      request.signal.removeEventListener("abort", abort);
      if (request.signal.aborted)
        return reject(new Error("Mock CLI request cancelled."));
      await stream;
      if (request.signal.aborted)
        return reject(new Error("Mock CLI request cancelled."));
      if (code !== 0 || !result || !answer.trim())
        return reject(new Error("Mock CLI did not return a complete answer."));
      resolve({
        answer,
        sessionId:
          typeof result.session_id === "string" ? result.session_id : undefined,
        usage: {
          inputTokens: result.usage?.input_tokens,
          outputTokens: result.usage?.output_tokens,
          costUsd: result.total_cost_usd,
        },
      });
    });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([
    done,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function startFfmpeg(args) {
  return new Promise((resolveStart, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.once("spawn", () => resolveStart(child));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== null && code !== 0)
        reject(new Error(`ffmpeg exited ${code}: ${errors}`));
    });
  });
}

async function desktopShot(path) {
  const child = spawn(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1280x800",
      "-i",
      `${screen}.0+0,0`,
      "-frames:v",
      "1",
      path,
    ],
    { stdio: "ignore" },
  );
  const [code] = await once(child, "exit");
  if (code !== 0)
    throw new Error(`Could not capture desktop screenshot ${path}`);
}

function sendBrowserShortcut() {
  const python = [
    "import ctypes, time",
    "x11 = ctypes.CDLL('libX11.so.6')",
    "xtst = ctypes.CDLL('libXtst.so.6')",
    "x11.XOpenDisplay.restype = ctypes.c_void_p",
    "x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]",
    "x11.XKeysymToKeycode.restype = ctypes.c_uint",
    "x11.XFlush.argtypes = [ctypes.c_void_p]",
    "xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]",
    "display = x11.XOpenDisplay(None)",
    "if not display: raise SystemExit('Could not open X11 display')",
    "codes = [x11.XKeysymToKeycode(display, key) for key in (0xffe9, 0xffe1, 0x67)]",
    "if not all(codes): raise SystemExit('Could not resolve Alt+Shift+G keycodes')",
    "for code in codes: xtst.XTestFakeKeyEvent(display, code, 1, 0); x11.XFlush(display); time.sleep(.09)",
    "for code in reversed(codes): xtst.XTestFakeKeyEvent(display, code, 0, 0); x11.XFlush(display); time.sleep(.05)",
  ].join("\n");
  const result = spawnSync("python3", ["-c", python], { stdio: "inherit" });
  if (result.status !== 0)
    throw new Error("Could not send the Alt+Shift+G browser shortcut");
}

async function keepScene(ms = 900) {
  await sitePage.waitForTimeout(ms);
}

async function askFromFloat(question) {
  const ui = pipPage || appPage;
  await ui.locator(".composer textarea").fill(question);
  await ui.locator(".composer button.send").click();
  await expect(ui.locator(".message .answer p").last()).not.toBeEmpty({
    timeout: 15000,
  });
}

async function restoreRecordedBubble() {
  await appPage.waitForFunction(() => {
    const view =
      window.documentPictureInPicture.window ||
      chrome.extension
        .getViews()
        .find((view) => view.location.search.includes("surfaceOnly=1"));
    return view?.document.querySelector(".composer textarea");
  });
  if (
    !(await appPage.evaluate(() => !!window.documentPictureInPicture.window))
  ) {
    const recovery = browserContext
      .pages()
      .find(
        (page) => new URL(page.url()).searchParams.get("surfaceOnly") === "1",
      );
    if (!recovery) throw new Error("Crop did not retain its recovery surface.");
    await recovery.getByRole("button", { name: en.float, exact: true }).click();
  }
  await appPage.waitForFunction(() => {
    const doc = window.documentPictureInPicture.window?.document;
    return (
      doc?.querySelector(".composer textarea") &&
      doc.body.dataset.bubbleState !== "crop"
    );
  });
  // Native clearance may replace PiP. Record the current target, retaining
  // the actual capture assertion rather than dereferencing its closed page.
  await expect
    .poll(async () => {
      for (const page of browserContext.pages()) {
        if (
          page.url() === "about:blank" &&
          (await page.locator(".composer textarea").count())
        ) {
          pipPage = page;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  pipPage.setDefaultTimeout(15000);
}

await mkdir(shots, { recursive: true });
await mkdir(store, { recursive: true });
if (!screen) throw new Error("A display is required. Run through xvfb-run.");
if (!process.env.DISPLAY) throw new Error("Xvfb did not provide DISPLAY.");
if (process.env.BLINKLING_RECORD_IN_XVFB) {
  windowManager = spawn("xfwm4", ["--sm-client-disable", "--compositor=off"], {
    stdio: "ignore",
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
}
if (
  !(await import("node:fs/promises").then(({ access }) =>
    access(join(extension, "manifest.json"))
      .then(() => true)
      .catch(() => false),
  ))
) {
  throw new Error(
    "dist-extension is missing. Build the extension before recording.",
  );
}

try {
  const fixture = await readFile(fixtureFile);
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/install/status") {
      const connected = bridge.installStatus(url.searchParams.get("code"));
      response.writeHead(connected === undefined ? 401 : 200, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ connected, mode: "direct" }));
      return;
    }
    if (url.pathname === "/install-guide.js") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(INSTALL_GUIDE_SCRIPT);
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      try {
        const asset = await readFile(resolve("bin/panel", `.${url.pathname}`));
        response.writeHead(200, {
          "content-type": url.pathname.endsWith(".svg")
            ? "image/svg+xml"
            : "image/png",
        });
        response.end(asset);
      } catch {
        response.writeHead(404);
        response.end();
      }
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      url.pathname === "/install" ? installGuide(extension) : fixture,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  bridge = new ExtensionBridge(server, () => origin, {
    provider: (request) => {
      // The checked-in CLI fixture emits the same streaming JSON protocol used by the provider.
      return mockCliProvider(request);
    },
    sessions: new ExtensionSessions(
      publicMode ? "TypeScript repository" : "Research notebook demo",
      async () => [],
    ),
  });

  browserContext = await chromium.launchPersistentContext(profile, {
    channel: browserChannel,
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: null,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-unsafe-extension-debugging",
      "--no-sandbox",
      "--enable-features=DocumentPictureInPictureAPI",
      "--window-size=1280,800",
      "--window-position=0,0",
      "--force-device-scale-factor=1",
    ],
  });
  let worker = browserContext.serviceWorkers()[0];
  if (!worker) {
    try {
      worker = await browserContext.waitForEvent("serviceworker", {
        timeout: 15000,
      });
    } catch (error) {
      await browserContext.close().catch(() => {});
      browserContext = undefined;
      await stop(windowManager);
      windowManager = undefined;
      await bridge?.close().catch(() => {});
      bridge = undefined;
      if (server?.listening)
        await new Promise((resolveClose) => server.close(() => resolveClose()));
      await rm(temp, { recursive: true, force: true });
      throw new Error(
        `The extension service worker did not start in Chromium: ${error.message}`,
      );
    }
  }
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() =>
    chrome.storage.local.set({
      consented: true,
      locale: "en",
      pipSize: { width: 390, height: 650 },
    }),
  );
  const welcome = await browserContext.newPage();
  await welcome.goto(`${origin}/install#code=${bridge.issueCode()}`);
  await expect(welcome.locator("#connection")).toContainText(
    /Connection set up|Connected to your Claude Code/,
  );
  await welcome.close();
  sitePage = await browserContext.newPage();
  await sitePage.goto(publicMode ? publicUrl : origin, {
    waitUntil: "domcontentloaded",
    timeout: publicMode ? 45000 : 30000,
  });
  if (publicMode) {
    await sitePage.locator("body").waitFor({ timeout: 20000 });
    await sitePage.waitForTimeout(1200);
  }
  await sitePage.bringToFront();

  const opened = browserContext.waitForEvent("page", { timeout: 8000 });
  sendBrowserShortcut();
  appPage = await opened;
  await appPage.waitForLoadState("domcontentloaded");
  appPage.setDefaultTimeout(12000);
  sitePage.setDefaultTimeout(12000);
  await appPage.locator(".app").waitFor();
  await expect(appPage.locator(".connection")).toHaveClass(/online/, {
    timeout: 15000,
  });
  await expect(appPage.locator(".suggestions button")).toHaveCount(3, {
    timeout: 15000,
  });
  await appPage.locator(".float-start button").waitFor();
  const sourceTabId = Number(
    new URL(appPage.url()).searchParams.get("sourceTab"),
  );

  if (!publicMode)
    ffmpeg = await startFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1280x800",
      "-framerate",
      "12",
      "-i",
      `${screen}.0+0,0`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      videoFile,
    ]);

  const guide = sitePage.locator("[data-blinkling-overlay] .guide");
  await appPage.locator(".composer button.send").waitFor();
  const pageContext = await worker.evaluate(
    (tabId) => chrome.tabs.sendMessage(tabId, { type: "blinkling:context" }),
    sourceTabId,
  );
  const exportTarget =
    pageContext.elements.find(
      (item) =>
        item.role === "button" &&
        item.text === (publicMode ? "Code" : "Export notebook"),
    ) ||
    (publicMode
      ? pageContext.elements.find(
          (item) => item.role === "button" && item.text?.trim(),
        )
      : undefined);
  if (!exportTarget)
    throw new Error(
      publicMode
        ? "The public GitHub page context did not include a guideable button."
        : "The real page context did not include the Export notebook button.",
    );
  await worker.evaluate(
    ({ tabId, target, publicMode }) =>
      chrome.tabs.sendMessage(tabId, {
        type: "blinkling:guide",
        steps: [
          {
            elementId: target.id,
            note: publicMode
              ? `Explore ${target.text} on this public repository.`
              : "Choose Export notebook to save this page.",
            action: publicMode ? "Open repository files" : "Click when ready",
          },
        ],
        labels: {
          next: "Next",
          back: "Back",
          close: "Close",
          title: "Page guide",
        },
      }),
    { tabId: sourceTabId, target: exportTarget, publicMode },
  );
  try {
    await expect(guide).toContainText(exportTarget.text, { timeout: 15000 });
  } catch {
    const status = await appPage
      .locator(".status")
      .innerText()
      .catch(() => "unavailable");
    const message = await appPage
      .locator(".message")
      .last()
      .innerText()
      .catch(() => "unavailable");
    throw new Error(
      `Guide overlay did not render. Status: ${status}. Latest message: ${message}`,
    );
  }
  await sitePage.bringToFront();
  await keepScene(2400);
  if (!publicMode) {
    await desktopShot(join(store, "guide.png"));
    await desktopShot(resolve("assets/screenshots/guide.png"));
  }
  await sitePage.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);

  if (!publicMode) {
    await appPage
      .getByRole("button", { name: en.moreTools, exact: true })
      .click();
    await appPage
      .getByRole("button", { name: en.translatePage, exact: true })
      .click();
    try {
      await expect(sitePage.locator("#foreign")).toContainText("Translated:", {
        timeout: 15000,
      });
    } catch {
      const status = await appPage
        .locator(".status")
        .innerText()
        .catch(() => "unavailable");
      const answer = await appPage
        .locator(".live-answer, .answer")
        .allInnerTexts()
        .catch(() => []);
      throw new Error(
        `Page translation did not apply. Status: ${status}. Chat: ${answer.join(" | ")}`,
      );
    }
    await sitePage.bringToFront();
    await keepScene(2200);
    await desktopShot(join(store, "translation.png"));
    await appPage
      .getByRole("button", { name: en.restore, exact: true })
      .click();
    await expect(sitePage.locator("#foreign")).toHaveText(
      "このページは研究ノートの使い方を説明します。",
    );
  }

  const pipOpened = browserContext
    .waitForEvent("page", { timeout: 5000 })
    .catch(() => null);
  await appPage
    .getByRole("button", { name: en.float, exact: true })
    .last()
    .click();
  await expect
    .poll(() =>
      appPage.evaluate(() => Boolean(window.documentPictureInPicture?.window)),
    )
    .toBe(true);
  const candidate = await pipOpened;
  pipPage =
    candidate ||
    browserContext
      .pages()
      .find(
        (page) =>
          page !== appPage &&
          page !== sitePage &&
          page.url().startsWith(`chrome-extension://${extensionId}/`),
      );
  if (!pipPage)
    throw new Error(
      "Document PiP opened without an accessible Playwright page target.",
    );
  pipPage.setDefaultTimeout(15000);
  await pipPage.locator(".app").waitFor();
  await pipPage.evaluate(() => window.resizeTo(410, 640));
  await expect
    .poll(() => pipPage.evaluate(() => window.innerWidth), { timeout: 3000 })
    .toBeLessThanOrEqual(520);
  const pipWidth = await pipPage.evaluate(() => window.innerWidth);
  if (pipWidth > 520 || pipWidth < 320) {
    const targets = await browserContext
      .browser()
      .newBrowserCDPSession()
      .then(async (cdp) => {
        const result = await cdp.send("Target.getTargets");
        await cdp.detach();
        return result.targetInfos.map(({ type, url, targetId }) => ({
          type,
          url,
          targetId,
        }));
      });
    throw new Error(
      `Document PiP target width must be 320–520 px; got ${pipWidth}px at ${pipPage.url()}. Targets: ${JSON.stringify(targets)}`,
    );
  }
  const realPip = await appPage.evaluate(() => {
    const pip = window.documentPictureInPicture?.window;
    return Boolean(pip && !pip.closed && pip.document.querySelector(".app"));
  });
  if (!realPip)
    throw new Error(
      "The floating surface is not the real Document PiP app DOM.",
    );
  await sitePage.bringToFront();
  await expect
    .poll(() => sitePage.evaluate(() => document.hasFocus()))
    .toBe(true);
  await keepScene(800);
  await desktopShot(join(store, "floating.png"));
  await desktopShot(resolve("assets/screenshots/floating.png"));
  if (publicMode) {
    // Keep the public recording short: real floating PiP first, then its page guide.
    ffmpeg = await startFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1280x800",
      "-framerate",
      "12",
      "-i",
      `${screen}.0+0,0`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      videoFile,
    ]);
    recordingStartedAt = performance.now();
    await keepScene(1400);
    const guideStart = (performance.now() - recordingStartedAt) / 1000;
    await worker.evaluate(
      ({ tabId, target }) =>
        chrome.tabs.sendMessage(tabId, {
          type: "blinkling:guide",
          steps: [
            {
              elementId: target.id,
              note: `Explore ${target.text} on this public repository.`,
              action: "Open repository files",
            },
          ],
          labels: {
            next: "Next",
            back: "Back",
            close: "Close",
            title: "Page guide",
          },
        }),
      { tabId: sourceTabId, target: exportTarget },
    );
    await expect(guide).toContainText(exportTarget.text, { timeout: 15000 });
    await sitePage.bringToFront();
    await keepScene(1600);
    featureSegments.push({
      name: "guide",
      start: guideStart,
      duration: (performance.now() - recordingStartedAt) / 1000 - guideStart,
    });
    await desktopShot(join(store, "guide.png"));
    await desktopShot(resolve("assets/screenshots/guide.png"));
    await sitePage.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
  }
  console.log(
    `Opened extension ${extensionId}; Document PiP page: ${Boolean(pipPage)}.`,
  );

  if (!publicMode) {
    await askFromFloat("What is this notebook for?");
    await keepScene(1200);
  }
  await sitePage.bringToFront();
  await keepScene(1800);
  await desktopShot(join(store, "floating.png"));
  await desktopShot(resolve("assets/screenshots/floating.png"));

  // Use the supported page Shift gesture, actual crop surface and handles, then confirm with Enter.
  {
    const cropStart = (performance.now() - recordingStartedAt) / 1000;
    await sitePage.bringToFront();
    await sitePage.keyboard.down("Shift");
    await sitePage.waitForTimeout(230);
    await sitePage.keyboard.up("Shift");
    const cropSurface = sitePage.locator("[data-blinkling-crop] .surface");
    await expect(cropSurface).toBeVisible({ timeout: 8000 });
    const cropBox = await cropSurface.boundingBox();
    if (!cropBox) throw new Error("Page crop surface has no visible geometry.");
    await sitePage.mouse.move(cropBox.x + 60, cropBox.y + 80);
    await sitePage.mouse.down();
    await sitePage.mouse.move(cropBox.x + 340, cropBox.y + 260, { steps: 8 });
    await sitePage.mouse.up();
    await expect(
      sitePage.locator("[data-blinkling-crop] [data-handle]"),
    ).toHaveCount(8);
    await keepScene(700);
    await sitePage.keyboard.press("Enter");
    await expect(cropSurface).toHaveCount(0);
    await restoreRecordedBubble();
    await expect(pipPage.locator(".capture-chip img")).toBeVisible({
      timeout: 8000,
    });
    await sitePage.bringToFront();
    await keepScene(900);
    if (publicMode)
      featureSegments.push({
        name: "crop",
        start: cropStart,
        duration: (performance.now() - recordingStartedAt) / 1000 - cropStart,
      });
    await desktopShot(join(store, "crop.png"));
  }

  await sitePage.bringToFront();
  await keepScene(900);
  await stop(ffmpeg);
  ffmpeg = null;
  const gif = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoFile,
      "-vf",
      "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      "-loop",
      "0",
      output,
    ],
    { stdio: "inherit" },
  );
  if (gif.status !== 0) throw new Error(`GIF encoding exited ${gif.status}`);
  for (const segment of featureSegments) {
    const encoded = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(segment.start),
        "-t",
        String(segment.duration),
        "-i",
        videoFile,
        "-vf",
        "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
        "-loop",
        "0",
        resolve(`assets/${segment.name}.gif`),
      ],
      { stdio: "inherit" },
    );
    if (encoded.status !== 0)
      throw new Error(`${segment.name} GIF encoding failed`);
  }

  await browserContext.newPage().then(async (page) => {
    await page.setViewportSize({ width: 1200, height: 675 });
    const image = `data:image/png;base64,${(await readFile(join(store, "floating.png"))).toString("base64")}`;
    await page.setContent(
      `<html><head><style>*{box-sizing:border-box}body{margin:0;width:1200px;height:675px;background:#f4f0e8;color:#292720;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;gap:45px;padding:58px 68px}.copy{width:590px}.eyebrow{color:#805c48;text-transform:uppercase;letter-spacing:.12em;font-size:14px}h1{font:500 76px Georgia,serif;letter-spacing:-3px;margin:25px 0 14px}.tag{font-size:28px;line-height:1.35;color:#565047}.steps{display:flex;gap:10px;margin-top:30px}.steps span{border:1px solid #d8cebf;border-radius:18px;padding:9px 14px;font-size:14px}.privacy{margin-top:40px;color:#766b5e;font-size:14px}.shot{width:420px;height:525px;object-fit:cover;object-position:left top;border:1px solid #d4cab9;border-radius:18px;box-shadow:0 24px 55px #37291f2a}</style></head><body><section class="copy"><div class="eyebrow">A page and a small question</div><h1>Blinkling</h1><div class="tag">Ask about what you see.<br>Keep the answer beside it.</div><div class="steps"><span>Share</span><span>Ask</span><span>Keep close</span></div><p class="privacy">Local bridge connection · no telemetry</p></section><img class="shot" src="${image}" alt="Captured Blinkling extension window"></body></html>`,
    );
    await page.screenshot({ path: resolve("assets/social-card.png") });
    await page.close();
  });

  // A 440 by 280 store tile uses the recorded browser still as its only interface image.
  await browserContext.newPage().then(async (page) => {
    await page.setViewportSize({ width: 440, height: 280 });
    const image = `data:image/png;base64,${(await readFile(join(store, "floating.png"))).toString("base64")}`;
    await page.setContent(
      `<html><head><style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;background:#f4f0e8;color:#292720;font-family:Arial,sans-serif;padding:25px 24px;position:relative}.eyebrow{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#805c48}h1{font:500 36px Georgia,serif;margin:14px 0 8px}.tag{font-size:14px;line-height:1.38;color:#565047;width:200px}.shot{position:absolute;right:18px;top:26px;width:178px;height:222px;object-fit:cover;object-position:left top;border:1px solid #d4cab9;border-radius:11px;box-shadow:0 12px 24px #37291f26}.line{position:absolute;left:24px;bottom:28px;font-size:9px;color:#766b5e;letter-spacing:.04em}</style></head><body><div class="eyebrow">A browser companion</div><h1>Blinkling</h1><div class="tag">Ask about a page.<br>Keep the answer beside it.</div><img class="shot" src="${image}" alt="Blinkling browser screenshot"><div class="line">Your page stays in view.</div></body></html>`,
    );
    await page.screenshot({ path: join(store, "promo.png") });
    await page.close();
  });

  console.log(
    publicMode
      ? `Recorded a public-site demo with ${pipWidth}px Document PiP and a page guide.`
      : `Recorded real extension desktop demo with ${pipWidth}px Document PiP and successful Shift crop.`,
  );
} finally {
  await stop(ffmpeg);
  await browserContext?.close().catch(() => {});
  await stop(windowManager);
  await bridge?.close().catch(() => {});
  if (server?.listening)
    await new Promise((resolveClose) => server.close(() => resolveClose()));
  await rm(temp, { recursive: true, force: true });
}
