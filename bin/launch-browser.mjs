#!/usr/bin/env node

// scripts/launch-browser.mjs
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// plugin/desktop/legacy.mjs
var OLD_PREFIX = "GLIMPSELET_";
var NEW_PREFIX = "BLINKLING_";
function adoptLegacyEnv(env = process.env) {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(OLD_PREFIX)) continue;
    const next = NEW_PREFIX + key.slice(OLD_PREFIX.length);
    if (env[next] === void 0) env[next] = env[key];
  }
  return env;
}

// scripts/launch-browser.mjs
adoptLegacyEnv();
var runtime = process.env.BLINKLING_RUNTIME_DIR || join(homedir(), ".blinkling", "runtime");
var runtimeModules = join(runtime, "node_modules");
var playwrightVersion = "1.64.0";
var playwrightCli;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(runtime, "browsers");
var activeChild;
var context;
var interrupted = false;
function stop(signal) {
  interrupted = true;
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  if (activeChild?.pid) {
    try {
      if (process.platform === "win32") activeChild.kill(signal);
      else process.kill(-activeChild.pid, signal);
    } catch {
    }
  }
  if (context) void context.close().catch(() => {
  });
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      ...options
    });
    activeChild = child;
    child.once("error", (error) => {
      if (activeChild === child) activeChild = void 0;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = void 0;
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
      "cli.js"
    );
    return module;
  } catch {
    const packageFile = join(runtimeModules, "playwright", "index.mjs");
    if (!existsSync(packageFile)) {
      console.log(
        `Installing Playwright ${playwrightVersion} in ${runtime} (first run only)\u2026`
      );
      await run("npm", [
        "install",
        "--prefix",
        runtime,
        "--no-save",
        "--no-package-lock",
        `playwright@${playwrightVersion}`
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
      "Zero-install browser mode needs a desktop on this computer. \u9060\u7AEF\u4E3B\u6A5F\u6C92\u6709\u672C\u6A5F\u684C\u9762\uFF0C\u8ACB\u5728\u700F\u89BD\u5668\u6240\u5728\u96FB\u8166\u5B89\u88DD Blinkling\uFF0C\u4E26\u4F7F\u7528\u5217\u51FA\u7684 SSH \u8F49\u9001\u6307\u4EE4\u3002"
    );
  }
  const stableExtension = join(homedir(), "Blinkling-extension");
  const builtExtension = resolve("dist-extension");
  const extension = resolve(
    process.env.BLINKLING_EXTENSION_DIR || (existsSync(join(stableExtension, "manifest.json")) ? stableExtension : builtExtension)
  );
  if (!existsSync(join(extension, "manifest.json"))) {
    throw new Error(
      `Extension build not found at ${extension}. Run npm run build:extension first. \u627E\u4E0D\u5230\u64F4\u5145\u529F\u80FD\uFF1B\u8ACB\u5148\u57F7\u884C npm run build:extension\u3002`
    );
  }
  const { chromium } = await loadPlaywright();
  if (interrupted) return;
  let executablePath = process.env.BLINKLING_CHROMIUM_PATH || chromium.executablePath();
  if (!existsSync(executablePath)) {
    console.log(
      "Installing Chromium in the Blinkling runtime\u2026 \u6B63\u5728\u5B89\u88DD Chromium\u2026"
    );
    await run(process.execPath, [playwrightCli, "install", "chromium"]);
    if (interrupted) return;
    executablePath = chromium.executablePath();
  }
  const profile = process.env.BLINKLING_PROFILE_DIR || join(homedir(), ".blinkling", "chromium-profile");
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--enable-features=ExcludePipFromScreenCapture",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`
    ]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15e3 });
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  if (manifest.name !== "Blinkling")
    throw new Error("Blinkling did not load in the dedicated browser.");
  console.log("Blinkling extension loaded.");
  let closing = false;
  const closeContext = async () => {
    if (closing) return;
    closing = true;
    await context.close().catch(() => {
    });
  };
  if (interrupted) {
    await closeContext();
    return;
  }
  const closed = new Promise(
    (resolveClose) => context.once("close", resolveClose)
  );
  const trialUrl = process.env.BLINKLING_TRIAL_URL;
  if (trialUrl) {
    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(trialUrl);
      console.log(`Opened the setup guide at ${trialUrl}.`);
    } catch (error) {
      throw new Error(
        `Could not open BLINKLING_TRIAL_URL: ${trialUrl}. \u7121\u6CD5\u958B\u555F\u6307\u5B9A\u7684\u8A66\u7528\u9801\u9762. ${error.message}`
      );
    }
  }
  console.log(
    `Blinkling is running in a dedicated Chromium profile at ${profile}. Close the browser window to stop it.`
  );
  await closed;
}
main().catch(async (error) => {
  await context?.close().catch(() => {
  });
  if (interrupted) return;
  console.error(`Blinkling could not start: ${error.message}`);
  console.error("Please review the error above. \u8ACB\u6AA2\u67E5\u4E0A\u65B9\u932F\u8AA4\u8A0A\u606F\u3002");
  process.exitCode = 1;
});
