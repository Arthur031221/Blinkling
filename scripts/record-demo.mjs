import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const out = resolve("assets/demo.gif");
const socialCard = resolve("assets/social-card.png");
const screenshots = resolve("assets/screenshots");
const port = 5188;
const origin = `http://127.0.0.1:${port}`;
const vite = resolve("node_modules/vite/bin/vite.js");
const ffmpegArgs = (frames) => [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-framerate",
  "12",
  "-i",
  join(frames, "frame-%04d.png"),
  "-vf",
  "fps=12,scale=1200:675:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
  "-loop",
  "0",
  out,
];

async function assertPortFree() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolveListen);
  });
  await new Promise((resolveClose) => probe.close(resolveClose));
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGTERM");
  await exited;
}

async function waitForApp(page) {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Vite exited before startup");
    try {
      const response = await page.goto(`${origin}/?demo=1`, {
        waitUntil: "domcontentloaded",
        timeout: 1000,
      });
      if (response?.ok()) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Vite did not start on port 5188");
}

async function waitForFixture(page) {
  await page
    .getByRole("textbox")
    .fill("Which control saves these preferences?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .locator(".answer .markdown")
    .getByText(/This prerecorded answer makes no provider call/)
    .waitFor();
}

async function draw(page, mode, start, end) {
  const buttonName = mode === "crop" ? /Select area/ : /redaction/;
  await page.getByRole("button", { name: buttonName }).click();
  const bounds = await page.locator(".stage .frame").boundingBox();
  if (!bounds) throw new Error("The sample stage is not visible");
  await page.mouse.move(
    bounds.x + start[0] * bounds.width,
    bounds.y + start[1] * bounds.height,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + end[0] * bounds.width,
    bounds.y + end[1] * bounds.height,
    { steps: 8 },
  );
  await page.mouse.up();
  await page
    .locator(mode === "crop" ? ".selection" : ".mask")
    .last()
    .waitFor();
  await page.waitForTimeout(180);
}

async function setTheme(page, theme) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".settings select").nth(1).selectOption(theme);
  await page.locator(".settings-actions button").last().click();
  await page.waitForTimeout(250);
  if (
    (await page.locator("main.app").getAttribute("class"))?.includes(theme) !==
    true
  ) {
    throw new Error(`Theme setting did not switch to ${theme}`);
  }
}

