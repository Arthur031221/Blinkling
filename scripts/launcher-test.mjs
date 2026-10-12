import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const directory = await mkdtemp(join(tmpdir(), "glimpselet-launcher-"));
let child;
try {
  // A copy outside the checkout proves the packaged launcher can bootstrap.
  const launcher = join(directory, "launch-browser.mjs");
  await copyFile(resolve("scripts/launch-browser.mjs"), launcher);
  const env = {
    ...process.env,
    GLIMPSELET_RUNTIME_DIR: join(directory, "runtime"),
    GLIMPSELET_PROFILE_DIR: join(directory, "profile"),
    GLIMPSELET_EXTENSION_DIR: resolve("dist-extension"),
    GLIMPSELET_CHROMIUM_PATH: chromium.executablePath(),
  };
  delete env.SSH_CONNECTION;
  child = spawn(process.execPath, [launcher], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let output = "";
  let ready;
  const started = new Promise((resolveReady) => {
    ready = resolveReady;
  });
  child.stdout.on("data", (data) => {
    output = (output + data).slice(-4000);
    if (
      output.includes("Glimpselet is running in a dedicated Chromium profile")
    )
      ready();
  });
  child.stderr.on("data", (data) => {
    output = (output + data).slice(-4000);
  });
  let timer;
  try {
    await Promise.race([
      started,
      exited.then(([code]) => {
        throw new Error(`Launcher exited ${code}: ${output}`);
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Launcher timed out: ${output}`)),
          90_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  assert.match(output, /Installing Playwright/);
  child.kill("SIGTERM");
  const [code, signal] = await exited;
  assert.equal(signal, null);
  assert.equal(code, 143);
  console.log(
    "PASS: packaged launcher bootstrapped, opened Chromium with the extension, and closed on SIGTERM",
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
