#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version: releaseVersion } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const script = fileURLToPath(import.meta.url);
const output = "/tmp/glimpselet-v2-native-record-final";
const screenshotNames = [
  "01-extensions-before.png",
  "02-developer-mode.png",
  "03-select-extension-folder.png",
];

if (!process.argv.includes("--worker")) {
  const ownedRoot = await mkdtemp("/tmp/Glimpselet-v2-native-record-owned-");
  const home = join(ownedRoot, "home");
  const runtime = join(ownedRoot, "runtime");
  await mkdir(output, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(runtime, { recursive: true });
  await chmod(runtime, 0o700);

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_RUNTIME_DIR: runtime,
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      join(homedir(), ".cache", "ms-playwright"),
    GLIMPSELET_RECORD_HOME: home,
    GLIMPSELET_RECORD_OUTPUT: output,
  };
  let status = 1;
  try {
    const child = spawn(
      "xvfb-run",
      [
        "-a",
        "-s",
        "-screen 0 1440x1000x24 -nolisten tcp",
        "dbus-run-session",
        "--",
        process.execPath,
        script,
        "--worker",
      ],
      { env, stdio: "inherit" },
    );
    status = await new Promise((resolveStatus, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolveStatus(code ?? (signal ? 1 : 0));
      });
    });
  } finally {
    for (const mount of [join(runtime, "doc"), join(runtime, "gvfs")]) {
      spawnSync("fusermount3", ["-uz", mount], { stdio: "ignore" });
    }
    await rm(ownedRoot, { recursive: true, force: true });
  }
  process.exitCode = status;
} else {
  await recordNativeInstall();
}

