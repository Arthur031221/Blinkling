import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const out = resolve(process.argv[2] ?? "assets/screenshots/demo.png");
const port = 5188;
const origin = `http://127.0.0.1:${port}`;
const vite = resolve("node_modules/vite/bin/vite.js");

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

await mkdir(dirname(out), { recursive: true });
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
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  page.setDefaultTimeout(10000);
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Vite exited before startup");
    try {
      const response = await page.goto(`${origin}/?demo=1`, {
        waitUntil: "domcontentloaded",
        timeout: 1000,
      });
      if (response?.ok()) {
        ready = true;
        break;
      }
    } catch {
      await delay(250);
    }
  }
  if (!ready) throw new Error("Vite did not start on port 5188");

  await page
    .getByRole("textbox")
    .fill("Which control saves these preferences?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .locator(".answer .markdown")
    .getByText(/This prerecorded answer makes no provider call/)
    .waitFor();
  await page.screenshot({ path: out, fullPage: true });
  console.log(`Captured labeled fixture demo at ${out}.`);
} finally {
  await browser?.close();
  await stop(server);
}
