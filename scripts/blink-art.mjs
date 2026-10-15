// Draws the still Blink art (logo, icons) from the same rig the app uses.
// Run: node scripts/blink-art.mjs   (needs Playwright's Chromium for the PNGs)
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { drawBlink } from "../desktop/character/rig.mjs";

// Blink spans x 0..200 and y 34..199 in rig units, shadow included.
const VIEW = "-6 28 212 178";
const SQUARE = "-4 12 208 208";
const pose = { mouth: "smile", eyes: "open", blush: 1 };

export function blinkSvg({
  label = "Blink, the Blinkling companion",
  view = VIEW,
} = {}) {
  const art = drawBlink(pose, "logo");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-label="${label}">${art}</svg>\n`;
}

const out = process.argv[2];
if (out === undefined) {
  process.stdout.write(blinkSvg());
} else {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/logo.svg`, blinkSvg());
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">${blinkSvg({ view: SQUARE }).replace("<svg ", `<svg width="${size}" height="${size}" `)}</div>`,
    );
    await page.screenshot({
      path: `${out}/blink-${size}.png`,
      omitBackground: true,
    });
  }
  await browser.close();
}
