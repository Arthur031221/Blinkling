import { execFileSync } from "node:child_process";
import "../../shared/test-env.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startChrome,
  companionFor,
  realLocator,
  printPdf,
  percentile,
} from "./chrome.mjs";

const OUT = process.env.LOCATOR_SHOTS ?? "/tmp/locator-e2e";
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const HTML = `<h1>Quarterly figures</h1><p>Blink reads the numbers aloud when you ask it to. It never reads a password.</p>`;

test("M1 a hover over Chrome's own PDF viewer answers within 50 ms at p95", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "locator-pdf-")), "doc.pdf");
  await printPdf(HTML, file);
  const { browser, page } = await startChrome();
  try {
    await page.goto(`file://${file}`).catch(() => {});
    await pause(2500);
    const locator = realLocator({ companion: companionFor(page) });
    const point = { x: 560, y: 380 };
    const window = await locator.windowAt(point);
    expect(window?.app).toMatch(/chrome/i);
    // The viewer has no DOM for the companion; what answers is the next source.
    let found = null;
    for (let i = 0; i < 60 && !found; i++) {
      found = await locator.locate(point);
      if (!found) await pause(100);
    }
    console.log(
      `pdf answer: ${found?.id} kind=${found?.kind} role=${found?.role} bounds=${JSON.stringify(found?.bounds)}`,
    );
    expect(found).not.toBeNull();
    expect(found.id.startsWith("dom:")).toBe(false);
    // The whole screen, with the answer outlined, for a human to look at.
    const b = found.bounds;
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-video_size",
      "1280x800",
      "-i",
      process.env.DISPLAY,
      "-frames:v",
      "1",
      "-vf",
      `drawbox=x=${b.x}:y=${b.y}:w=${b.width}:h=${b.height}:color=red:t=3`,
      join(OUT, "pdf-located.png"),
    ]);

    const samples = [];
    let answered = 0;
    for (let i = 0; i < 250; i++) {
      const at = { x: 300 + ((i * 41) % 500), y: 150 + ((i * 59) % 450) };
      const t = performance.now();
      if (await locator.locate(at)) answered++;
      samples.push(performance.now() - t);
      await pause(16);
    }
    const p95 = percentile(samples, 0.95);
    console.log(
      `pdf hover p95 ${p95.toFixed(1)} ms, max ${Math.max(...samples).toFixed(1)} ms, ${answered} answered`,
    );
    expect(answered).toBeGreaterThan(samples.length * 0.8);
    expect(p95).toBeLessThanOrEqual(50);
  } finally {
    await browser.close();
  }
});
