import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-180 -410 360 450" role="img" aria-label="Blink, the Blinkling companion"></svg>',
  );
  await page.addScriptTag({ path: "public/assets/blink.js" });
  const logo = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    window.Blink.create(svg, { x: 0, y: 0, scale: 1 });
    return svg.outerHTML;
  });
  await writeFile("assets/logo.svg", logo + "\n");
  await writeFile("public/assets/logo.svg", logo + "\n");
  console.log("Rendered the original Blink rig as the project mark.");
} finally {
  await browser.close();
}
