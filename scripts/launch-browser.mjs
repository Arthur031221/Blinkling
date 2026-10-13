#!/usr/bin/env node
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const runtime =
  process.env.GLIMPSELET_RUNTIME_DIR ||
  join(homedir(), ".glimpselet", "runtime");
const runtimeModules = join(runtime, "node_modules");
const playwrightVersion = "1.64.0";
let playwrightCli;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(runtime, "browsers");
let activeChild;
let context;
let interrupted = false;

function stop(signal) {
  interrupted = true;
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  if (activeChild?.pid) {
    try {
      if (process.platform === "win32") activeChild.kill(signal);
      else process.kill(-activeChild.pid, signal);
    } catch {
      /* The child may already have stopped. */
    }
  }
  if (context) void context.close().catch(() => {});
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      ...options,
    });
    activeChild = child;
    child.once("error", (error) => {
      if (activeChild === child) activeChild = undefined;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (signal) reject(new Error(`${command} stopped by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with ${code}`));
      else resolveRun();
    });
  });
}

async function loadPlaywright() {
  try {
    const module = await import("playwright");
    playwrightCli = join(
      createRequire(import.meta.url).resolve("playwright/package.json"),
      "..",
      "cli.js",
    );
    return module;
  } catch {
    const packageFile = join(runtimeModules, "playwright", "index.mjs");
    if (!existsSync(packageFile)) {
      console.log(
        `Installing Playwright ${playwrightVersion} in ${runtime} (first run only)…`,
      );
      await run("npm", [
        "install",
        "--prefix",
        runtime,
        "--no-save",
        "--no-package-lock",
        `playwright@${playwrightVersion}`,
      ]);
    }
    playwrightCli = join(runtimeModules, "playwright", "cli.js");
    return import(pathToFileURL(packageFile).href);
  }
}

async function main() {
  if (interrupted) return;
  if (process.env.SSH_CONNECTION) {
    throw new Error(
      "Zero-install browser mode needs a desktop on this computer. 遠端主機沒有本機桌面，請在瀏覽器所在電腦安裝 Glimpselet，並使用列出的 SSH 轉送指令。",
    );
  }

  const stableExtension = join(homedir(), ".glimpselet", "extension");
  const builtExtension = resolve("dist-extension");
  const extension = resolve(
    process.env.GLIMPSELET_EXTENSION_DIR ||
      (existsSync(join(stableExtension, "manifest.json"))
        ? stableExtension
        : builtExtension),
  );
  if (!existsSync(join(extension, "manifest.json"))) {
    throw new Error(
      `Extension build not found at ${extension}. Run npm run build:extension first. 找不到擴充功能；請先執行 npm run build:extension。`,
    );
  }

  const { chromium } = await loadPlaywright();
  if (interrupted) return;
  let executablePath =
    process.env.GLIMPSELET_CHROMIUM_PATH || chromium.executablePath();
  if (!existsSync(executablePath)) {
    console.log(
      "Installing Chromium in the Glimpselet runtime… 正在安裝 Chromium…",
    );
    await run(process.execPath, [playwrightCli, "install", "chromium"]);
    if (interrupted) return;
    executablePath = chromium.executablePath();
  }

  const profile =
    process.env.GLIMPSELET_PROFILE_DIR ||
    join(homedir(), ".glimpselet", "chromium-profile");
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--enable-features=ExcludePipFromScreenCapture",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  if (manifest.name !== "Glimpselet")
    throw new Error("Glimpselet did not load in the dedicated browser.");
  console.log("Glimpselet extension loaded.");
  let closing = false;
  const closeContext = async () => {
    if (closing) return;
    closing = true;
    await context.close().catch(() => {});
  };
  if (interrupted) {
    await closeContext();
    return;
  }
  const closed = new Promise((resolveClose) =>
    context.once("close", resolveClose),
  );

  const trialUrl = process.env.GLIMPSELET_TRIAL_URL;
  if (trialUrl) {
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(trialUrl);
      console.log(`Opened the setup guide at ${trialUrl}.`);
    } catch (error) {
      throw new Error(
        `Could not open GLIMPSELET_TRIAL_URL: ${trialUrl}. 無法開啟指定的試用頁面. ${error.message}`,
      );
    }
  }
  console.log(
    `Glimpselet is running in a dedicated Chromium profile at ${profile}. Close the browser window to stop it.`,
  );
  await closed;
}

main().catch(async (error) => {
  await context?.close().catch(() => {});
  if (interrupted) return;
  console.error(`Glimpselet could not start: ${error.message}`);
  console.error("Please review the error above. 請檢查上方錯誤訊息。");
  process.exitCode = 1;
});
