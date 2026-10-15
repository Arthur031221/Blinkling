import "../../shared/test-env.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startChrome,
  companionFor,
  realLocator,
  percentile,
} from "./chrome.mjs";

const OUT = process.env.LOCATOR_SHOTS ?? "/tmp/locator-e2e";
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><meta charset="utf-8"><title>Locator page</title>
<style>body{margin:0;font:16px/1.5 sans-serif}main{padding:24px 40px}
img{display:block;width:300px;height:120px}table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 10px}</style>
<main>
<h1>Quarterly figures</h1>
<p>Blink reads the numbers aloud when you ask it to. It never reads a password. The third sentence closes the paragraph.</p>
<img alt="Revenue chart" src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120'%3E%3Crect width='300' height='120' fill='%234a90a4'/%3E%3C/svg%3E">
<table><tr><th>Region</th><th>Total</th></tr><tr><td>North</td><td>42</td></tr><tr><td>South</td><td>17</td></tr></table>
<pre>const total = north + south;</pre>
<p><button>Save</button> <input aria-label="Name" value="Ada"> <input type="password" aria-label="Secret" value="hunter2"></p>
</main>`;

async function open(html) {
  const { browser, page } = await startChrome();
  const file = join(mkdtempSync(join(tmpdir(), "locator-e2e-")), "page.html");
  writeFileSync(file, html);
  await page.goto(`file://${file}`);
  await pause(800);
  return { browser, page };
}

/** The element's centre in screen DIP, from the page's own layout. */
async function centre(page, selector) {
  return page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return {
      x:
        window.screenX +
        (window.outerWidth - window.innerWidth) / 2 +
        r.left +
        r.width / 2,
      y:
        window.screenY +
        (window.outerHeight - window.innerHeight) -
        (window.outerWidth - window.innerWidth) / 2 +
        r.top +
        r.height / 2,
    };
  }, selector);
}

test("M1 a hover on a real Chrome page names what is under the pointer, p95 within 50 ms", async () => {
  const { browser, page } = await open(PAGE);
  try {
    const companion = companionFor(page);
    let reads = 0;
    const counted = {
      elements: (request) => (reads++, companion.elements(request)),
    };
    const locator = realLocator({ companion: counted });
    const heading = await centre(page, "h1");
    // The first look may take its time; everything after it is a hover.
    const cold = Date.now();
    let first = null;
    for (let i = 0; i < 40 && !first; i++) {
      first = await locator.locate(heading);
      if (!first) await pause(50);
    }
    console.log(`first answer after ${Date.now() - cold} ms`);
    expect(first?.kind).toBe("heading");
    expect(first.text).toBe("Quarterly figures");

    const targets = {
      heading: ["h1", "heading"],
      paragraph: ["p", "paragraph"],
      image: ["img", "image"],
      table: ["table", "table"],
      code: ["pre", "code"],
      button: ["button", "button"],
    };
    const found_ = [];
    for (const [name, [selector, kind]] of Object.entries(targets)) {
      const found = await locator.locate(await centre(page, selector));
      found_.push(found);
      expect(found?.kind, name).toMatch(
        new RegExp(name === "table" ? "table|cell" : kind),
      );
    }

    // The rectangles the locator reported, drawn on the page they describe.
    await page.evaluate(
      ({ boxes, origin }) => {
        for (const b of boxes) {
          const d = document.createElement("div");
          d.textContent = `${b.kind}`;
          d.style.cssText = `position:fixed;z-index:9;outline:2px solid #e0245e;font:11px monospace;color:#e0245e;left:${b.x - origin.x}px;top:${b.y - origin.y}px;width:${b.width}px;height:${b.height}px`;
          document.body.append(d);
        }
      },
      {
        boxes: found_.map((e) => ({ ...e.bounds, kind: e.kind })),
        origin: await page.evaluate(() => ({
          x: window.screenX + (window.outerWidth - window.innerWidth) / 2,
          y:
            window.screenY +
            (window.outerHeight - window.innerHeight) -
            (window.outerWidth - window.innerWidth) / 2,
        })),
      },
    );
    await page.screenshot({ path: `${OUT}/page-located.png` });

    // A pointer that keeps moving for a few seconds, the cache expiring and
    // re-reading in the background all the while.
    const samples = [];
    const readsBefore = reads;
    let answered = 0;
    const area = await page.evaluate(() =>
      document.querySelector("main").getBoundingClientRect().toJSON(),
    );
    const origin = await centre(page, "main");
    for (let i = 0; i < 250; i++) {
      const point = {
        x: origin.x + ((i * 37) % 600) - 300,
        y:
          origin.y +
          ((i * 53) % Math.max(200, area.height - 40)) -
          area.height / 2 +
          20,
      };
      const t = performance.now();
      if (await locator.locate(point)) answered++;
      samples.push(performance.now() - t);
      await pause(16);
    }
    const p95 = percentile(samples, 0.95);
    console.log(
      `page hover p95 ${p95.toFixed(1)} ms, max ${Math.max(...samples).toFixed(1)} ms over ${samples.length}`,
    );
    console.log(
      `${answered} answered, ${reads - readsBefore} background reads`,
    );
    expect(answered).toBeGreaterThan(samples.length * 0.8);
    // The cache really did expire and read again while the pointer moved.
    expect(reads - readsBefore).toBeGreaterThan(3);
    expect(p95).toBeLessThanOrEqual(50);
  } finally {
    await browser.close();
  }
});

test("M1 a secure field is never returned and never read, in a real Chrome page", async () => {
  const { browser, page } = await open(PAGE);
  try {
    const locator = realLocator({ companion: companionFor(page) });
    const secret = await centre(page, 'input[type="password"]');
    let found = null;
    for (let i = 0; i < 40 && !found; i++) {
      found = await locator.locate(secret);
      if (!found) await pause(50);
    }
    expect(found.secure).toBe(true);
    expect(found.text).toBe("");
    expect(found.name).toBe("");
    expect(found.content).toBeUndefined();

    const body = await page.evaluate(() => {
      const r = document.querySelector("main").getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    const origin = await centre(page, "main");
    const rect = {
      x: origin.x - body.w / 2,
      y: origin.y - body.h / 2,
      width: body.w,
      height: body.h,
    };
    const text = await locator.textIn(rect);
    expect(text).toContain("Quarterly figures");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("Secret");

    const snapped = await locator.snap({
      x: secret.x - 30,
      y: secret.y - 8,
      width: 60,
      height: 16,
    });
    expect(snapped.element?.secure).not.toBe(true);

    const front = await locator.focus();
    expect(front.secure).toBe(true);
  } finally {
    await browser.close();
  }
});
