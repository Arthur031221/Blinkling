import { test, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PNG } from "pngjs";
import {
  report,
  native,
  launch,
  desktopShot,
  pixel,
  rigPoint,
  moveOn,
  background,
  activeWindow,
} from "./support.mjs";
test("real alpha, silhouette click-through, hover wave, delayed retreat and fullscreen focus", async () => {
  const c = await launch();
  const { app, page } = c;
  try {
    await background(app, true);
    native(30, 30, "click");
    await page.waitForTimeout(650);
    const p = await rigPoint(page),
      idle = await desktopShot(app, "idle-alpha-desktop");
    expect(pixel(idle, 5, 5)).toEqual([32, 64, 128]);
    [44, 126, 137].forEach((v, i) =>
      expect(Math.abs(pixel(idle, p.x, p.y)[i] - v)).toBeLessThanOrEqual(3),
    );
    const box = await page.locator("#blink").boundingBox();
    expect(box.x + box.width / 2).toBeCloseTo(1280, 0);
    await moveOn(page);
    await desktopShot(app, "hover-wave-desktop");
    const poses = await page.evaluate(async () => {
      const { desktop } = await import("./index.mjs");
      return new Promise((resolve) => {
        const samples = [],
          start = performance.now();
        function frame(now) {
          const c = desktop.character;
          samples.push({
            y: c.body.getBoundingClientRect().y,
            blink: c.eyes.sy,
            wave: c.arms.R.shoulder.r,
            look: c.eyes.node.querySelector("g").getAttribute("transform"),
          });
          if (now - start < 4900) requestAnimationFrame(frame);
          else resolve(samples);
        }
        requestAnimationFrame(frame);
      });
    });
    expect(
      Math.max(...poses.map((p) => p.y)) - Math.min(...poses.map((p) => p.y)),
    ).toBeGreaterThan(0.8);
    expect(Math.min(...poses.map((p) => p.blink))).toBeLessThan(0.2);
    expect(
      Math.max(...poses.map((p) => p.wave)) -
        Math.min(...poses.map((p) => p.wave)),
    ).toBeGreaterThan(90);
    expect(new Set(poses.map((p) => p.look)).size).toBeGreaterThan(20);
    await writeFile(
      join(report, "character-motion.json"),
      JSON.stringify(poses, null, 2),
    );
    expect(
      await app.evaluate(() => globalThis.shellBackground.isFocused()),
    ).toBe(true);
    const opaque = await rigPoint(page),
      hover = await desktopShot(app, "hover-opaque-desktop");
    expect(pixel(hover, opaque.x, opaque.y)).toEqual([61, 220, 151]);
    // A native click in empty pixels of Blink's rectangular SVG must pass through.
    const blank = await page.evaluate(() => {
      const b = document.querySelector("#blink").getBoundingClientRect();
      return { x: b.x + 3, y: b.y + 3 };
    });
    native(blank.x, blank.y, "click");
    expect(
      await app.evaluate(() =>
        globalThis.shellBackground.webContents.executeJavaScript(
          "clicks.at(-1)",
        ),
      ),
    ).toEqual([Math.round(blank.x), Math.round(blank.y)]);
    await moveOn(page);
    native(30, 30);
    await page.waitForTimeout(1000);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 1200,
    });
    await page.waitForTimeout(450);
    await desktopShot(app, "retreated-desktop");
    const metrics = await page.evaluate(async () => {
      const m = await import("./index.mjs");
      return m.desktop.metrics();
    });
    const ordered = metrics.work.sort((a, b) => a - b),
      frames = metrics.frames.sort((a, b) => a - b);
    const measurement = {
      frames: frames.length,
      frameP50: frames[Math.floor(frames.length * 0.5)],
      frameP95: frames[Math.floor(frames.length * 0.95)],
      workP95: ordered[Math.floor(ordered.length * 0.95)],
    };
    await writeFile(
      join(report, "frame-budget.json"),
      JSON.stringify(measurement, null, 2),
    );
    expect(measurement.frames).toBeGreaterThan(120);
    expect(measurement.workP95).toBeLessThan(16.67);
    expect(measurement.frameP95).toBeLessThan(20);
  } finally {
    await c.close();
  }
});

