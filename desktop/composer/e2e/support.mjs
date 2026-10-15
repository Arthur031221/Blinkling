import { expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { png } from "./image.mjs";
import { PNG } from "pngjs";
export const report =
  process.env.BLINKLING_REPORT_DIR ??
  fileURLToPath(
    new URL("../../../test-results/conversation-artifacts/", import.meta.url),
  );
export const capture = {
  id: "capture",
  name: "screen.png",
  mediaType: "image/png",
  data: png,
};
export async function launch(scale = 1) {
  const app = await electron.launch({
    args: [
      fileURLToPath(new URL("./fixture.cjs", import.meta.url)),
      "--no-sandbox",
      "--lang=zh-TW", // the specs read the zh-TW strings
      `--force-device-scale-factor=${scale}`,
    ],
    env: {
      ...process.env,
      BLINKLING_REMOTE: process.env.BLINKLING_REMOTE ?? "0",
    },
  });
  const card = await app.firstWindow();
  const errors = [];
  for (const page of await app.windows())
    page.on("pageerror", (e) => errors.push(e.message));
  await expect(card.getByRole("textbox", { name: "輸入問題" })).toBeVisible();
  await expect
    .poll(() => app.evaluate(() => Boolean(globalThis.conversationTest)))
    .toBe(true);
  return { app, card, errors };
}
export async function shot(app, name) {
  await mkdir(report, { recursive: true });
  let bytes;
  // DOM readiness precedes the compositor's first native presentation. Wait
  // for the actual desktop pixel; a missing/opaque underlay still fails.
  await expect
    .poll(async () => {
      const data = await app.evaluate(async ({ desktopCapturer, screen }) => {
        const d = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: Math.round(d.bounds.width * d.scaleFactor),
            height: Math.round(d.bounds.height * d.scaleFactor),
          },
        });
        const w = globalThis.conversationTest.windows.find((w) =>
          w.isVisible(),
        );
        const b = w.getBounds();
        return {
          png: sources[0].thumbnail.toPNG().toString("base64"),
          corner: {
            x: Math.round((b.x + 2) * d.scaleFactor),
            y: Math.round((b.y + 2) * d.scaleFactor),
          },
        };
      });
      bytes = Buffer.from(data.png, "base64");
      const desktop = PNG.sync.read(bytes);
      const offset = (data.corner.y * desktop.width + data.corner.x) * 4;
      return [...desktop.data.subarray(offset, offset + 3)];
    })
    .toEqual([32, 48, 64]);
  await writeFile(`${report}/${name}.png`, bytes);
}
export async function bounds(page) {
  return page.evaluate(() => {
    const errors = [];
    for (const n of document.querySelectorAll(
      ".gl-chat-card,.gl-composer,.gl-composer-toolbar,.gl-quick-asks,.gl-attachment-chip,.gl-answer-bubble,.gl-markdown,.gl-icon-button,.gl-picker",
    )) {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(n).visibility === "hidden")
        continue;
      // Measure the pixels that can paint: long history is deliberately
      // clipped by its scrollport, especially on a 200% desktop.
      const visible = {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      };
      for (
        let parent = n.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (parent === document.body || parent === document.documentElement)
          break;
        const p = parent.getBoundingClientRect();
        if (style.overflowX !== "visible") {
          visible.left = Math.max(visible.left, p.left);
          visible.right = Math.min(visible.right, p.right);
        }
        if (style.overflowY !== "visible") {
          visible.top = Math.max(visible.top, p.top);
          visible.bottom = Math.min(visible.bottom, p.bottom);
        }
      }
      if (
        visible.right > visible.left &&
        visible.bottom > visible.top &&
        (visible.left < 0 ||
          visible.top < 0 ||
          visible.right > innerWidth + 0.5 ||
          visible.bottom > innerHeight + 0.5)
      )
        errors.push({ kind: "window", tag: n.className, rect: r.toJSON() });
      if (
        !n.closest(".gl-chat-history,.gl-bubble-deck") &&
        n.scrollWidth > n.clientWidth + 2
      )
        errors.push({
          kind: "overflow",
          tag: n.className,
          scroll: n.scrollWidth,
          width: n.clientWidth,
        });
    }
    for (const img of document.images)
      if (img.offsetWidth && (!img.complete || !img.naturalWidth))
        errors.push({ kind: "image", src: img.alt });
    return errors;
  });
}
