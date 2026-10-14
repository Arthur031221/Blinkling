import { test, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { launch, native, move, click, report } from "./support.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function background(app, fullscreen = false) {
  return app.evaluate(async ({ BrowserWindow, screen }, fullscreen) => {
    const bg = new BrowserWindow({
      ...screen.getPrimaryDisplay().bounds,
      frame: false,
      show: false,
      backgroundColor: "#204080",
    });
    await bg.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="margin:0;background:#204080;color:white;font:24px sans-serif"><div style="padding:40px">Desktop focus target</div><script>window.clicks=[];addEventListener("click",e=>clicks.push([e.screenX,e.screenY]))</script>',
        ),
    );
    bg.show();
    if (fullscreen) bg.setFullScreen(true);
    globalThis.bg = bg;
    return screen.getPrimaryDisplay().workArea;
  }, fullscreen);
}
async function shot(app, name, settle = 250) {
  await sleep(settle);
  const data = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const b = screen.getPrimaryDisplay().bounds;
    return (
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(b.width * screen.getPrimaryDisplay().scaleFactor),
          height: Math.round(b.height * screen.getPrimaryDisplay().scaleFactor),
        },
      })
    )[0].thumbnail
      .toPNG()
      .toString("base64");
  });
  const bytes = Buffer.from(data, "base64");
  await writeFile(join(report, name + ".png"), bytes);
  return PNG.sync.read(bytes);
}
const rgb = (p, x, y) => [
  ...p.data.subarray(
    (Math.round(y) * p.width + Math.round(x)) * 4,
    (Math.round(y) * p.width + Math.round(x)) * 4 + 3,
  ),
];
test("registered services receive native menu actions and auto switch reflects the applied result", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await app.evaluate(() => {
      globalThis.actions = [];
      for (const action of [
        "screen",
        "region",
        "full-page",
        "guide",
        "auto-explain",
        "settings",
        "help",
      ])
        globalThis.glimpseletTest.shell.registerAction(
          action,
          ({ display }) => {
            globalThis.actions.push({ action, displayId: String(display.id) });
            return { ok: true, enabled: action === "auto-explain" };
          },
        );
    });
    await page.evaluate(() =>
      window.glimpselet.shell({ type: "pin", value: true }),
    );
    await page.waitForTimeout(650);
    let count = 0;
    for (const label of [
      "截取畫面",
      "選取區域",
      "整頁截圖",
      "導覽",
      "自動解說",
      "設定",
      "說明",
    ]) {
      const r = await page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      click(b.x + r.x + r.width / 2, b.y + r.y + r.height / 2);
      await expect
        .poll(() => app.evaluate(() => globalThis.actions.length))
        .toBe(++count);
    }
    await expect(
      page.getByRole("button", { name: "自動解說", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const actions = await app.evaluate(() => globalThis.actions);
    const displayId = await app.evaluate(
      () => globalThis.glimpseletTest.state().displayId,
    );
    expect(actions.map((a) => a.action)).toEqual([
      "screen",
      "region",
      "full-page",
      "guide",
      "auto-explain",
      "settings",
      "help",
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
    const idle = await page.evaluate(() => window.desktop.state());
    expect(idle.mode).toBe("peek");
    expect(idle.shell.pinned).toBe(false);
    expect(idle.anchor.x).toBe(b.width);
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
    const active = await page.evaluate(() => window.desktop.state());
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
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.state().chatOpen),
    ).toBe(false);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
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
      globalThis.glimpseletTest.capture(),
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
        window.glimpselet.shell({ type: "exec", command: "whoami" }),
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
      window.glimpselet.shell({ type: "pin", value: true }),
    );
    await app.evaluate(() =>
      globalThis.glimpseletTest.shell.emit({
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
    expect(Math.max(...poses.map((p) => p.eye))).toBe(1);
    expect(
      Math.max(...poses.map((p) => p.look)) -
        Math.min(...poses.map((p) => p.look)),
    ).toBeGreaterThan(4);
    expect(new Set(poses.map((p) => p.mouth))).toEqual(new Set([0, 1]));
    await app.evaluate(() =>
      globalThis.glimpseletTest.shell.emit({
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
          (_electron, event) => globalThis.glimpseletTest.shell.emit(event),
          event,
        );
      await emit({ type: "status", state: "connected" });
      await expect(
        page.locator('[data-connection="connected"]'),
      ).toHaveAttribute("fill", "#1f9e68");
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
      await expect(
        page.locator('[data-connection="retrying"]'),
      ).toHaveAttribute("fill", "#d99729");
      await emit({ type: "status", state: "blocked" });
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-expression",
        "error",
      );
      await shot(app, `error-peek-${scale * 100}`);
      await emit({ type: "activity", state: "permission" });
      await expect(
        page.getByRole("button", { name: "需要你的允許", exact: true }),
      ).toBeVisible();
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
      let s = await page.evaluate(() => window.desktop.state());
      move(
        (s.shell.workArea.x + s.anchor.x - 18) * scale,
        (s.shell.workArea.y + s.anchor.y + 10) * scale,
      );
      await expect(page.locator("#blink")).toHaveAttribute(
        "data-mode",
        "hover",
      );
      await page.waitForTimeout(650);
      s = await page.evaluate(() => window.desktop.state());
      const opening = app.waitForEvent("window");
      click(
        (s.shell.workArea.x + s.anchor.x - 18) * scale,
        (s.shell.workArea.y + s.anchor.y + 10) * scale,
      );
      const cardPage = await opening;
      await cardPage.waitForURL("**/card.html");
      await expect(
        cardPage.getByRole("textbox", { name: "訊息" }),
      ).toBeVisible();
      expect(
        await app.evaluate(() => globalThis.glimpseletTest.card.isFocused()),
      ).toBe(true);
      await expect(page.locator("#permission-alert")).toBeHidden();
      await cardPage.getByRole("button", { name: "關閉對話" }).click();
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
          window.grabAnchor = window.desktop.state().anchor;
        },
        { capture: true, once: true },
      );
    });
    const start = { x: b.x + b.width - 35, y: b.y + b.height - 100 };
    native([
      { type: "move", ...start, wait: 0.02 },
      { type: "down" },
      { type: "move", x: 850, y: 450, wait: 0.2 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    const { grab, anchor } = await page.evaluate(() => ({
      grab: window.grabAnchor,
      anchor: window.desktop.state().anchor,
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
    await page.evaluate(() =>
      window.glimpselet.shell({ type: "pin", value: true }),
    );
    await page.waitForTimeout(700);
    let anchor = await page.evaluate(() => window.desktop.state().anchor);
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
      .locator("#blink svg > g")
      .getAttribute("transform");
    expect(transform).toContain("0.88,1.12");
    await page.evaluate(() =>
      window.glimpselet.shell({ type: "pin", value: false }),
    );
    native([{ type: "up" }]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drop");
    await shot(app, "drop-bounce");
    await page.waitForTimeout(750);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek");
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.state().edge),
    ).toBe("left");
    const saved = JSON.parse(
      await readFile(join(data, "blink-positions.json"), "utf8"),
    );
    expect(Object.keys(saved.positions)).toHaveLength(1);
    // The display hotplug path runs in the real Electron shell; fake display
    // descriptors simulate removed hardware, not renderer geometry.
    await app.evaluate(() => {
      globalThis.glimpseletTest.setDisplay({
        id: 200,
        bounds: { x: 0, y: 0, width: 900, height: 700 },
        workArea: { x: 0, y: 0, width: 900, height: 700 },
        scaleFactor: 1.5,
      });
    });
    await page.waitForTimeout(500);
    expect(
      (await page.evaluate(() => window.desktop.state().shell)).displayId,
    ).toBe("200");
    await app.evaluate(({ screen }) =>
      screen.emit("display-removed", {}, { id: 200 }),
    );
    await page.waitForTimeout(500);
    expect(
      (await page.evaluate(() => window.desktop.state().shell)).displayId,
    ).not.toBe("200");
    expect((await page.evaluate(() => window.desktop.state().shell)).edge).toBe(
      "left",
    );
  } finally {
    await app.close();
  }
  const again = await launch({ data });
  try {
    expect(
      (await again.page.evaluate(() => window.desktop.state().shell)).edge,
    ).toBe("left");
    expect(
      (await again.page.evaluate(() => window.desktop.state().shell)).pinned,
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
      await page.evaluate(() =>
        window.glimpselet.shell({ type: "pin", value: true }),
      );
      await page.waitForTimeout(700);
      const s = await page.evaluate(() => window.desktop.state());
      native([
        { type: "move", x: b.x + s.anchor.x - 18, y: b.y + s.anchor.y + 10 },
        { type: "down" },
        { type: "move", x, y, wait: 0.2 },
      ]);
      await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
      await page.evaluate(() =>
        window.glimpselet.shell({ type: "pin", value: false }),
      );
      native([{ type: "up" }, { type: "move", x: 30, y: 30 }]);
      await page.waitForTimeout(900);
      const dropped = await page.evaluate(() => window.desktop.state());
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
      await page.evaluate(() =>
        window.glimpselet.shell({ type: "pin", value: true }),
      );
      await page.waitForTimeout(700);
      for (const button of await page.getByRole("button").all()) {
        await button.hover();
        await page.waitForTimeout(200);
        expect(
          await button.evaluate((e) => {
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
    const b = await background(app);
    move(40, 40);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    move(b.x + b.width - 18, b.y + b.height - 100);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(650);
    const chat = await page
      .getByRole("button", { name: "對話", exact: true })
      .boundingBox();
    const opening = app.waitForEvent("window");
    click(b.x + chat.x + chat.width / 2, b.y + chat.y + chat.height / 2);
    const cardPage = await opening;
    await cardPage.waitForURL("**/card.html");
    await expect(cardPage.getByRole("textbox", { name: "訊息" })).toBeVisible();
    await cardPage
      .getByRole("textbox")
      .fill("Focus stays here while composing.");
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.card.isFocused()),
    ).toBe(true);
    await cardPage.getByRole("button", { name: "釘選對話" }).click();
    await shot(app, "pinned-rounded-card");
    const cb = await app.evaluate(() =>
      globalThis.glimpseletTest.card.getBounds(),
    );
    const clicks = await app.evaluate(() =>
      globalThis.bg.webContents.executeJavaScript("clicks.length"),
    );
    click(cb.x + 9, cb.y + 9);
    expect(
      await app.evaluate(() =>
        globalThis.bg.webContents.executeJavaScript("clicks.length"),
      ),
    ).toBe(clicks + 1);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    click(40, 40);
    await page.waitForTimeout(1900);
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.card.isVisible()),
    ).toBe(true);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await page.evaluate(() =>
      window.glimpselet.shell({ type: "pin", value: false }),
    );
    await page.waitForTimeout(1900);
    expect(
      await app.evaluate(() => globalThis.glimpseletTest.card.isVisible()),
    ).toBe(false);
    expect(await app.evaluate(() => globalThis.bg.isFocused())).toBe(true);
    await page.evaluate(() => window.glimpselet.action("chat"));
    await cardPage.getByRole("button", { name: "關閉對話" }).click();
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
        await page.evaluate(() =>
          window.glimpselet.shell({ type: "pin", value: true }),
        );
        await page.waitForTimeout(750);
        expect(
          await page.evaluate(
            () => matchMedia("(prefers-color-scheme: dark)").matches,
          ),
        ).toBe(theme === "dark");
        await expect(page.getByRole("button")).toHaveCount(8);
        for (const label of [
          "截取畫面",
          "選取區域",
          "整頁截圖",
          "導覽",
          "自動解說",
          "對話",
          "設定",
          "說明",
        ]) {
          const button = page.getByRole("button", { name: label, exact: true });
          await button.hover();
          await page.waitForTimeout(250);
          expect(
            await button.evaluate((e) => {
              const r = e.getBoundingClientRect(),
                caption = e.querySelector(".caption"),
                c = caption.getBoundingClientRect();
              return (
                r.x >= 0 &&
                r.y >= 0 &&
                r.right <= innerWidth &&
                r.bottom <= innerHeight &&
                c.right <= r.right &&
                c.bottom <= r.bottom &&
                caption.scrollWidth <= caption.clientWidth + 1
              );
            }),
          ).toBe(true);
        }
        await shot(app, `menu-${scale * 100}-${theme}`);
        await page.evaluate(() => window.glimpselet.action("chat"));
        const cardPage = app
          .windows()
          .find((p) => p.url().endsWith("card.html"));
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
        await cardPage.getByRole("button", { name: "關閉對話" }).click();
        // Closing clears pin; keep the menu open for its independent frame sample.
        await page.evaluate(() =>
          window.glimpselet.shell({ type: "pin", value: true }),
        );
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
          window.glimpselet.shell({ type: "pin", value: false }),
        );
        await page.waitForTimeout(1520);
        const before = await page
          .locator(".action")
          .evaluateAll((els) => els.map((e) => +getComputedStyle(e).opacity));
        await page.waitForTimeout(100);
        const after = await page
          .locator(".action")
          .evaluateAll((els) => els.map((e) => +getComputedStyle(e).opacity));
        expect(after[7]).toBeLessThanOrEqual(before[7]);
        expect(after[0]).toBeGreaterThanOrEqual(after[7]);
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
