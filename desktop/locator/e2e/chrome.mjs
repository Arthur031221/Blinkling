import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createLocator } from "../index.mjs";
import { listWindows } from "../../capture/window-list.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export const CHROME = process.env.BLINKLING_CHROME ?? "/usr/bin/google-chrome";
export const SCREEN = { x: 0, y: 0, width: 1280, height: 800 };

/** The extension's own element export, bundled the way the page script is. */
let bundle;
async function exporter() {
  bundle ??= (
    await build({
      entryPoints: [`${root}extension/elements.ts`],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "__blinkling",
      platform: "browser",
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  return bundle;
}

/** A real Google Chrome window with accessibility on, as a user's browser is. */
export async function startChrome({
  x = 120,
  y = 60,
  width = 900,
  height = 680,
} = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: false,
    // Playwright turns extensions off, and the PDF viewer is one of them.
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--no-sandbox",
      "--force-renderer-accessibility",
      "--no-first-run",
      "--no-default-browser-check",
      `--window-position=${x},${y}`,
      `--window-size=${width},${height}`,
    ],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  return { browser, page };
}

/** The companion's answer for a page, built the way the extension builds it: the
 * real element export run in the real page, and the viewport's place on screen. */
export function companionFor(page) {
  return {
    async elements({ point }) {
      // Like the extension: the PDF viewer takes a script but has no structure.
      if (
        (await page.evaluate(() => document.contentType)) === "application/pdf"
      )
        return null;
      const code = await exporter();
      const out = await page.evaluate(
        ({ code, point }) => {
          const frame = {
            screenX:
              window.screenX + (window.outerWidth - window.innerWidth) / 2,
            screenY:
              window.screenY +
              (window.outerHeight - window.innerHeight) -
              (window.outerWidth - window.innerWidth) / 2,
            zoom: 1,
          };
          const run = new Function(`${code}; return __blinkling;`)();
          const page = run.collectElements(document, {
            near: point && {
              x: point.x - frame.screenX,
              y: point.y - frame.screenY,
            },
          });
          return { frame, page };
        },
        { code, point },
      );
      return {
        frame: out.frame,
        elements: out.page.elements,
        ...(out.page.selection ? { selection: out.page.selection } : {}),
      };
    },
  };
}

/** The real locator over the real window list and real Chrome. */
export function realLocator({ companion, capture } = {}) {
  return createLocator({
    companion,
    capture,
    platform: "linux",
    list: () => listWindows(),
    displays: () => [{ id: 1, scaleFactor: 1, bounds: SCREEN }],
  });
}

export const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** A PDF of `html`, printed by Chrome itself. */
export async function printPdf(html, file) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.pdf({ path: file });
  } finally {
    await browser.close();
  }
}
