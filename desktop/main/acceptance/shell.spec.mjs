import { test, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { launch, native, move, click, report } from "./support.mjs";
import { reveal, clickBlink, background, shot, rgb } from "./helpers.mjs";
test("registered services receive native menu actions and auto switch reflects the applied result", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await app.evaluate(() => {
      globalThis.actions = [];
      for (const action of ["capture", "guide", "auto-explain", "settings"])
        globalThis.blinklingTest.registerAction(action, ({ display }) => {
          globalThis.actions.push({ action, displayId: String(display.id) });
          return { ok: true, enabled: action === "auto-explain" };
        });
    });
    await reveal(page);
    let count = 0;
    for (const action of ["capture", "guide", "auto-explain", "settings"]) {
      const r = await page.locator(`[data-action="${action}"]`).boundingBox();
      click(b.x + r.x + r.width / 2, b.y + r.y + r.height / 2);
      await expect
        .poll(() => app.evaluate(() => globalThis.actions.length))
        .toBe(++count);
    }
    await expect(page.locator('[data-action="auto-explain"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const actions = await app.evaluate(() => globalThis.actions);
    const displayId = await app.evaluate(
      () => globalThis.blinklingTest.snapshot().display.id,
    );
    expect(actions.map((a) => a.action)).toEqual([
      "capture",
      "guide",
      "auto-explain",
      "settings",
    ]);
    expect(actions.every((a) => a.displayId === displayId)).toBe(true);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
  } finally {
    await app.close();
  }
});
test("native cutout alpha, moving limbs, delayed retreat, fullscreen, clean capture and focus", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app, true);
    move(40, 40);
    await page.waitForTimeout(1800);
    const idle = await page.evaluate(() => window.desktop.inspect());
    expect(idle.mode).toBe("peek");
    expect(idle.shell.pinned).toBe(false);
    expect(idle.anchor.x).toBeCloseTo(b.width, 6);
    const p = await shot(app, "idle-fullscreen");
    expect(rgb(p, 600, 600)).toEqual([32, 64, 128]);
    const sample = { x: b.x + idle.anchor.x - 18, y: b.y + idle.anchor.y + 10 };
    [44, 126, 137].forEach((v, i) =>
      expect(Math.abs(rgb(p, sample.x, sample.y)[i] - v)).toBeLessThanOrEqual(
        3,
      ),
    );
    move(sample.x, sample.y);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(550);
    const active = await page.evaluate(() => window.desktop.inspect());
    move(b.x + active.anchor.x - 18, b.y + active.anchor.y + 10);
    await shot(app, "hover-wave");
    await page.waitForFunction(() =>
      window.desktop.character.rig.eyes.node
        .getAttribute("transform")
        .endsWith("scale(1,1)"),
    );
    const pupil = await page.evaluate(() => {
      const node =
        window.desktop.character.rig.pupils.node.querySelector("circle");
      const m = node.getScreenCTM(),
        x = +node.getAttribute("cx"),
        y = +node.getAttribute("cy");
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
    });
    const face = await shot(app, "visible-pupils", 0);
    expect(rgb(face, b.x + pupil.x, b.y + pupil.y)).toEqual([12, 14, 13]);
    expect(
      await page.locator("#blink").evaluate((e) => getComputedStyle(e).opacity),
    ).toBe("1");
    const focusBefore = await app.evaluate(() => globalThis.bg.isFocused());
    expect(focusBefore).toBe(true);
    click(b.x + active.anchor.x - 18, b.y + active.anchor.y + 10);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.snapshot().chatOpen),
      )
      .toBe(true);
    await page.evaluate(() => window.blinkling.shell({ type: "close-chat" }));
    await expect
      .poll(() => app.evaluate(() => globalThis.bg.isFocused()))
      .toBe(true);
    const hand = await page
      .locator('#blink svg circle[r="24"]')
      .first()
      .evaluate((e) => {
        const m = e.getScreenCTM();
        return { x: m.e, y: m.d * +e.getAttribute("cy") + m.f };
      });
    const clickCount = await app.evaluate(() =>
      globalThis.bg.webContents.executeJavaScript("clicks.length"),
    );
    click(b.x + hand.x, b.y + hand.y);
    expect(
      await app.evaluate(() =>
        globalThis.bg.webContents.executeJavaScript("clicks.length"),
      ),
    ).toBe(clickCount);
    const before = await page.locator("#blink svg").innerHTML();
    await page.waitForTimeout(180);
    expect(await page.locator("#blink svg").innerHTML()).not.toBe(before);
    // Empty corner of the sprite is transparent and passes a native click.
    await page.evaluate(() => window.blinkling.shell({ type: "close-chat" }));
    click(b.x + active.anchor.x - 76, b.y + active.anchor.y - 78);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    move(40, 40);
    await page.waitForTimeout(900);
    expect(await page.locator("#blink").getAttribute("data-mode")).toBe(
      "hover",
    );
    await page.waitForTimeout(900);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    const capture = await app.evaluate(() =>
      globalThis.blinklingTest.capture(),
    );
    const clean = PNG.sync.read(Buffer.from(capture.image.data, "base64"));
    expect(rgb(clean, sample.x, sample.y)).toEqual([32, 64, 128]);
    await writeFile(
      join(report, "capture-exclusion.png"),
      Buffer.from(capture.image.data, "base64"),
    );
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await expect(
      page.evaluate(() =>
        window.blinkling.shell({ type: "exec", command: "whoami" }),
      ),
    ).rejects.toThrow("Invalid shell command");
  } finally {
    await app.close();
  }
});
test("real animation frames include eye blinks, pupil looks and a talking mouth", async () => {
  const { app, page } = await launch();
  try {
    await background(app);
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: true }),
    );
    await app.evaluate(() =>
      globalThis.blinklingTest.send({
        type: "delta",
        id: "animation-test",
        text: "Hello",
      }),
    );
    const poses = await page.evaluate(async () => {
      const rig = window.desktop.character.rig,
        samples = [],
        start = performance.now();
      await new Promise((resolve) => {
        function sample(now) {
          samples.push({
            eye: Number(
              rig.eyes.node
                .getAttribute("transform")
                .match(/scale\([^,]+,([^)]+)\)/)[1],
            ),
            look: rig.pupils.node.transform.baseVal.consolidate().matrix.e,
            mouth: Number(rig.mouth.getAttribute("opacity")),
          });
          if (now - start < 5500) requestAnimationFrame(sample);
          else resolve();
        }
        requestAnimationFrame(sample);
      });
      return samples;
    });
    expect(Math.min(...poses.map((p) => p.eye))).toBeLessThan(0.2);
    // The talking face keeps the eyes a little narrowed (N4): 0.7, not 1.
    expect(Math.max(...poses.map((p) => p.eye))).toBeCloseTo(0.7, 2);
    expect(
      Math.max(...poses.map((p) => p.look)) -
        Math.min(...poses.map((p) => p.look)),
    ).toBeGreaterThan(4);
    expect(new Set(poses.map((p) => p.mouth))).toEqual(new Set([0, 1]));
    await app.evaluate(() =>
      globalThis.blinklingTest.send({
        type: "done",
        turnId: "animation-test",
      }),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.desktop.character.rig.mouth.getAttribute("opacity"),
        ),
      )
      .toBe("0");
    await writeFile(
      join(report, "animation-poses.json"),
      JSON.stringify(poses, null, 2),
    );
  } finally {
    await app.close();
  }
});
for (const scale of [1, 1.5, 2])
  test(`session expressions remain readable in the peek and permission opens chat at ${scale * 100}%`, async () => {
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      move(20, 20);
      const emit = (event) =>
        app.evaluate(
          (_electron, event) => globalThis.blinklingTest.send(event),
          event,
        );
      await emit({ type: "status", state: "connected" });
      // No always-on status circle while connected (N3): the dot is hidden.
      await expect(page.locator('[data-connection="ok"]')).toBeHidden();
      await emit({ type: "activity", state: "thinking" });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-expression",
        "thinking",
      );
      expect(
        await page.evaluate(
          () =>
            window.desktop.character.rig.pupils.node.transform.baseVal.consolidate()
              .matrix.f,
        ),
      ).toBeLessThan(-10);
      expect(
        await page.evaluate(() =>
          window.desktop.character.rig.thoughts.every(
            (e) => +e.getAttribute("opacity") > 0.3,
          ),
        ),
      ).toBe(true);
      await shot(app, `thinking-peek-${scale * 100}`);
      await emit({ type: "done", turnId: "expressions" });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-expression",
        "finished",
      );
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-expression",
        "idle",
      );
      await emit({ type: "status", state: "retrying" });
      await expect(page.locator('[data-connection="retrying"]')).toBeVisible();
      await emit({ type: "status", state: "blocked" });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-expression",
        "error",
      );
      await shot(app, `error-peek-${scale * 100}`);
      await emit({ type: "activity", state: "permission" });
      await expect(page.locator("#permission-alert")).toBeVisible();
      expect(
        await page.locator("#permission-alert").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight &&
            e.scrollWidth <= e.clientWidth
          );
        }),
      ).toBe(true);
      await shot(app, `permission-peek-${scale * 100}`);
      expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
      const opening = app.waitForEvent("window");
      await clickBlink(page, scale);
      const cardPage = await opening;
      await cardPage.waitForURL("**/composer/index.html?surface=card");
      await expect(
        cardPage.getByRole("textbox", { name: "輸入問題" }),
      ).toBeVisible();
      expect(
        await app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
      ).toBe(true);
      await expect(page.locator("#permission-alert")).toBeHidden();
      await cardPage.getByRole("button", { name: "收起" }).click();
      expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    } finally {
      await app.close();
    }
  });
