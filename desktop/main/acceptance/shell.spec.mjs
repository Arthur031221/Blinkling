import { test, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  launch,
  native,
  move,
  click,
  key,
  report,
  bodyBox,
  bodyPoint,
  limbTip,
} from "./support.mjs";
import {
  reveal,
  onBlink,
  clickBlink,
  background,
  shot,
  rgb,
} from "./helpers.mjs";

const cardWindow = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
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
    // The full screen bubble closes the menu when it is used, so it goes last.
    for (const action of ["guide", "auto-explain", "settings", "capture"]) {
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
      "guide",
      "auto-explain",
      "settings",
      "capture",
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
    const at = await bodyPoint(page);
    const sample = { x: b.x + at.x, y: b.y + at.y };
    // Blink's body at rest, blended over the desktop at the idle opacity. Its
    // outline and shading draw darker lines, so look for the plain fill nearby.
    const near = [];
    for (let dx = -12; dx <= 12; dx += 6)
      for (let dy = -12; dy <= 12; dy += 6)
        near.push(rgb(p, sample.x + dx, sample.y + dy));
    expect(
      near.some((c) => [46, 125, 137].every((v, i) => Math.abs(c[i] - v) <= 3)),
      JSON.stringify(near),
    ).toBe(true);
    move(sample.x, sample.y);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(550);
    const stand = await bodyPoint(page);
    move(b.x + stand.x, b.y + stand.y);
    await shot(app, "hover-wave");
    // Under the pointer Blink reacts to the touch; pinned and left alone it shows
    // its open eyes.
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: true }),
    );
    move(40, 40);
    await page.waitForFunction(
      () =>
        window.desktop.character.last.open > 0.99 &&
        window.desktop.character.last.eyes === "open" &&
        document.querySelector(".blink-pupil"),
    );
    const where = () =>
      page.evaluate(() => {
        const r = document
          .querySelector(".blink-pupil")
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    const first = await where();
    const face = await shot(app, "visible-pupils", 0);
    const pupil = await where();
    // The pupil is Blink's dark ink, not the green of the body; it drifts a
    // little between two looks, so any dark pixel around it counts.
    const dark = [];
    for (const at of [first, pupil])
      for (let dx = -4; dx <= 4; dx += 2)
        for (let dy = -4; dy <= 4; dy += 2)
          dark.push(Math.max(...rgb(face, b.x + at.x + dx, b.y + at.y + dy)));
    expect(Math.min(...dark)).toBeLessThan(40);
    expect(
      await page.locator("#blink").evaluate((e) => getComputedStyle(e).opacity),
    ).toBe("1");
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
    await page.evaluate(() => window.blinkling.shell({ type: "close-chat" }));
    move(b.x + stand.x, b.y + stand.y);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    const focusBefore = await app.evaluate(() => globalThis.bg.isFocused());
    expect(focusBefore).toBe(true);
    click(b.x + stand.x, b.y + stand.y);
    // A click on Blink opens the chat card, which holds the keyboard; Escape
    // gives it back to the application that had it.
    const miniFocused = () =>
      app.evaluate(
        () =>
          globalThis.blinklingTest.composer.isVisible() &&
          globalThis.blinklingTest.composer.isFocused(),
      );
    await expect.poll(miniFocused).toBe(true);
    key(0xff1b);
    await expect.poll(miniFocused).toBe(false);
    await expect
      .poll(() => app.evaluate(() => globalThis.bg.isFocused()))
      .toBe(true);
    const hand = await limbTip(page);
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
    // A click on the limb is a click on Blink: it opened the chat card again.
    await expect.poll(miniFocused).toBe(true);
    key(0xff1b);
    await expect.poll(miniFocused).toBe(false);
    // Empty space above Blink's head is transparent and passes a native click.
    await page.evaluate(() => window.blinkling.shell({ type: "close-chat" }));
    const corner = await page.locator("#blink").boundingBox();
    click(b.x + corner.x + corner.width * 0.75, b.y + corner.y + 3);
    await expect
      .poll(() => app.evaluate(() => globalThis.bg.isFocused()))
      .toBe(true);
    move(40, 40);
    // Nothing else holds Blink out: it goes back once the pointer has left.
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
      const samples = [],
        start = performance.now();
      await new Promise((resolve) => {
        function sample(now) {
          const pose = window.desktop.character.last;
          samples.push({
            eye: pose.open,
            mouth: pose.mouth,
            mp: pose.mp,
          });
          if (now - start < 5500) requestAnimationFrame(sample);
          else resolve();
        }
        requestAnimationFrame(sample);
      });
      return samples;
    });
    // The eyes blink now and then, and the mouth works while it talks.
    expect(Math.min(...poses.map((p) => p.eye))).toBeLessThan(0.5);
    expect(Math.max(...poses.map((p) => p.eye))).toBe(1);
    // The face blends into the talking pose in under half a second.
    expect(new Set(poses.slice(40).map((p) => p.mouth))).toEqual(
      new Set(["talk"]),
    );
    expect(
      Math.max(...poses.map((p) => p.mp)) - Math.min(...poses.map((p) => p.mp)),
    ).toBeGreaterThan(0.4);
    await app.evaluate(() =>
      globalThis.blinklingTest.send({
        type: "done",
        turnId: "animation-test",
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.desktop.character.last.mouth))
      .not.toBe("talk");
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
      // Thinking looks up and to the side, with the thought bubbles beside the head.
      await expect
        .poll(() =>
          page.evaluate(() => window.desktop.character.last.look?.[1]),
        )
        .toBeLessThan(-0.5);
      expect(
        await page.evaluate(() => window.desktop.character.last.front),
      ).toContain("<circle");
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
      await onBlink(page, scale);
      await clickBlink(page, scale);
      await expect.poll(() => cardWindow(app)).toBeTruthy();
      const cardPage = cardWindow(app);
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
    const body = await bodyBox(page);
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
    // Held, Blink is scared and keeps its shape: the body is rigid, never stretched.
    const held = await page.evaluate(() => {
      const m = document.querySelector(".blink-body").getScreenCTM();
      return {
        ratio: Math.hypot(m.a, m.b) / Math.hypot(m.c, m.d),
        eyes: window.desktop.character.last.eyes,
      };
    });
    expect(held.ratio).toBeGreaterThan(0.99);
    expect(held.ratio).toBeLessThan(1.01);
    expect(held.eyes).toBe("wide");
    await page.evaluate(() =>
      window.blinkling.shell({ type: "pin", value: false }),
    );
    native([{ type: "up" }]);
    // The drop pose lasts half a second, so poll faster than the default backoff.
    await expect
      .poll(() => page.locator("#blink").getAttribute("data-mode"), {
        intervals: [20],
        timeout: 5000,
      })
      .toBe("drop");
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
  test.setTimeout(120000);
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
      // Blink stays out for the retreat delay, then settles into its peek.
      await page.waitForTimeout(2300);
      const dropped = await page.evaluate(() => window.desktop.inspect());
      expect(dropped.shell.edge).toBe(edge);
      expect(dropped.mode).toBe("peek");
      await shot(app, `edge-${edge}${corner ? "-corner" : ""}`);
      expect(
        await page.evaluate(
          () =>
            // Both eyes show in the peek, not only the edge of the head.
            [...document.querySelectorAll(".blink-pupil")].filter((e) => {
              const r = e.getBoundingClientRect(),
                px = r.x + r.width / 2,
                py = r.y + r.height / 2;
              return px >= 0 && px < innerWidth && py >= 0 && py < innerHeight;
            }).length >= 2,
        ),
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
    // A click on Blink while it waits on a permission request opens the full
    // card; any other click opens the mini composer.
    await openCard(page);
    await expect.poll(() => cardWindow(app)).toBeTruthy();
    const cardPage = cardWindow(app);
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
    // The unsent draft keeps the unpinned card open; once emptied, a click
    // outside Blinkling dismisses it.
    expect(
      await app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
    ).toBe(true);
    await cardPage.getByRole("textbox").fill("");
    const box = await cardPage.getByRole("textbox").boundingBox();
    const now = await app.evaluate(() =>
      globalThis.blinklingTest.composer.getBounds(),
    );
    click(now.x + box.x + box.width / 2, now.y + box.y + box.height / 2);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.composer.isFocused()),
      )
      .toBe(true);
    click(40, 40);
    await expect
      .poll(
        () => app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
        { timeout: 4000 },
      )
      .toBe(false);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await openCard(page);
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
        await expect(page.locator(".action")).toHaveCount(5);
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
        await openCard(page);
        await expect.poll(() => cardWindow(app)).toBeTruthy();
        const cardPage = cardWindow(app);
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