test("native drag squishes, snaps and persists; pinned chat focus is intentional and restored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blink-persist-"));
  let c = await launch(1, "light", directory);
  try {
    await background(c.app);
    await moveOn(c.page);
    const p = await rigPoint(c.page);
    native(p.x, p.y, "down");
    native(p.x - 50, p.y - 20);
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native(38, 480);
    await c.page.waitForTimeout(200);
    expect(
      (await c.app.evaluate(() => globalThis.blinklingTest.snapshot())).drag.x,
    ).toBeLessThan(160);
    await expect
      .poll(() =>
        c.page.evaluate(async () => {
          const { desktop } = await import("./index.mjs");
          const r = document.querySelector("#blink").getBoundingClientRect();
          return Math.hypot(
            r.x + 74 - desktop.shell.drag.x,
            r.y + 142 - desktop.shell.drag.y,
          );
        }),
      )
      .toBeLessThan(1);
    const held = await c.page.evaluate(async () => {
      const { desktop } = await import("./index.mjs");
      const matrix = desktop.character.body.parentElement.getScreenCTM(),
        tongue = document.querySelector('path[fill="#ff8fb1"]'),
        point = new DOMPoint(0, 79).matrixTransform(tongue.getScreenCTM());
      return {
        ratio: Math.hypot(matrix.a, matrix.b) / Math.hypot(matrix.c, matrix.d),
        tongue: { x: point.x, y: point.y },
      };
    });
    expect(held.ratio).toBeCloseTo(0.88 / 1.12, 2);
    const heldImage = await desktopShot(c.app, "drag-desktop");
    expect(pixel(heldImage, held.tongue.x, held.tongue.y)).toEqual([
      255, 143, 177,
    ]);
    await c.page.evaluate(() => {
      window.dropSamples = [];
      const started = performance.now();
      function frame(now) {
        const matrix = document
          .querySelector('rect[fill="#3ddc97"]')
          .parentElement.parentElement.getScreenCTM();
        window.dropSamples.push({
          time: now - started,
          mode: document.querySelector("#blink").dataset.mode,
          ratio:
            Math.hypot(matrix.a, matrix.b) / Math.hypot(matrix.c, matrix.d),
        });
        if (now - started < 800) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    native(38, 480, "up");
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "drop");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
      )
      .toBe("left");
    await c.page.waitForTimeout(850);
    const dropSamples = await c.page.evaluate(() => window.dropSamples),
      bounce = dropSamples.filter((s) => s.mode === "drop");
    expect(bounce.length).toBeGreaterThan(15);
    expect(Math.max(...bounce.map((s) => s.ratio))).toBeGreaterThan(1.1);
    expect(Math.min(...bounce.map((s) => s.ratio))).toBeLessThan(0.98);
    expect(Math.abs(dropSamples.at(-1).ratio - 1)).toBeLessThan(0.025);
    await writeFile(
      join(report, "drop-motion.json"),
      JSON.stringify(dropSamples, null, 2),
    );
    await desktopShot(c.app, "drop-left-desktop");
    const saved = await c.app.evaluate(
      () => globalThis.blinklingTest.snapshot().position,
    );
    await c.app.close();
    c = await launch(1, "light", directory);
    expect(
      await c.app.evaluate(
        () => globalThis.blinklingTest.snapshot().position.edge,
      ),
    ).toBe(saved.edge);
    expect(
      await c.app.evaluate(
        () => globalThis.blinklingTest.snapshot().position.ratio,
      ),
    ).toBeCloseTo(saved.ratio, 6);
    await background(c.app);
    await moveOn(c.page);
    await c.page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: true }),
    );
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.snapshot().pinned),
      )
      .toBe(true);
    native(30, 30);
    await c.page.waitForTimeout(1900);
    expect(
      await c.app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
    ).toBe(true);
    expect(
      await c.app.evaluate(() => globalThis.shellBackground.isFocused()),
    ).toBe(true);
    const chat = c.app.windows().find((p) => p.url().includes("surface=card"));
    const inputBox = await chat.locator(".gl-input").boundingBox();
    const cardBox = await c.app.evaluate(() =>
      globalThis.blinklingTest.composer.getBounds(),
    );
    native(cardBox.x + inputBox.x + 20, cardBox.y + inputBox.y + 20, "click");
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
      )
      .toBe(true);
    await desktopShot(c.app, "pinned-card-desktop");
    await chat.getByRole("button", { name: "收起對話" }).click();
    await expect
      .poll(() => c.app.evaluate(() => globalThis.shellBackground.isFocused()))
      .toBe(true);
    expect(
      await c.app.evaluate(() => globalThis.blinklingTest.snapshot().pinned),
    ).toBe(false);
    await c.page.evaluate(() => window.blinkling.action("chat"));
    const chat2 = c.app.windows().find((p) => p.url().includes("surface=card"));
    await expect(chat2.locator(".gl-input")).toBeFocused();
    const pointer = native(800, 200, "click");
    await c.page.waitForTimeout(2100);
    await desktopShot(c.app, "outside-card-click");
    await writeFile(
      join(report, "focus-close-state.json"),
      JSON.stringify(
        {
          pointer,
          shell: await c.app.evaluate(async ({ BrowserWindow }) => ({
            ...globalThis.blinklingTest.snapshot(),
            focused: globalThis.blinklingTest.composer.isFocused(),
            background: globalThis.shellBackground.isFocused(),
            bounds: globalThis.shellBackground.getBounds(),
            clicks:
              await globalThis.shellBackground.webContents.executeJavaScript(
                "clicks",
              ),
            windows: BrowserWindow.getAllWindows().map((w) => ({
              id: w.id,
              native: w.getNativeWindowHandle().readUInt32LE(),
              bounds: w.getBounds(),
              focus: w.isFocused(),
            })),
          })),
          renderer: await c.page.evaluate(async () => {
            const { desktop } = await import("./index.mjs");
            return { ...desktop.state };
          }),
        },
        null,
        2,
      ),
    );
    await expect
      .poll(
        () =>
          c.app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
        { timeout: 4000 },
      )
      .toBe(false);
    await expect
      .poll(() => c.app.evaluate(() => globalThis.shellBackground.isFocused()))
      .toBe(true);
  } finally {
    await c.app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closing an intentional chat restores a separate application's native focus", async () => {
  const c = await launch();
  const probe = spawn(
    "xmessage",
    [
      "-title",
      "External focus probe",
      "-geometry",
      "360x160+120+120",
      "-buttons",
      "Close:0",
      "Working in another application",
    ],
    { stdio: "ignore" },
  );
  const spawned = once(probe, "spawn");
  const progress = (stage) =>
    writeFile(join(report, "external-focus-stage.txt"), stage);
  try {
    await progress("waiting for external application");
    await spawned;
    await expect.poll(activeWindow).toBeGreaterThan(1);
    native(240, 180, "click");
    const external = activeWindow();
    expect(
      await c.app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getFocusedWindow() === null,
      ),
    ).toBe(true);
    await progress("hovering Blink without focus");
    await moveOn(c.page);
    expect(activeWindow()).toBe(external);
    await progress("opening the composer with a click on Blink");
    const blinkAt = await rigPoint(c.page);
    native(blinkAt.x, blinkAt.y, "click");
    await expect
      .poll(() =>
        c.app.evaluate(() => !!globalThis.blinklingTest.composer?.isVisible()),
      )
      .toBe(true);
    const chat = c.app.windows().find((p) => p.url().includes("surface=card"));
    await expect(chat.locator(".gl-input")).toBeFocused();
    await expect.poll(activeWindow).not.toBe(external);
    const close = await chat
        .getByRole("button", { name: "收起" })
        .boundingBox(),
      card = await c.app.evaluate(() =>
        globalThis.blinklingTest.composer.getBounds(),
      );
    native(
      card.x + close.x + close.width / 2,
      card.y + close.y + close.height / 2,
      "click",
    );
    await progress("restoring external focus");
    await expect.poll(activeWindow).toBe(external);
    await expect
      .poll(() =>
        c.app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
      )
      .toBe(false);
    await progress("waiting for settled peek");
    await expect(c.page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    await c.page.waitForTimeout(450);
    expect(activeWindow()).toBe(external);
    await progress("capturing restored desktop");
    await desktopShot(c.app, "external-focus-restored");
    await writeFile(
      join(report, "external-focus.json"),
      JSON.stringify(
        { external, restored: activeWindow(), process: probe.pid },
        null,
        2,
      ),
    );
  } finally {
    await progress("closing external application");
    if (probe.exitCode === null && probe.signalCode === null) {
      const exited = once(probe, "exit");
      probe.kill();
      await exited;
    }
    await progress("closing Blink");
    await c.close();
    await progress("finished");
  }
});

