import "../../shared/test-env.mjs";
import { _electron as electron, test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { poll } from "../../pick/e2e/support.mjs";
import { percentile, printPdf, startChrome } from "./chrome.mjs";

const HTML = `<h1>Quarterly figures</h1><p>Blink reads the numbers aloud when you ask it to.</p>`;
const DESKTOP = fileURLToPath(new URL("../..", import.meta.url));

/** The real shell, with the test hooks on and no Remote Control session. */
async function launch() {
  const app = await electron.launch({
    args: [DESKTOP, "--no-sandbox"],
    env: {
      ...process.env,
      BLINKLING_E2E: "1",
      BLINKLING_REMOTE: "0",
      BLINKLING_TEST_SESSION: "manual",
    },
  });
  await poll(
    () => app.evaluate(() => Boolean(globalThis.blinklingTest?.locator)),
    20000,
    "the shell's locator",
  );
  return app;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the shell's own locator answers, asked from the main process. */
const ask = (app, name, ...args) =>
  app.evaluate(
    async (_electron, [method, params]) =>
      JSON.parse(
        JSON.stringify(
          (await globalThis.blinklingTest.locator[method](...params)) ?? null,
        ),
      ),
    [name, args],
  );

test("M1 the shell's locator reads a Chrome PDF through the OS and answers hovers within 50 ms", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "locator-shell-")), "doc.pdf");
  await printPdf(HTML, file);
  const { browser, page } = await startChrome();
  const app = await launch();
  try {
    await page.goto(`file://${file}`).catch(() => {});
    await pause(2500);
    const point = { x: 560, y: 380 };
    const window = await poll(
      async () => {
        const w = await ask(app, "windowAt", point);
        return w?.app && /chrome/i.test(w.app) ? w : null;
      },
      10000,
      "windowAt finds Chrome",
    );
    expect(window.private).toBe(false);

    // The first read is in the background; the hover is null until it lands.
    const found = await poll(
      () => ask(app, "locate", point),
      10000,
      "locate answers",
    );
    expect(found.id).toMatch(/^ax:/);
    expect(found.window.id).toBe(window.id);

    // The privacy guard's question, through the shell's wiring.
    const focus = await ask(app, "focus");
    expect(focus.secure).toBe(false);
    expect(focus.window.id).toBe(window.id);

    const stats = await app.evaluate(async () => {
      const { locator } = globalThis.blinklingTest;
      const samples = [];
      let answered = 0;
      for (let i = 0; i < 250; i++) {
        const at = { x: 300 + ((i * 41) % 500), y: 150 + ((i * 59) % 450) };
        const t = performance.now();
        if (await locator.locate(at)) answered++;
        samples.push(performance.now() - t);
        await new Promise((r) => setTimeout(r, 16));
      }
      return { samples, answered };
    });
    const p95 = percentile(stats.samples, 0.95);
    console.log(
      `shell hover p95 ${p95.toFixed(1)} ms, max ${Math.max(...stats.samples).toFixed(1)} ms, ${stats.answered} answered`,
    );
    expect(stats.answered).toBeGreaterThan(stats.samples.length * 0.8);
    expect(p95).toBeLessThanOrEqual(50);
  } finally {
    await app.close();
    await browser.close();
  }
});

test("M1 a window the OS cannot describe is read from its pixels by the shell's capture", async () => {
  // xmessage is a plain X client: no accessibility tree, so only the image source can answer.
  const message = spawn(
    "xmessage",
    [
      "-geometry",
      "400x300+700+200",
      "Quarterly figures\n\nBlink reads the numbers aloud when you ask it to.\nIt never reads a password.\n\nThird line of the message.",
    ],
    { stdio: "ignore" },
  );
  const app = await launch();
  try {
    const point = { x: 780, y: 243 };
    const window = await poll(
      async () => {
        const w = await ask(app, "windowAt", point);
        return w?.app ? w : null;
      },
      10000,
      "windowAt finds xmessage",
    );
    expect(window.app.toLowerCase()).toContain("xmessage");
    const found = await poll(
      () => ask(app, "locate", point),
      10000,
      "locate answers",
    );
    console.log(
      `image answer: ${found.id} kind=${found.kind} bounds=${JSON.stringify(found.bounds)}`,
    );
    expect(found.id).toMatch(/^image:/);
    expect(found.text).toBe("");
    // An element is inside its window and has a size.
    expect(found.bounds.width).toBeGreaterThan(0);
    expect(found.bounds.x).toBeGreaterThanOrEqual(window.bounds.x);
    expect(found.bounds.x + found.bounds.width).toBeLessThanOrEqual(
      window.bounds.x + window.bounds.width + 1,
    );
  } finally {
    await app.close();
    message.kill();
  }
});
