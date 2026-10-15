import { test, expect } from "@playwright/test";
import { execFileSync } from "../../main/e2e/exec.mjs";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { launch, native, report } from "./support.mjs";
test("real RandR outputs: drag between displays, save both positions, remove and restore display", async () => {
  const { app, page, data } = await launch();
  const reveal = async () => {
    const state = await page.evaluate(() => window.desktop.inspect());
    const body = await page.locator('rect[fill="#3ddc97"]').boundingBox();
    const area = state.shell.workArea;
    native([
      {
        type: "move",
        x:
          area.x +
          Math.max(8, Math.min(area.width - 8, body.x + body.width * 0.35)),
        y: Math.max(8, Math.min(area.height - 8, body.y + body.height * 0.72)),
      },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(650);
    return page.evaluate(() => window.desktop.inspect());
  };
  try {
    await expect
      .poll(() => app.evaluate(({ screen }) => screen.getAllDisplays().length))
      .toBe(2);
    const displays = await app.evaluate(({ screen }) =>
      screen.getAllDisplays(),
    );
    expect(displays).toHaveLength(2);
    await app.evaluate(async ({ BrowserWindow, screen }) => {
      for (const d of screen.getAllDisplays()) {
        const bg = new BrowserWindow({
          ...d.bounds,
          frame: false,
          backgroundColor: d.bounds.x ? "#613a56" : "#204080",
          show: false,
        });
        await bg.loadURL(
          "data:text/html," +
            encodeURIComponent(
              `<body style="margin:0;background:${d.bounds.x ? "#613a56" : "#204080"};color:white;font:24px sans-serif"><div style="padding:40px">Display ${d.bounds.x ? "2" : "1"}</div>`,
            ),
        );
        bg.show();
      }
    });
    let s = await reveal();
    native([
      {
        type: "move",
        x: s.shell.workArea.x + s.anchor.x - 18,
        y: s.anchor.y + 10,
      },
      { type: "down" },
      { type: "move", x: 2350, y: 600, wait: 0.25 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native([{ type: "up" }]);
    await page.waitForTimeout(800);
    s = await page.evaluate(() => window.desktop.inspect());
    expect(s.shell.workArea.x).toBe(1280);
    const secondId = s.shell.displayId;
    const pixels = await app.evaluate(async ({ desktopCapturer }) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 800 },
      });
      return sources.map((s) => ({
        id: s.display_id,
        data: s.thumbnail.toPNG().toString("base64"),
      }));
    });
    for (const image of pixels)
      await writeFile(
        join(report, `dual-display-${image.id}.png`),
        Buffer.from(image.data, "base64"),
      );
    s = await reveal();
    native([
      { type: "move", x: 1280 + s.anchor.x - 18, y: s.anchor.y + 10 },
      { type: "down" },
      { type: "move", x: 160, y: 370, wait: 0.25 },
      { type: "up" },
    ]);
    await page.waitForTimeout(800);
    s = await page.evaluate(() => window.desktop.inspect());
    expect(s.shell.workArea.x).toBe(0);
    const positions = JSON.parse(
      await readFile(join(data, "blink-positions.json"), "utf8"),
    ).positions;
    expect(Object.keys(positions)).toHaveLength(2);
    s = await reveal();
    native([
      { type: "move", x: s.anchor.x - 18, y: s.anchor.y + 10 },
      { type: "down" },
      { type: "move", x: 2400, y: 620, wait: 0.25 },
      { type: "up" },
    ]);
    await page.waitForTimeout(800);
    expect(
      (await page.evaluate(() => window.desktop.inspect().shell)).displayId,
    ).toBe(secondId);
    execFileSync("xrandr", ["--output", "DUMMY1", "--off"]);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.desktop.inspect().shell)).workArea
            .x,
      )
      .toBe(0);
    execFileSync("xrandr", [
      "--output",
      "DUMMY1",
      "--mode",
      "1280x800",
      "--right-of",
      "DUMMY0",
    ]);
    await expect
      .poll(() => app.evaluate(({ screen }) => screen.getAllDisplays().length))
      .toBe(2);
    const current = await page.evaluate(() => window.desktop.inspect());
    expect(current.shell.edge).toBe(positions[current.shell.displayId].edge);
    await writeFile(
      join(report, "multi-displays.json"),
      JSON.stringify({ displays, positions, restored: current.shell }, null, 2),
    );
  } finally {
    await app.close();
  }
});