const frames = await mkdtemp(join(tmpdir(), "glimpselet-record-"));
await mkdir(screenshots, { recursive: true });
await assertPortFree();
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: "ignore",
    env: { ...process.env, GLIMPSELET_POLL_WATCH: "1" },
  },
);
let browser;
let ffmpeg;
let appPage;
const pageErrors = [];
try {
  browser = await chromium.launch({ headless: true });
  appPage = await browser.newPage({
    viewport: { width: 420, height: 860 },
    deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  appPage.setDefaultTimeout(10000);
  appPage.on("pageerror", (error) => pageErrors.push(error.message));
  appPage.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await waitForApp(appPage);
  await appPage.locator(".stage .frame").waitFor();
  await waitForFixture(appPage);
  await appPage.waitForTimeout(500);

  await draw(appPage, "crop", [0.1, 0.12], [0.4, 0.46]);
  await draw(appPage, "mask", [0.61, 0.16], [0.83, 0.35]);
  await appPage.getByRole("button", { name: "Pin", exact: true }).click();
  await appPage
    .locator(".answer")
    .first()
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  await appPage.waitForTimeout(200);

  for (const theme of ["light", "dark"]) {
    for (const width of [360, 420, 520]) {
      await appPage.setViewportSize({ width, height: 860 });
      if (width !== 420) await appPage.waitForTimeout(120);
      const overflow = await appPage.evaluate(() => ({
        page: document.documentElement.scrollWidth > window.innerWidth,
        app:
          document.querySelector("main.app")?.scrollWidth > window.innerWidth,
      }));
      if (overflow.page || overflow.app) {
        throw new Error(`Horizontal overflow at ${width}px in ${theme} theme`);
      }
      await appPage.screenshot({
        path: join(screenshots, `${theme}-${width}.png`),
        fullPage: true,
      });
    }
    if (theme === "light") await setTheme(appPage, "dark");
  }

  await setTheme(appPage, "light");
  await waitForApp(appPage);
  await appPage.locator(".stage .frame").waitFor();
  await waitForFixture(appPage);
  await appPage.waitForTimeout(300);
  await appPage.setViewportSize({ width: 1200, height: 675 });
  await appPage.evaluate(() => {
    const editorial = document.createElement("aside");
    editorial.id = "demo-editorial";
    editorial.innerHTML = `
      <div class="eyebrow"><span class="blink-dot"></span> A small question, in context</div>
      <h1>Glimpselet</h1>
      <p class="dek">Ask about what you see.<br>Keep the answer beside it.</p>
      <div class="steps"><span>01&nbsp; Select</span><span>02&nbsp; Ask</span><span>03&nbsp; Keep</span></div>
      <div class="caption"><b id="demo-phase">A clear answer, right beside the screen.</b><span id="demo-note">Labeled local fixture · no provider call</span></div>
      <div class="wordmark">A calmer way to look closer</div>`;
    document.body.prepend(editorial);
    const style = document.createElement("style");
    style.textContent = `
      html,body,#root{width:100%;height:100%;min-height:0;margin:0;overflow:hidden}
      body{background:#f2efe8;color:#272621;font-family:Inter,system-ui,sans-serif}
      #root{position:absolute;top:2px;right:54px;width:520px;height:870px;min-width:0;min-height:0;transform:scale(.77);transform-origin:top right;border:1px solid #d8d0c4;border-radius:20px;overflow:hidden;background:#faf7ef;box-shadow:0 28px 72px #32281d24,0 3px 10px #32281d10}
      #root .body{padding:10px 18px 10px}
      #root .stage{height:165px;min-height:140px;max-height:165px}
      #root .chips,#root .timeline,#root .notice{display:none}
      #demo-editorial{position:absolute;inset:0 auto 0 0;width:690px;padding:88px 0 50px 82px;display:flex;flex-direction:column;justify-content:center;background:radial-gradient(ellipse at 8% 93%,#e6d9c5 0,transparent 38%),#f2efe8}
      #demo-editorial .eyebrow{display:flex;align-items:center;gap:10px;color:#8b5b48;font-size:13px;letter-spacing:.11em;text-transform:uppercase;font-weight:700}
      .blink-dot{width:18px;height:18px;border-radius:5px;background:#3ddc97;box-shadow:inset 0 0 0 1px #167d55}
      #demo-editorial h1{font:500 76px/1 Fraunces,Georgia,serif;letter-spacing:-3px;margin:23px 0 16px;color:#282720}
      #demo-editorial .dek{font:400 28px/1.35 Inter,system-ui,sans-serif;letter-spacing:-.6px;margin:0;color:#514d45}
      #demo-editorial .steps{display:flex;gap:10px;margin-top:34px}
      #demo-editorial .steps span{padding:9px 13px;border:1px solid #d7cdbf;border-radius:20px;background:#faf8f2;color:#61584f;font-size:12px;letter-spacing:.04em}
      #demo-editorial .caption{display:flex;flex-direction:column;gap:7px;margin-top:50px;color:#423e37;font-size:14px}
      #demo-editorial .caption span{color:#84796c;font-size:11px;letter-spacing:.04em}
      #demo-editorial .wordmark{position:absolute;bottom:34px;color:#8b5b48;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
    `;
    document.head.append(style);
  });
  await appPage.waitForTimeout(350);

  let n = 0;
  const captureFor = async (milliseconds) => {
    const count = Math.round(milliseconds / (1000 / 12));
    for (let i = 0; i < count; i++) {
      await appPage.screenshot({
        path: join(frames, `frame-${String(n++).padStart(4, "0")}.png`),
        animations: "disabled",
      });
      await delay(1000 / 12);
    }
  };
  const phase = async (
    title,
    note = "Labeled local fixture · no provider call",
  ) => {
    await appPage.locator("#demo-phase").evaluate((el, text) => {
      el.textContent = text;
    }, title);
    await appPage.locator("#demo-note").evaluate((el, text) => {
      el.textContent = text;
    }, note);
  };

  await appPage.setViewportSize({ width: 1200, height: 675 });
  await phase("A clear answer, right beside the screen.");
  await appPage.locator("#root").screenshot({
    path: join(screenshots, "demo.png"),
    animations: "disabled",
  });
  await captureFor(1200);
  await phase("Drag a rectangle around the detail.");
  await draw(appPage, "crop", [0.1, 0.2], [0.43, 0.6]);
  await captureFor(1900);
  await phase("Mask sensitive details with a true black overlay.");
  await draw(appPage, "mask", [0.6, 0.3], [0.85, 0.54]);
  await captureFor(1900);
  await phase("Copy the answer. Pin it for the next glance.");
  await appPage
    .locator(".answer")
    .first()
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  await appPage.waitForTimeout(250);
  await appPage.getByRole("button", { name: "Pin", exact: true }).click();
  await captureFor(1900);
  await phase(
    "Choose the mood that feels right.",
    "Theme changed in Settings · real panel",
  );
  await appPage.getByRole("button", { name: "Settings" }).click();
  await appPage.locator(".settings select").nth(1).selectOption("dark");
  await captureFor(1200);
  await appPage.locator(".settings-actions button").last().click();
  await captureFor(2100);
  await phase("A little answer, kept close.");
  await captureFor(1600);

  if (pageErrors.length)
    throw new Error(`Browser errors: ${pageErrors.join(" | ")}`);

  await appPage.goto(`file://${resolve("assets/social-card.html")}`);
  await appPage.setViewportSize({ width: 1200, height: 675 });
  await appPage.screenshot({ path: socialCard });

  ffmpeg = spawn("ffmpeg", ffmpegArgs(frames), {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const code = await new Promise((resolveExit, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("exit", resolveExit);
  });
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  console.log(`Recorded ${n} 1200x675 frames to ${out}; local fixture only.`);
} finally {
  if (ffmpeg) await stop(ffmpeg);
  await browser?.close();
  await stop(server);
  await rm(frames, { recursive: true, force: true });
}