test("grabbing the peek preserves the cursor offset without a drag jump", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    move(40, 40);
    await page.evaluate(() => {
      document.querySelector("#blink").addEventListener(
        "pointerdown",
        () => {
          window.grabAnchor = window.desktop.inspect().anchor;
        },
        { capture: true, once: true },
      );
    });
    const body = await page.locator('rect[fill="#3ddc97"]').boundingBox();
    const start = {
      x: b.x + Math.min(b.width - 8, body.x + body.width * 0.35),
      y: b.y + body.y + body.height * 0.72,
    };
    native([
      { type: "move", ...start, wait: 0.02 },
      { type: "down" },
      { type: "move", x: 850, y: 450, wait: 0.2 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    const { grab, anchor } = await page.evaluate(() => ({
      grab: window.grabAnchor,
      anchor: window.desktop.inspect().anchor,
    }));
    expect(grab).toBeTruthy();
    expect(Math.abs(anchor.x - (grab.x + 850 - start.x))).toBeLessThan(4);
    expect(Math.abs(anchor.y - (grab.y + 450 - start.y))).toBeLessThan(4);
    await shot(app, "drag-from-peek", 600);
    native([{ type: "up" }]);
  } finally {
    await app.close();
  }
});
test("native drag squish, bounce, edge persistence, display transfer and hotplug", async () => {
  const first = await launch(),
    { app, page, data } = first;
  try {
    const b = await background(app);
    await reveal(page);
    await page.waitForTimeout(700);
    let anchor = await page.evaluate(() => window.desktop.inspect().anchor);
    const start = { x: b.x + anchor.x - 18, y: b.y + anchor.y + 10 };
    native([
      { type: "move", ...start },
      { type: "down" },
      { type: "move", x: 250, y: 300, wait: 0.2 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    await shot(app, "drag-surprised", 600);
    for (const button of await page.locator("#menu button").all())
      await expect(button).toHaveCSS("visibility", "hidden");
    const transform = await page
      .locator("#blink svg > g > g")
      .getAttribute("transform");
    expect(transform).toContain("0.88,1.12");
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
    native([{ type: "up" }]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drop");
    await shot(app, "drop-bounce");
    await page.waitForTimeout(750);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    expect(
      await app.evaluate(
        () => globalThis.blinklingTest.snapshot().position.edge,
      ),
    ).toBe("left");
    const saved = JSON.parse(
      await readFile(join(data, "blink-positions.json"), "utf8"),
    );
    expect(Object.keys(saved.positions)).toHaveLength(1);
    // The display hotplug path runs in the real Electron shell; fake display
    // descriptors simulate removed hardware, not renderer geometry.
    await app.evaluate(() => {
      globalThis.blinklingTest.setDisplay({
        id: 200,
        bounds: { x: 0, y: 0, width: 900, height: 700 },
        workArea: { x: 0, y: 0, width: 900, height: 700 },
        scaleFactor: 1.5,
      });
    });
    await page.waitForTimeout(500);
    expect(
      (await page.evaluate(() => window.desktop.inspect().shell)).displayId,
    ).toBe("200");
    await app.evaluate(({ screen }) =>
      screen.emit("display-removed", {}, { id: 200 }),
    );
    await page.waitForTimeout(500);
    expect(
      (await page.evaluate(() => window.desktop.inspect().shell)).displayId,
    ).not.toBe("200");
    expect(
      (await page.evaluate(() => window.desktop.inspect().shell)).edge,
    ).toBe("left");
  } finally {
    await app.close();
  }
  const again = await launch({ data });
  try {
    expect(
      (await again.page.evaluate(() => window.desktop.inspect().shell)).edge,
    ).toBe("left");
    expect(
      (await again.page.evaluate(() => window.desktop.inspect().shell)).pinned,
    ).toBe(false);
  } finally {
    await again.app.close();
  }
});
test("native drops peek from all four edges and three corners with a visible eye and a bounded menu", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    for (const [edge, x, y, corner] of [
      ["bottom", 640, 790, false],
      ["left", 10, 400, false],
      ["right", 1270, 400, false],
      ["top", 640, 10, false],
      ["top", 10, 10, true],
      ["right", 1270, 10, true],
      ["bottom", 10, 790, true],
    ]) {
      await reveal(page);
      await page.waitForTimeout(700);
      const s = await page.evaluate(() => window.desktop.inspect());
      native([
        { type: "move", x: b.x + s.anchor.x - 18, y: b.y + s.anchor.y + 10 },
        { type: "down" },
        {
          type: "move",
          x: Math.max(0, (edge === "top" && corner ? 74 : x) - 18),
          y: Math.max(0, y - 52),
          wait: 0.2,
        },
      ]);
      await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
      await page.evaluate(() =>
        window.blinkling.shell({ type: "pin", value: false }),
      );
      native([{ type: "up" }, { type: "move", x: 400, y: 700 }]);
      await page.waitForTimeout(900);
      const dropped = await page.evaluate(() => window.desktop.inspect());
      expect(dropped.shell.edge).toBe(edge);
      expect(dropped.mode).toBe("peek");
      await shot(app, `edge-${edge}${corner ? "-corner" : ""}`);
      expect(
        await page.evaluate(() => {
          const rig = window.desktop.character.rig;
          return [...rig.pupils.node.querySelectorAll('circle[r="16"]')].some(
            (e) => {
              const m = e.getScreenCTM(),
                x = +e.getAttribute("cx"),
                y = +e.getAttribute("cy");
              const px = m.a * x + m.c * y + m.e,
                py = m.b * x + m.d * y + m.f;
              return px >= 0 && px < innerWidth && py >= 0 && py < innerHeight;
            },
          );
        }),
      ).toBe(true);
      await reveal(page);
      await page.waitForTimeout(700);
      for (const button of await page.locator(".action").all()) {
        await button.hover();
        await page.waitForTimeout(200);
        expect(
          await button.evaluate((e) => {
            // The label is a popover beside the bubble: both must be on screen.
            const r = e.getBoundingClientRect(),
              label = e.querySelector(".action-label"),
              l = label.getBoundingClientRect();
            return (
              [r, l].every(
                (box) =>
                  box.x >= 0 &&
                  box.y >= 0 &&
                  box.right <= innerWidth &&
                  box.bottom <= innerHeight,
              ) && label.scrollWidth <= label.clientWidth
            );
          }),
        ).toBe(true);
      }
      await shot(app, `edge-${edge}${corner ? "-corner" : ""}-menu`);
    }
  } finally {
    await app.close();
  }
});
test("rounded card opens by intent, pin holds it, unpin dismisses and restores application focus", async () => {
  const { app, page } = await launch();
  try {
    await background(app);
    move(40, 40);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await reveal(page);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(650);
    const opening = app.waitForEvent("window");
    await clickBlink(page);
    const cardPage = await opening;
    await cardPage.waitForURL("**/composer/index.html?surface=card");
    await expect(
      cardPage.getByRole("textbox", { name: "輸入問題" }),
    ).toBeVisible();
    await cardPage
      .getByRole("textbox")
      .fill("Focus stays here while composing.");
    expect(
      await app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
    ).toBe(true);
    const pin = await cardPage
      .getByRole("button", { name: "釘選對話" })
      .boundingBox();
    const bounds = await app.evaluate(() =>
      globalThis.blinklingTest.composer.getBounds(),
    );
    click(bounds.x + pin.x + pin.width / 2, bounds.y + pin.y + pin.height / 2);
    await shot(app, "pinned-rounded-card");
    const cb = await app.evaluate(() =>
      globalThis.blinklingTest.composer.getBounds(),
    );
    const clicks = await app.evaluate(() =>
      globalThis.bg.webContents.executeJavaScript("clicks.length"),
    );
    click(cb.x + 9, cb.y + 9);
    await expect
      .poll(() =>
        app.evaluate(() =>
          globalThis.bg.webContents.executeJavaScript("clicks.length"),
        ),
      )
      .toBe(clicks + 1);
    await expect
      .poll(() => app.evaluate(() => globalThis.bg.isFocused()))
      .toBe(true);
    click(40, 40);
    await page.waitForTimeout(1900);
    expect(
      await app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
    ).toBe(true);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
    await page.waitForTimeout(1900);
    // The unsent draft keeps the unpinned card open; it dismisses once emptied.
    expect(
      await app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
    ).toBe(true);
    await cardPage.getByRole("textbox").fill("");
    await expect
      .poll(
        () => app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
        { timeout: 4000 },
      )
      .toBe(false);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await page.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: false }),
    );
    await cardPage.getByRole("button", { name: "收起" }).click();
    await page.waitForTimeout(300);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
  } finally {
    await app.close();
  }
});
for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`menu fits at ${scale * 100}% ${theme}; spring, reverse close and frame budget`, async () => {
      const { app, page } = await launch({ scale, theme });
      try {
        await background(app);
        move(20, 20);
        await reveal(page, scale);
        await page.waitForTimeout(750);
        expect(
          await page.evaluate(
            () => matchMedia("(prefers-color-scheme: dark)").matches,
          ),
        ).toBe(theme === "dark");
        await expect(page.locator(".action")).toHaveCount(4);
        for (const action of ["capture", "guide", "auto-explain", "settings"]) {
          const button = page.locator(`[data-action="${action}"]`);
          await button.hover();
          await page.waitForTimeout(250);
          expect(
            await button.evaluate((e) => {
              const r = e.getBoundingClientRect(),
                label = e.querySelector(".action-label"),
                c = label.getBoundingClientRect();
              return (
                r.x >= 0 &&
                r.y >= 0 &&
                r.right <= innerWidth &&
                r.bottom <= innerHeight &&
                c.x >= 0 &&
                c.right <= innerWidth &&
                label.scrollWidth <= label.clientWidth + 1
              );
            }),
          ).toBe(true);
        }
        await shot(app, `menu-${scale * 100}-${theme}`);
        await page.evaluate(() =>
          window.blinkling.shell({ type: "click", permission: false }),
        );
        const cardPage = app
          .windows()
          .find((p) => p.url().includes("surface=card"));
        await cardPage.emulateMedia({ colorScheme: theme });
        await cardPage.waitForTimeout(350);
        await expect
          .poll(() =>
            page
              .locator(".action")
              .evaluateAll((els) => els.every((e) => e.inert)),
          )
          .toBe(true);
        expect(
          await cardPage.locator("#card").evaluate((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.x >= 0 &&
              r.y >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight &&
              e.scrollHeight <= e.clientHeight
            );
          }),
        ).toBe(true);
        await shot(app, `card-${scale * 100}-${theme}`);
        await cardPage.getByRole("button", { name: "收起" }).click();
        // Closing clears pin; keep the menu open for its independent frame sample.
        await reveal(page, scale);
        const frames = await page.evaluate(async () => {
          const samples = [];
          let previous = performance.now();
          await new Promise((resolve) => {
            function sample(now) {
              samples.push(now - previous);
              previous = now;
              if (samples.length < 180) requestAnimationFrame(sample);
              else resolve();
            }
            requestAnimationFrame(sample);
          });
          return samples.slice(1);
        });
        const sorted = [...frames].sort((a, b) => a - b),
          p95 = sorted[Math.floor(sorted.length * 0.95)];
        await writeFile(
          join(report, `frames-${scale * 100}-${theme}.json`),
          JSON.stringify(
            {
              samples: frames,
              p95,
              over33ms: frames.filter((t) => t > 33.4).length,
            },
            null,
            2,
          ),
        );
        expect(p95).toBeLessThan(21);
        expect(frames.filter((t) => t > 33.4).length).toBeLessThan(3);
        move(20, 20);
        await page.evaluate(() =>
          window.blinkling.shell({ type: "pin", value: false }),
        );
        await page.waitForTimeout(1520);
        const before = await page
          .locator(".action")
          .evaluateAll((els) => els.map((e) => +getComputedStyle(e).opacity));
        await page.waitForTimeout(100);
        const after = await page
          .locator(".action")
          .evaluateAll((els) => els.map((e) => +getComputedStyle(e).opacity));
        expect(after[3]).toBeLessThanOrEqual(before[3]);
        expect(after[0]).toBeGreaterThanOrEqual(after[3]);
        await page.waitForTimeout(500);
        await expect(page.locator("#blink")).toHaveAttribute(
          "data-mode",
          "peek",
        );
        expect(
          await page
            .locator(".action")
            .evaluateAll((els) => els.every((e) => e.inert)),
        ).toBe(true);
      } finally {
        await app.close();
      }
    });
