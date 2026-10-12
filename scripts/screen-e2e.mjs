import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PNG } from "pngjs";

const fixture = createServer((_, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><title>Glimpselet Screen Fixture</title>
    <style>body{margin:0;background:#faecd6;color:#241f1a;font:24px system-ui;padding:48px}h1{font-size:32px}code{display:block;padding:24px;background:#203d54;color:white}p{margin-top:32px}</style>
    <h1>Glimpselet capture test</h1><code>GL472: 設定を保存できませんでした</code>
    <p>The Japanese message says the settings could not be saved.</p>`);
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
const client = new Client({ name: "glimpselet-screen-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/glimpselet.cjs"],
  stderr: "pipe",
  env: { ...process.env, GLIMPSELET_DISABLE_BROWSER_OPEN: "1" },
});
let browser;
async function clickFloatingShare(targetId) {
  const cdp = await browser.newBrowserCDPSession();
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: false,
  });
  try {
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Floating capture activation timed out")),
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
        else resolve();
      });
    });
    await cdp.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression: `[...document.querySelectorAll('button')].find(b => b.textContent === 'Share a screen').click()`,
          userGesture: true,
        },
      }),
    });
    await response;
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId });
    await cdp.detach();
  }
}
try {
  await client.connect(transport);
  const opened = await client.callTool({ name: "panel_open", arguments: {} });
  const url = opened.content
    .find((item) => item.type === "text")
    ?.text.match(/http:\/\/\S+$/)?.[0];
  assert.ok(url, "panel_open must return the authenticated panel URL");
  browser = await chromium.launch({
    headless: false,
    args: [
      "--auto-select-tab-capture-source-by-title=Glimpselet Screen Fixture",
      "--enable-usermedia-screen-capturing",
      "--allow-http-screen-capture",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 960, height: 680 },
  });
  const source = await context.newPage();
  await source.goto(fixtureUrl);
  const panel = await context.newPage();
  panel.setDefaultTimeout(15_000);
  await panel.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    window.__testCaptureTracks = [];
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await original(options);
      window.__testCaptureTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await panel.goto(url);
  await panel
    .getByRole("button", { name: "Share a screen", exact: true })
    .click();
  await panel.getByRole("img", { name: "Shared screen preview" }).waitFor();
  await panel.waitForFunction(
    () => document.querySelector("video")?.videoWidth > 0,
  );
  const captured = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  assert.ok(!captured.isError, JSON.stringify(captured.content));
  const image = captured.content.find((item) => item.type === "image");
  assert.ok(image, "the real browser share must return a PNG through MCP");
  const png = PNG.sync.read(Buffer.from(image.data, "base64"));
  assert.ok(
    png.width >= 640 && png.height >= 400,
    `unexpected capture ${png.width}x${png.height}`,
  );
  const palette = new Set();
  for (let i = 0; i < png.data.length; i += 4096)
    palette.add(png.data.subarray(i, i + 3).toString("hex"));
  assert.ok(
    palette.size > 3,
    "the real captured tab must contain its rendered content",
  );

  if (process.argv.includes("--live")) {
    const requests = [];
    panel.on("request", (request) => {
      if (request.url().endsWith("/api/ask"))
        requests.push(request.postDataJSON());
    });
    await panel.getByRole("button", { name: "Settings", exact: true }).click();
    await panel.getByLabel("Model", { exact: true }).selectOption("haiku");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await panel
      .getByRole("textbox")
      .fill("Translate the Japanese error and include its exact error code.");
    await panel.getByRole("button", { name: "Ask", exact: true }).click();
    await panel.waitForFunction(
      () =>
        document
          .querySelector(".answer .markdown")
          ?.textContent?.includes("GL472"),
      null,
      { timeout: 120_000 },
    );
    const answer = await panel.locator(".answer .markdown").last().innerText();
    assert.match(answer, /GL472/);
    assert.match(answer, /sav|save|保存/i);
    await panel.getByRole("button", { name: "Ask", exact: true }).waitFor();
    console.log(
      "Live provider answered the real browser-captured Japanese fixture with its exact GL472 code.",
    );
    await panel.locator(".timeline > summary").click();
    await panel.getByRole("button", { name: /^Passive mode/ }).click();
    await panel.waitForTimeout(2300);
    await source.evaluate(() => {
      document.body.style.background = "#b8dccb";
      document.querySelector("h1").textContent = "Build complete";
      document.querySelector("code").textContent = "GL473: Settings saved";
    });
    await panel.waitForFunction(
      () =>
        [...document.querySelectorAll(".timeline article strong")].filter(
          (element) => element.textContent.startsWith("Briefly describe"),
        ).length >= 1,
      null,
      { timeout: 120_000 },
    );
    await source.evaluate(() => {
      document.body.style.background = "#c9d7f4";
      document.querySelector("h1").textContent = "Deployment complete";
      document.querySelector("code").textContent = "GL474: Settings published";
    });
    await panel.waitForFunction(
      () =>
        [...document.querySelectorAll(".timeline article strong")].filter(
          (element) => element.textContent.startsWith("Briefly describe"),
        ).length >= 2,
      null,
      { timeout: 120_000 },
    );
    await panel.getByRole("button", { name: /^Pause/ }).click();
    await panel
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Summarize last ten minutes", exact: true })
      .click();
    await panel.waitForFunction(
      () =>
        document.querySelector(".answer .markdown")?.textContent &&
        ![...document.querySelectorAll("button")].some(
          (button) => button.textContent === "Cancel",
        ),
      null,
      { timeout: 120_000 },
    );
    const summary = await panel.locator(".answer .markdown").last().innerText();
    assert.match(summary, /GL47|build|sav|settings/i);
    assert.ok(
      requests.filter((request) => request.mode === "passive").length >= 2,
    );
    const summaryRequest = requests.find(
      (request) => request.mode === "summary",
    );
    assert.ok(summaryRequest, "the timeline must submit a summary request");
    assert.equal(
      summaryRequest.image,
      undefined,
      "summaries send no fresh image",
    );
    console.log(
      "Live passive notes recorded a real tab change and produced a text-only summary after screen sharing stopped.",
    );
  }

  await panel.getByRole("button", { name: "Float panel", exact: true }).click();
  await panel.waitForFunction(() =>
    window.documentPictureInPicture?.window?.document.querySelector(".app"),
  );
  assert.equal(
    await panel.locator(".app").count(),
    0,
    "the opener must give the floating window sole ownership of the panel",
  );
  await panel.waitForFunction(() => {
    const child = window.documentPictureInPicture.window;
    return (
      getComputedStyle(child.document.querySelector(".app")).backgroundColor ===
      "rgb(250, 247, 239)"
    );
  });
  await panel.evaluate(() => window.documentPictureInPicture.window.close());
  await panel.locator(".app").waitFor();
  await panel.waitForFunction(() =>
    window.__testCaptureTracks.every((track) => track.readyState === "ended"),
  );
  assert.equal(
    await panel
      .getByRole("button", { name: "Stop sharing", exact: true })
      .count(),
    0,
  );
  await panel.getByRole("button", { name: "Float panel", exact: true }).click();
  await panel.waitForFunction(() =>
    window.documentPictureInPicture?.window?.document.querySelector(".app"),
  );
  const targets = await browser.newBrowserCDPSession();
  const { targetInfos: openedTargets } =
    await targets.send("Target.getTargets");
  const panelCdp = await context.newCDPSession(panel);
  const { targetInfo: openerTarget } = await panelCdp.send(
    "Target.getTargetInfo",
  );
  const childTarget = openedTargets.find(
    (target) =>
      target.type === "page" &&
      target.url === "about:blank" &&
      target.targetId !== openerTarget.targetId,
  );
  assert.ok(childTarget, "the floating window must expose its browser target");
  await targets.detach();
  await panelCdp.detach();
  await clickFloatingShare(childTarget.targetId);
  await panel.waitForFunction(
    () =>
      window.documentPictureInPicture.window.document.querySelector("video")
        ?.videoWidth > 0,
  );
  await panel.waitForTimeout(300);
  const fromFloating = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  assert.ok(
    !fromFloating.isError &&
      fromFloating.content.some((item) => item.type === "image"),
    "sharing started from the real floating window must reach MCP",
  );
  await client.callTool({ name: "screen_clear", arguments: {} });
  await panel.waitForFunction(
    () =>
      !window.documentPictureInPicture.window.document.querySelector(
        ".stage .frame",
      ),
  );
  await panel.evaluate(() => window.documentPictureInPicture.window.close());
  console.log(
    `Screen E2E passed: native tab sharing (${png.width}x${png.height}), MCP PNG delivery, actual Picture-in-Picture, and track cleanup on close. No capture API was mocked.`,
  );
} finally {
  await browser?.close();
  await client.close();
  await new Promise((resolve) => fixture.close(resolve));
}
