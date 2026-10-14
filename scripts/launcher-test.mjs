import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const directory = await mkdtemp(join(tmpdir(), "blinkling-launcher-"));
let child;
try {
  // A copy outside the checkout proves the packaged launcher can bootstrap.
  const launcher = join(directory, "launch-browser.mjs");
  await copyFile(resolve("scripts/launch-browser.mjs"), launcher);
  const env = {
    ...process.env,
    BLINKLING_RUNTIME_DIR: join(directory, "runtime"),
    BLINKLING_PROFILE_DIR: join(directory, "profile"),
    BLINKLING_EXTENSION_DIR: resolve("dist-extension"),
    BLINKLING_CHROMIUM_PATH: chromium.executablePath(),
    BLINKLING_TRIAL_URL:
      "data:text/html,<title>Blinkling%20pairing%20guide</title>",
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
    if (output.includes("Blinkling is running in a dedicated Chromium profile"))
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
  assert.match(output, /Opened the setup guide at data:text\/html/);
  assert.match(output, /Blinkling extension loaded\./);
  child.kill("SIGTERM");
  const [code, signal] = await exited;
  assert.equal(signal, null);
  assert.equal(code, 143);
  child = spawn(process.execPath, [launcher], {
    env: { ...env, BLINKLING_TRIAL_URL: "http://127.0.0.1:1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const failed = once(child, "exit");
  let failureOutput = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      failureOutput = (failureOutput + data).slice(-4000);
    });
  let failureTimer;
  try {
    const [failureCode, failureSignal] = await Promise.race([
      failed,
      new Promise((_, reject) => {
        failureTimer = setTimeout(
          () => reject(new Error("Failed startup left the browser running")),
          30_000,
        );
      }),
    ]);
    assert.equal(failureCode, 1);
    assert.equal(failureSignal, null);
    assert.match(failureOutput, /Could not open BLINKLING_TRIAL_URL/);
    assert.match(failureOutput, /Blinkling extension loaded\./);
    assert.doesNotMatch(failureOutput, /Installing Playwright/);
  } finally {
    clearTimeout(failureTimer);
  }
  console.log(
    "PASS: packaged launcher bootstrapped, loaded the extension, reused its runtime and closed after SIGTERM and failed startup",
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