async function recordNativeInstall() {
  const home = process.env.GLIMPSELET_RECORD_HOME;
  const evidence = process.env.GLIMPSELET_RECORD_OUTPUT;
  assert.ok(home, "Private browser HOME was not set");
  assert.ok(evidence, "Evidence output directory was not set");

  const sourceExtension = join(root, "bin", "extension");
  const stableFolder = join(home, "Glimpselet-extension");
  const profile = join(home, "chrome-profile");
  let context;
  let windowManager;

  const nativeFolderInput = String.raw`
import ctypes
import os
import subprocess
import sys
import time

x11 = ctypes.CDLL("libX11.so.6")
xtest = ctypes.CDLL("libXtst.so.6")
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtest.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

display = x11.XOpenDisplay(None)
assert display, "Cannot connect to the owned X display"

def press_return():
    code = x11.XKeysymToKeycode(display, x11.XStringToKeysym(b"Return"))
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
    x11.XFlush(display)
    time.sleep(0.025)
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)

def click(x, y):
    xtest.XTestFakeMotionEvent(display, -1, x, y, 0)
    xtest.XTestFakeButtonEvent(display, 1, 1, 0)
    xtest.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)

# Navigate Home, then select the visible folder using the actual native UI.
click(int(sys.argv[1]), int(sys.argv[2]))
time.sleep(0.5)
click(int(sys.argv[3]), int(sys.argv[4]))
time.sleep(0.5)
subprocess.run([
    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
    "-f", "x11grab", "-video_size", "1440x1000",
    "-i", os.environ["DISPLAY"], "-frames:v", "1", sys.argv[7],
], check=True)
click(int(sys.argv[5]), int(sys.argv[6]))
time.sleep(0.5)
press_return()
time.sleep(0.5)
press_return()
time.sleep(1.0)
x11.XCloseDisplay(display)
`;

  async function saveBrowserPage(page, name) {
    await page.screenshot({
      path: join(root, "assets", "install", name),
      animations: "disabled",
    });
  }

  function run(command, args, env = process.env) {
    const result = spawnSync(command, args, { encoding: "utf8", env });
    if (result.status !== 0) {
      throw new Error(
        `${command} failed (${result.status}): ${result.stderr || result.stdout}`,
      );
    }
    return result.stdout;
  }

  try {
    const manifest = JSON.parse(
      await readFile(join(sourceExtension, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.name, "Glimpselet");
    assert.equal(manifest.version, releaseVersion);
    await mkdir(join(home, ".glimpselet"), { recursive: true });
    await cp(sourceExtension, stableFolder, { recursive: true });
    assert.ok((await stat(stableFolder)).isDirectory());
    await mkdir(join(root, "assets", "install"), { recursive: true });

    windowManager = spawn(
      "xfwm4",
      ["--compositor=off", "--display", process.env.DISPLAY],
      { stdio: "ignore" },
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: false,
      viewport: null,
      locale: "en-US",
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--lang=en-US",
        "--window-size=1440,1000",
        "--force-device-scale-factor=1",
      ],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("chrome://extensions", { waitUntil: "domcontentloaded" });
    await page.locator("#devMode").waitFor({ state: "visible" });
    await page.waitForTimeout(1000);
    await saveBrowserPage(page, screenshotNames[0]);

    const developerMode = page.locator("#devMode");
    await developerMode.click();
    assert.equal(
      await developerMode.evaluate((toggle) => toggle.checked),
      true,
    );
    const loadUnpacked = page.locator("#loadUnpacked");
    await loadUnpacked.waitFor({ state: "visible" });
    await saveBrowserPage(page, screenshotNames[1]);

    await loadUnpacked.click();
    await page.waitForTimeout(1200);
    const display = process.env.DISPLAY;
    assert.ok(display, "xvfb-run did not provide DISPLAY to the browser");
    const windows = run("xwininfo", ["-root", "-tree"]);
    assert.match(
      windows,
      /Select a folder|Select Folder|Choose a folder|Open File|Select (the )?extension directory/i,
      `No native folder chooser window appeared on ${display}:\n${windows}`,
    );

    const picker = join(root, "assets", "install", screenshotNames[2]);
    const chooserLine = windows
      .split("\n")
      .find((line) => line.includes('"Select the extension directory."'));
    const chooserSize = chooserLine?.match(/(\d+)x(\d+)/);
    const chooserOrigin = chooserLine?.match(/\+(-?\d+)\+(-?\d+)\s*$/);
    assert.ok(
      chooserSize && chooserOrigin,
      `Could not read native chooser geometry:\n${windows}`,
    );
    const chooserWidth = Number(chooserSize[1]);
    const chooserHeight = Number(chooserSize[2]);
    const chooserX = Number(chooserOrigin[1]);
    const chooserY = Number(chooserOrigin[2]);
    const homeX = chooserX + 55;
    const homeY = chooserY + 60;
    const folderX = chooserX + 260;
    const folderY = chooserY + 85;
    const selectX = chooserX + chooserWidth - 48;
    const selectY = chooserY + chooserHeight - 23;
    run("python3", [
      "-c",
      nativeFolderInput,
      String(homeX),
      String(homeY),
      String(folderX),
      String(folderY),
      String(selectX),
      String(selectY),
      picker,
    ]);
    await page.waitForTimeout(1500);
    const postSelectionWindows = run("xwininfo", ["-root", "-tree"]);
    if (/Select (the )?extension directory/i.test(postSelectionWindows)) {
      run("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "x11grab",
        "-video_size",
        "1440x1000",
        "-i",
        display,
        "-frames:v",
        "1",
        join(evidence, "native-after-input.png"),
      ]);
      throw new Error(
        `Native chooser remained open after folder input:\n${postSelectionWindows}`,
      );
    }
    const card = page
      .locator("extensions-item")
      .filter({ hasText: "Glimpselet" });
    await card.waitFor({ state: "visible", timeout: 20000 });
    const name = (await card.locator("#name").innerText()).trim();
    const version = (await card.locator("#version").innerText()).trim();
    assert.equal(name, "Glimpselet");
    assert.equal(version, releaseVersion);

    const loaded = join(evidence, "loaded.png");
    await page.screenshot({ path: loaded, animations: "disabled" });
    for (const screenshot of screenshotNames) {
      await cp(
        join(root, "assets", "install", screenshot),
        join(evidence, screenshot),
      );
    }
    const proof = {
      result: "PASS",
      browser: "Playwright Chromium for Testing, headed",
      display,
      privateHome: home,
      privateProfile: profile,
      developerModeClicked: true,
      loadUnpackedClicked: true,
      nativeFolderChooser: true,
      extensionFolder: stableFolder,
      extensionName: name,
      extensionVersion: version,
      verification: "Installed extension card in chrome://extensions UI",
      screenshots: screenshotNames,
      loadedScreenshot: loaded,
    };
    await writeFile(
      join(evidence, "proof.json"),
      `${JSON.stringify(proof, null, 2)}\n`,
    );

    console.log(
      `PASS: ${name} ${version} installed from the native folder chooser`,
    );
    console.log(`Evidence: ${evidence}`);
    for (const screenshot of screenshotNames) {
      const info = await stat(join(root, "assets", "install", screenshot));
      console.log(`${screenshot}\t${info.size} bytes`);
    }
  } catch (error) {
    if (context) {
      const page = context.pages()[0];
      await page
        ?.screenshot({ path: join(evidence, "failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    await context?.close().catch(() => {});
    if (windowManager && windowManager.exitCode === null) {
      windowManager.kill("SIGTERM");
      await new Promise((resolveExit) =>
        windowManager.once("exit", resolveExit),
      );
    }
  }
}
