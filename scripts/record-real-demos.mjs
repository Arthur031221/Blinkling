import "../desktop/shared/test-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ExtensionBridge } from "../bridge/dist/extension-bridge.js";
import { ExtensionSessions } from "../bridge/dist/extension-sessions.js";
import { runCliProvider } from "../bridge/dist/provider-cli.js";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../bridge/dist/extension-install.js";
import { nativeControls } from "../e2e-extension/native-permission.ts";
import en from "../extension/locales/en.json" with { type: "json" };

// Public-site recordings use the shipped UI and the logged-in CLI provider.
// CI's offline recording remains scripts/record-demo.mjs. Nothing here replaces
// page content, model responses or guide steps with fixtures.
if (!process.env.BLINKLING_REAL_RECORD_DISPLAY) {
  const result = spawnSync(
    "xvfb-run",
    [
      "-a",
      "-s",
      "-screen 0 1440x1000x24",
      "dbus-run-session",
      "--",
      process.execPath,
      resolve("scripts/record-real-demos.mjs"),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, BLINKLING_REAL_RECORD_DISPLAY: "1" },
    },
  );
  process.exit(result.status ?? 1);
}
const extension = resolve("bin/extension");
const temp = await mkdtemp(join(tmpdir(), "blinkling-real-demo-"));
const evidence = resolve(
  process.env.BLINKLING_RECORD_EVIDENCE || "test-results/real-demos",
);
await mkdir(evidence, { recursive: true });
const wm = spawn("xfwm4", ["--sm-client-disable", "--compositor=off"], {
  stdio: "ignore",
});
await new Promise((done) => setTimeout(done, 1000));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/install/status") {
    const connected = bridge.installStatus(url.searchParams.get("code"));
    res.writeHead(connected === undefined ? 401 : 200, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify({ connected, mode: "direct" }));
  } else if (url.pathname === "/install-guide.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(INSTALL_GUIDE_SCRIPT);
  } else if (url.pathname.startsWith("/assets/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    res.end(await readFile(resolve("bin/panel", `.${url.pathname}`)));
  } else {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(installGuide(extension));
  }
});
let origin;
const requests = [];
const bridge = new ExtensionBridge(server, () => origin, {
  sessions: new ExtensionSessions(temp, async () => []),
  provider: async (request) => {
    console.log(`Real Claude Code: ${request.kind}`);
    const result = await runCliProvider(request);
    requests.push({
      kind: request.kind,
      question: request.question,
      answer: result.answer,
    });
    return result;
  },
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
origin = `http://127.0.0.1:${server.address().port}`;
let context;
let recording;
const results = [];
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await ended;
}
function runFfmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...args],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
async function screenshot(name) {
  runFfmpeg([
    "-f",
    "x11grab",
    "-video_size",
    "1440x1000",
    "-i",
    `${process.env.DISPLAY}.0+0,0`,
    "-frames:v",
    "1",
    join(evidence, `${name}.png`),
  ]);
}
try {
  context = await chromium.launchPersistentContext(join(temp, "profile"), {
    channel: process.env.BLINKLING_RECORD_BROWSER || "chromium",
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-unsafe-extension-debugging",
      "--no-sandbox",
      "--force-device-scale-factor=1",
      "--window-position=0,0",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.version, "2.1.0");
  await worker.evaluate(() =>
    chrome.storage.local.set({
      consented: true,
      locale: "en",
      model: "haiku",
      effort: "low",
      passive: false,
      pipSize: { width: 420, height: 650 },
      targetLocale: "zh-TW",
    }),
  );
  const welcome = context.pages()[0] || (await context.newPage());
  await welcome.goto(`${origin}/install#code=${bridge.issueCode()}`);
  await expect(welcome.locator("#connection")).toContainText(
    /Connection set up|Connected to your Claude Code/,
    {
      timeout: 30000,
    },
  );
  await welcome.close();
  console.log("Browser connected");
  for (const [name, url] of [
    ["flight", "https://www.google.com/travel/flights?hl=en"],
    ["arxiv", "https://arxiv.org/html/2501.12948v1"],
  ]) {
    const site = await context.newPage();
    console.log(`Loading ${name}: ${url}`);
    const response = await site.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    assert(response.ok(), `${name}: HTTP ${response.status()}`);
    await worker.evaluate(async () => {
      const windows = await chrome.windows.getAll();
      for (const window of windows.filter((w) => w.type === "normal"))
        await chrome.windows.update(window.id, {
          state: "normal",
          left: 0,
          top: 0,
          width: 1440,
          height: 1000,
        });
    });
    const tabId = await worker.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
      site.url(),
    );
    const panel = await context.newPage();
    panel.setDefaultTimeout(180000);
    await panel.goto(`chrome-extension://${id}/panel.html?sourceTab=${tabId}`);
    if (
      !(await worker.evaluate(() =>
        chrome.permissions.contains({ origins: ["<all_urls>"] }),
      ))
    ) {
      console.log(`${name}: granting site access`);
      const permitted = panel.evaluate(() =>
        chrome.permissions.request({ origins: ["<all_urls>"] }),
      );
      let allow;
      await expect
        .poll(
          async () => {
            await screenshot("site-permission");
            allow = nativeControls(join(evidence, "site-permission.png")).find(
              (control) => control.name === "Allow",
            );
            return Boolean(allow);
          },
          { timeout: 15000 },
        )
        .toBe(true);
      execFileSync("python3", [
        "-c",
        `import ctypes,sys
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');P=ctypes.c_void_p
x.XOpenDisplay.restype=P;d=x.XOpenDisplay(None)
t.XTestFakeMotionEvent.argtypes=[P,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[P,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
x.XFlush.argtypes=[P]
t.XTestFakeMotionEvent(d,-1,int(sys.argv[1]),int(sys.argv[2]),0)
t.XTestFakeButtonEvent(d,1,1,0);t.XTestFakeButtonEvent(d,1,0,0);x.XFlush(d)
`,
        String(Math.round(allow.x + allow.width / 2)),
        String(Math.round(allow.y + allow.height / 2)),
      ]);
      assert(await permitted, "Site access was not granted");
    }
    console.log(`${name}: opening floating panel`);
    await expect(panel.locator(".connection")).toHaveClass(/online/);
    const opened = context.waitForEvent("page");
    await panel
      .getByRole("button", { name: en.float, exact: true })
      .first()
      .click();
    const bubble = await opened;
    bubble.setDefaultTimeout(180000);
    await bubble.locator(".composer textarea").waitFor();
    await worker.evaluate(
      async (left) => {
        const bubble = (await chrome.windows.getAll()).find(
          (w) => w.alwaysOnTop,
        );
        await chrome.windows.update(bubble.id, { left, top: 260 });
      },
      name === "flight" ? 20 : 985,
    );
    await site.bringToFront();
    const video = join(evidence, `${name}.mp4`);
    recording = spawn(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "x11grab",
        "-video_size",
        "1440x1000",
        "-framerate",
        "12",
        "-i",
        `${process.env.DISPLAY}.0+0,0`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        video,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const started = Date.now();
    const segments = [];
    let segmentStart = 0;
    const end = () =>
      segments.push([segmentStart, (Date.now() - started) / 1000]);
    const begin = () => {
      segmentStart = (Date.now() - started) / 1000;
    };
    const hold = (ms = 1800) => site.waitForTimeout(ms);
    const ready = () =>
      expect(bubble.locator(".composer button.send")).toBeVisible({
        timeout: 180000,
      });
    if (name === "flight") {
      await hold();
      await bubble
        .getByRole("button", { name: en.guideAction, exact: true })
        .click();
      await hold(2500);
      end();
      const guide = site.locator("[data-blinkling-overlay] .guide");
      await expect(guide).toBeVisible({ timeout: 180000 });
      await ready();
      const placeBesideGuide = async () => {
        const box = await guide.boundingBox();
        assert(box, "The page guide has no visible callout");
        await worker.evaluate(
          async (left) => {
            const bubble = (await chrome.windows.getAll()).find(
              (w) => w.alwaysOnTop,
            );
            await chrome.windows.update(bubble.id, { left });
          },
          box.x < 720 ? 985 : 20,
        );
      };
      begin();
      await placeBesideGuide();
      await site.bringToFront();
      await hold(2000);
      await screenshot("flight-guide");
      const tour = guide.getByRole("button", {
        name: en.guideTour,
        exact: true,
      });
      if (await tour.count()) await tour.click();
      await hold(2000);
      await guide.getByRole("button", { name: en.next, exact: true }).click();
      await placeBesideGuide();
      await hold(1800);
      await site.keyboard.press("Escape");
      await bubble
        .locator(".composer textarea")
        .pressSequentially(
          "How do I find a round-trip flight from Taipei to Tokyo?",
          { delay: 35 },
        );
      await bubble.locator(".composer button.send").click();
      await hold(1800);
      end();
      await ready();
      await expect(bubble.locator(".message .answer").last()).not.toBeEmpty();
      begin();
      await bubble.locator(".composer textarea").click();
      await bubble.locator(".message .answer").last().scrollIntoViewIfNeeded();
      await hold(3500);
      await screenshot("flight-answer");
      end();
    } else {
      const passage = site.locator(".ltx_abstract p").first();
      await passage.waitFor();
      await passage.scrollIntoViewIfNeeded();
      const select = async () => {
        await passage.evaluate((p) => {
          const range = document.createRange();
          range.selectNodeContents(p);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        });
        await expect(
          site.locator("[data-blinkling-overlay] .popover"),
        ).toBeVisible();
      };
      await hold();
      await select();
      await hold(1600);
      await site
        .locator("[data-blinkling-overlay] .popover")
        .getByRole("button", { name: "Ask", exact: true })
        .click();
      await expect(bubble.locator(".composer textarea")).not.toHaveValue("");
      await bubble
        .locator(".composer textarea")
        .fill(
          "What is the main finding of this selected abstract?\n\n" +
            (await passage.innerText()),
        );
      await hold(1600);
      await bubble.locator(".composer button.send").click();
      await hold(1600);
      end();
      await ready();
      begin();
      await bubble.locator(".composer textarea").click();
      await bubble.locator(".message .answer").last().scrollIntoViewIfNeeded();
      await hold(3500);
      await screenshot("arxiv-ask");
      await site.bringToFront();
      await select();
      await hold(1600);
      await site
        .locator("[data-blinkling-overlay] .popover")
        .getByRole("button", { name: /^Translate(?: selected text)?$/ })
        .click();
      await hold(1800);
      end();
      await ready();
      await expect(bubble.locator(".message .answer").last()).toContainText(
        /[\u3400-\u9fff]/,
      );
      begin();
      await bubble.locator(".composer textarea").click();
      await bubble.locator(".message .answer").last().scrollIntoViewIfNeeded();
      await hold(4000);
      await screenshot("arxiv-translation");
      end();
    }
    await stop(recording);
    recording = undefined;
    const filters = segments.map(
      ([start, end], i) =>
        `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`,
    );
    const inputs = segments.map((_, i) => `[v${i}]`).join("");
    filters.push(
      `${inputs}concat=n=${segments.length}:v=1:a=0,fps=10,scale=1008:-1:flags=lanczos,split[a][b]`,
      "[a]palettegen=stats_mode=diff[p]",
      "[b][p]paletteuse=dither=bayer:bayer_scale=3[out]",
    );
    runFfmpeg([
      "-i",
      video,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-loop",
      "0",
      resolve(name === "flight" ? "assets/demo.gif" : "assets/arxiv.gif"),
    ]);
    results.push({
      name,
      url: site.url(),
      version: manifest.version,
      segments,
      requests: requests.splice(0),
    });
    await writeFile(
      join(evidence, "recordings.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(`${name}: recorded real extension flow`);
    await bubble.close();
    await panel.close();
    await site.close();
  }
  const sha256 = (data) => createHash("sha256").update(data).digest("hex");
  const recordings = await Promise.all(
    results.map(async ({ name, url, segments, requests }) => {
      const asset = name === "flight" ? "assets/demo.gif" : "assets/arxiv.gif";
      return {
        asset,
        url,
        sha256: sha256(await readFile(asset)),
        segments,
        requestCount: requests.length,
        requestsSha256: sha256(JSON.stringify(requests)),
      };
    }),
  );
  await writeFile(
    "assets/recordings.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        version: results[0].version,
        extension: "bin/extension",
        provider: "Signed-in Claude Code CLI",
        model: "haiku",
        capture: "X11 desktop with native Document Picture-in-Picture",
        editing: "Waiting time shortened; frames and replies unchanged",
        recordings,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  for (const [i, page] of (context?.pages() || []).entries()) {
    await page
      .screenshot({ path: join(evidence, `failure-${i}.png`) })
      .catch(() => {});
    console.log(
      page.url(),
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-3000),
    );
  }
  throw error;
} finally {
  await stop(recording);
  await context?.close();
  await bridge.close();
  await new Promise((done) => server.close(done));
  await stop(wm);
  await rm(temp, { recursive: true, force: true });
}
