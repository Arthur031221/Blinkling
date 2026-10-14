import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PNG } from "pngjs";
import en from "../extension/locales/en.json" with { type: "json" };

const fixture = createServer((_, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><title>Blinkling Screen Fixture</title>
    <style>body{margin:0;background:#faecd6;color:#241f1a;font:24px system-ui;padding:48px}h1{font-size:32px}code{display:block;padding:24px;background:#203d54;color:white}p{margin-top:32px}</style>
    <h1>Blinkling capture test</h1><code>GL472: 設定を保存できませんでした</code>
    <p>The Japanese message says the settings could not be saved.</p>`);
});
await new Promise((resolveListen) =>
  fixture.listen(0, "127.0.0.1", resolveListen),
);
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
const client = new Client({ name: "blinkling-screen-test", version: "2.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/blinkling.cjs"],
  stderr: "pipe",
  env: { ...process.env, BLINKLING_DISABLE_BROWSER_OPEN: "1" },
});
let browser, context, profile;
async function floatingCommand(targetId, method, params) {
  const cdp = await browser.newBrowserCDPSession();
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: false,
  });
  try {
    const response = new Promise((resolveResponse, reject) => {
      const timer = setTimeout(
        () => reject(new Error("PiP share activation timed out")),
        10_000,
      );
      cdp.on("Target.receivedMessageFromTarget", (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.error || message.result?.exceptionDetails)
          reject(
            new Error(
              JSON.stringify(message.error || message.result.exceptionDetails),
            ),
          );
        else resolveResponse();
      });
    });
    await cdp.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method,
        params,
      }),
    });
    await response;
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId });
    await cdp.detach();
  }
}
async function restoreBubble(panel) {
  await panel.waitForFunction(() => {
    const view =
      window.documentPictureInPicture.window ||
      chrome.extension
        .getViews()
        .find((view) => view.location.search.includes("surfaceOnly=1"));
    return view?.document.querySelector(".composer textarea");
  });
  if (!(await panel.evaluate(() => !!window.documentPictureInPicture.window))) {
    const recovery = context
      .pages()
      .find(
        (page) => new URL(page.url()).searchParams.get("surfaceOnly") === "1",
      );
    assert.ok(recovery, "expired activation must retain a recovery surface");
    await recovery.getByRole("button", { name: en.float, exact: true }).click();
  }
  await panel.waitForFunction(() => {
    const doc = window.documentPictureInPicture.window?.document;
    return (
      doc?.querySelector(".composer textarea") &&
      doc.body.dataset.bubbleState !== "crop" &&
      !doc.querySelector(".capture-buttons button").disabled
    );
  });
}
try {
  await client.connect(transport);
  const opened = await client.callTool({ name: "panel_open", arguments: {} });
  const guideUrl = opened.content
    .find((item) => item.type === "text")
    ?.text.match(/http:\/\/\S+/)?.[0];
  assert.ok(guideUrl, "panel_open must return the v2 /install guide URL");
  const pairingCode = new URL(guideUrl).hash.match(/code=([A-F0-9]{16})/)?.[1];
  assert.ok(pairingCode, "the /install guide URL must carry its pairing code");

  profile = await mkdtemp(join(tmpdir(), "blinkling-screen-e2e-"));
  const extension = resolve("dist-extension");
  context = await chromium.launchPersistentContext(join(profile, "profile"), {
    channel: "chromium",
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--auto-select-tab-capture-source-by-title=Blinkling Screen Fixture",
      "--enable-usermedia-screen-capturing",
      "--allow-http-screen-capture",
      "--enable-unsafe-extension-debugging",
      "--enable-features=DocumentPictureInPictureAPI",
      "--window-size=1100,780",
    ],
  });
  browser = context.browser();
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() =>
    chrome.storage.local.set({ consented: true, locale: "en" }),
  );
  const source = await context.newPage();
  await source.goto(fixtureUrl);
  const install = await context.newPage();
  await install.goto(guideUrl);
  const panelOpened = context.waitForEvent("page", { timeout: 15000 });
  await install
    .getByRole("button", { name: "Open the bubble", exact: true })
    .click();
  const panel = await panelOpened;
  await panel.waitForURL((url) =>
    url.href.startsWith(`chrome-extension://${extensionId}/panel.html`),
  );
  await panel.waitForLoadState("domcontentloaded");
  assert.ok(
    panel.url().startsWith(`chrome-extension://${extensionId}/panel.html`),
    "the local /install route must pair and open the actual unpacked extension",
  );
  panel.setDefaultTimeout(15000);
  await install.waitForFunction(
    async (code) => {
      const response = await fetch(`/install/status?code=${code}`, {
        cache: "no-store",
      });
      return response.ok && (await response.json()).connected === true;
    },
    pairingCode,
    { timeout: 15000 },
  );
  await panel.locator(".connection.online").waitFor();

  await panel.locator(".float-start button").click();
  await panel.waitForFunction(() =>
    window.documentPictureInPicture?.window?.document.querySelector(".app"),
  );
  await panel.evaluate(() => {
    const media = navigator.mediaDevices;
    const original = media.getDisplayMedia.bind(media);
    window.__testCaptureTracks = [];
    media.getDisplayMedia = async (options) => {
      const stream = await original(options);
      window.__testCaptureTracks.push(...stream.getTracks());
      return stream;
    };
  });
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send("Target.getTargets");
  const panelCdp = await context.newCDPSession(panel);
  const { targetInfo: openerTarget } = await panelCdp.send(
    "Target.getTargetInfo",
  );
  const pipTargets = targetInfos.filter(
    (target) => target.type === "page" && target.url === "about:blank",
  );
  const pipTarget =
    pipTargets.find((target) => target.openerId === openerTarget.targetId) ??
    (pipTargets.length === 1 ? pipTargets[0] : undefined);
  assert.ok(
    pipTarget,
    `the extension bubble must be a real Picture-in-Picture target; candidates=${JSON.stringify(pipTargets.map(({ targetId, openerId, url }) => ({ targetId, openerId, url })))}`,
  );
  await panelCdp.detach();
  await cdp.detach();
  await floatingCommand(pipTarget.targetId, "Runtime.evaluate", {
    expression: `document.querySelector('[role="switch"]').click()`,
    userGesture: true,
  });
  await panel.waitForFunction(
    // The shared video stays in the opener while the controls move into PiP.
    () => document.querySelector("video")?.videoWidth > 0,
  );
  assert.deepEqual(
    await panel.evaluate(() =>
      window.__testCaptureTracks.map(({ kind, readyState }) => ({
        kind,
        readyState,
      })),
    ),
    [{ kind: "video", readyState: "live" }],
    "native sharing must produce a real video track for the cleanup check",
  );

  const captured = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  assert.ok(!captured.isError, JSON.stringify(captured.content));
  const image = captured.content.find((item) => item.type === "image");
  assert.ok(image, "real shared browser pixels must return through MCP as PNG");
  const png = PNG.sync.read(Buffer.from(image.data, "base64"));
  assert.ok(
    png.width >= 640 && png.height >= 400,
    `unexpected capture ${png.width}x${png.height}`,
  );
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 4096)
    colors.add(png.data.subarray(i, i + 3).toString("hex"));
  assert.ok(
    colors.size > 3,
    "the captured tab must contain rendered fixture content",
  );

  const previousCapture = await panel.evaluate(
    () =>
      window.documentPictureInPicture.window.document.querySelector(
        ".capture-chip img",
      )?.src,
  );
  // Video metadata and the MCP response can arrive before the asynchronous
  // picker handoff has released the UI. CDP's DOM click does not wait for an
  // enabled control the way a Playwright click does.
  await panel.waitForFunction(
    (label) =>
      [
        ...window.documentPictureInPicture.window.document.querySelectorAll(
          ".capture-buttons button",
        ),
      ].some((button) => button.textContent === label && !button.disabled),
    en.region,
  );
  await floatingCommand(pipTarget.targetId, "Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(en.region)}).click()`,
    userGesture: true,
  });
  const frozen = panel.locator("[data-blinkling-frozen-crop]");
  await frozen.waitFor({ state: "visible" });
  await panel.bringToFront();
  const frameBounds = await frozen.locator("img").boundingBox();
  const dpr = await panel.evaluate(() => devicePixelRatio);
  assert.ok(Math.abs(frameBounds.width * dpr - png.width) < 1);
  assert.ok(Math.abs(frameBounds.height * dpr - png.height) < 1);
  await panel.mouse.move(frameBounds.x + 20, frameBounds.y + 20);
  await panel.mouse.down();
  await panel.mouse.move(frameBounds.x + 320, frameBounds.y + 220);
  await panel.mouse.up();
  await panel.keyboard.press("Enter");
  await frozen.waitFor({ state: "detached" });
  await restoreBubble(panel);
  await panel.waitForFunction((previous) => {
    const image =
      window.documentPictureInPicture.window?.document.querySelector(
        ".capture-chip img",
      );
    return image?.complete && image.src !== previous;
  }, previousCapture);
  const cropImage = await panel.evaluate(
    () =>
      window.documentPictureInPicture.window.document.querySelector(
        ".capture-chip img",
      ).src,
  );
  const crop = PNG.sync.read(Buffer.from(cropImage.split(",")[1], "base64"));
  assert.equal(crop.width, Math.round(300 * dpr));
  assert.equal(crop.height, Math.round(200 * dpr));

  await panel.bringToFront();
  await panel.evaluate(() => document.activeElement?.blur());
  await panel.waitForFunction(() => document.hasFocus());
  await panel.keyboard.down("Shift");
  try {
    await frozen.locator(".surface").waitFor({ state: "visible" });
  } finally {
    await panel.keyboard.up("Shift");
  }
  await panel.keyboard.press("Escape");
  await frozen.waitFor({ state: "detached" });
  await restoreBubble(panel);

  await client.callTool({ name: "screen_clear", arguments: {} });
  await panel.evaluate(() => {
    window.documentPictureInPicture.window.close();
  });
  await panel.locator(".app").waitFor();
  await panel.waitForFunction(() =>
    window.__testCaptureTracks.every((track) => track.readyState === "ended"),
  );
  console.log(
    `Screen E2E passed: actual /install pairing, native sharing (${png.width}x${png.height}), MCP PNG, fullscreen crop, native Shift crop, real PiP and track cleanup. Capture APIs were not mocked.`,
  );
} finally {
  await context?.close();
  await browser?.close();
  await client.close();
  await new Promise((resolveClose) => fixture.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