test("native menu routing and measured stagger/reverse motion", async () => {
  const c = await launch();
  try {
    await background(c.app);
    native(20, 20);
    await c.page.evaluate(() => {
      window.fanSamples = [];
      window.sampleFan = () => {
        const started = performance.now();
        function frame(now) {
          window.fanSamples.push({
            time: now - started,
            opacity: [...document.querySelectorAll(".action-bubble")].map(
              (b) => +b.style.opacity,
            ),
          });
          if (now - started < 2400) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      };
      window.sampleFan();
    });
    await moveOn(c.page);
    await c.page.waitForTimeout(1900);
    const opened = await c.page.evaluate(() => window.fanSamples);
    const firstAbove = Array.from(
      { length: 4 },
      (_, i) => opened.find((s) => s.opacity[i] > 0.2)?.time,
    );
    expect(firstAbove.every(Number.isFinite)).toBe(true);
    for (let i = 1; i < 4; i++)
      expect(firstAbove[i] - firstAbove[i - 1]).toBeGreaterThan(15);
    await c.page.evaluate(() => {
      window.fanSamples = [];
      window.sampleFan();
    });
    native(20, 20);
    await c.page.waitForTimeout(2400);
    const closed = await c.page.evaluate(() => window.fanSamples);
    const firstBelow = Array.from(
      { length: 4 },
      (_, i) => closed.find((s) => s.opacity[i] < 0.8)?.time,
    );
    for (let i = 1; i < 4; i++)
      expect(firstBelow[i - 1] - firstBelow[i]).toBeGreaterThan(15);
    await writeFile(
      join(report, "fan-motion.json"),
      JSON.stringify({ firstAbove, firstBelow }, null, 2),
    );
    await c.app.evaluate(() => {
      globalThis.menuCalls = [];
      for (const action of ["region", "guide", "auto-explain"]) {
        globalThis.blinklingTest.registerAction(action, async (context) => {
          globalThis.menuCalls.push({
            action,
            display: String(context.display.id),
            owned: context.windows.length,
            enabled: context.enabled,
          });
        });
      }
    });
    for (const action of ["capture", "guide", "auto-explain", "auto-explain"]) {
      await moveOn(c.page);
      const b = c.page.locator(`[data-action="${action}"]`),
        r = await b.boundingBox();
      native(r.x + r.width / 2, r.y + r.height / 2, "click");
      await c.page.waitForTimeout(100);
    }
    const calls = await c.app.evaluate(() => globalThis.menuCalls);
    expect(calls.map((c) => c.action)).toEqual([
      "region",
      "guide",
      "auto-explain",
      "auto-explain",
    ]);
    expect(calls.every((c) => c.owned > 0 && c.display)).toBe(true);
    expect(calls.slice(-2).map((c) => c.enabled)).toEqual([true, false]);
    await expect(
      c.page.locator('[data-action="auto-explain"]'),
    ).toHaveAttribute("aria-checked", "false");
    for (const action of ["settings"]) {
      await moveOn(c.page);
      const r = await c.page.locator(`[data-action="${action}"]`).boundingBox();
      native(r.x + r.width / 2, r.y + r.height / 2, "click");
      await expect
        .poll(() =>
          c.app.evaluate(
            () => !!globalThis.blinklingTest.composer?.isVisible(),
          ),
        )
        .toBe(true);
      const chat = c.app
        .windows()
        .find((p) => p.url().includes("surface=card"));
      await expect(chat.locator(".gl-input")).toBeFocused();
      if (action === "settings" || action === "help")
        await expect(chat.locator(".gl-notice")).not.toBeEmpty();
      if (action === "screen")
        await expect(chat.locator(".gl-attachment-chip img")).toHaveCount(1);
      await chat.keyboard.press("Escape");
      await expect
        .poll(() =>
          c.app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
        )
        .toBe(false);
    }
    await writeFile(
      join(report, "menu-routing.json"),
      JSON.stringify(calls, null, 2),
    );
  } finally {
    await c.close();
  }
});

for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`four real Electron menu pills, ${scale * 100}% ${theme}`, async () => {
      const c = await launch(scale, theme);
      try {
        await background(c.app);
        native(20, 20);
        await moveOn(c.page, scale);
        const buttons = c.page.locator(".action-bubble");
        await expect(buttons).toHaveCount(4);
        await desktopShot(c.app, `menu-${scale * 100}-${theme}`);
        for (let i = 0; i < 4; i++) {
          const b = buttons.nth(i),
            box = await b.boundingBox();
          native(
            (box.x + box.width / 2) * scale,
            (box.y + box.height / 2) * scale,
          );
          await expect(b).toHaveClass(/expanded/);
          await c.page.waitForTimeout(260);
          const layout = await c.page.evaluate(() =>
            Array.from(document.querySelectorAll(".action-bubble")).map((b) => {
              const r = b.getBoundingClientRect(),
                s = b.querySelector(".action-detail");
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                expanded: b.classList.contains("expanded"),
                textFits: s.scrollWidth <= s.clientWidth,
                inside:
                  r.x >= 0 &&
                  r.y >= 0 &&
                  r.right <= innerWidth &&
                  r.bottom <= innerHeight,
              };
            }),
          );
          expect(layout.every((r) => r.inside)).toBe(true);
          expect(layout[i].textFits).toBe(true);
          for (let a = 0; a < 4; a++)
            for (let b = a + 1; b < 4; b++) {
              const x = layout[a],
                y = layout[b];
              expect(
                x.x < y.x + y.width &&
                  y.x < x.x + x.width &&
                  x.y < y.y + y.height &&
                  y.y < x.y + x.height,
              ).toBe(false);
            }
          await desktopShot(c.app, `pill-${i}-${scale * 100}-${theme}`);
        }
        await expect(
          c.page.evaluate(() =>
            window.blinkling.shell({
              type: "drag",
              phase: "start",
              path: "/bin/sh",
            }),
          ),
        ).rejects.toThrow(/Invalid shell command/);
        await c.page.evaluate(() => window.blinkling.action("chat"));
        const chat = c.app
          .windows()
          .find((p) => p.url().includes("surface=card"));
        await expect(chat.locator(".gl-input")).toBeFocused();
        await chat.waitForTimeout(500);
        await expect(c.page.locator(".action-bubble").first()).toBeHidden();
        const cardBounds = await c.app.evaluate(() =>
          globalThis.blinklingTest.composer.getBounds(),
        );
        const cardImage = await desktopShot(
          c.app,
          `card-${scale * 100}-${theme}`,
        );
        expect(
          pixel(
            cardImage,
            (cardBounds.x + 30) * scale,
            (cardBounds.y + 90) * scale,
          ),
        ).toEqual(theme === "light" ? [250, 248, 243] : [38, 39, 37]);
        const capture = await c.app.evaluate(() =>
          globalThis.blinklingTest.capture(),
        );
        await writeFile(
          join(report, `clean-capture-${scale * 100}-${theme}.png`),
          Buffer.from(capture.image.data, "base64"),
        );
        const clean = PNG.sync.read(Buffer.from(capture.image.data, "base64"));
        expect(pixel(clean, clean.width - 40, clean.height - 60)).toEqual([
          32, 64, 128,
        ]);
      } finally {
        await c.close();
      }
    });
