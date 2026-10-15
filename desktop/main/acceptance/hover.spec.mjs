import { test, expect } from "@playwright/test";
import x11 from "x11";
import { cardBounds } from "../placement.mjs";
import { launch, native, move, click, wheel, keys } from "./support.mjs";
import { reveal, clickBlink, bubble, background, shot } from "./helpers.mjs";

const bubblesPage = (app) =>
  app
    .windows()
    .find(
      (p) =>
        p.url().includes("composer/index.html") &&
        !p.url().includes("surface=card"),
    );
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const fillDeck = (app, count = 14) =>
  app.evaluate((_electron, count) => {
    for (let i = 0; i < count; i++) {
      const text = `Answer sentence number ${i} for the deck.`;
      globalThis.blinklingTest.send({
        type: "message",
        id: `deck-${i}`,
        role: "assistant",
        content: [{ type: "text", text }],
        complete: true,
      });
    }
  }, count);
const composerState = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return { visible: !!c && c.isVisible(), focused: !!c && c.isFocused() };
  });
/** The mini composer, which a plain click on Blink opens, is on screen and has the keyboard. */
const miniState = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const mini = BrowserWindow.getAllWindows().find((w) =>
      /\/mini\/index\.html$/.test(w.webContents.getURL()),
    );
    return Boolean(mini?.isVisible() && mini.isFocused());
  });
const miniPage = (app) =>
  app.windows().find((p) => /\/mini\/index\.html$/.test(p.url()));
const nativeId = (app, name) =>
  app.evaluate(
    (_electron, name) =>
      globalThis.blinklingTest[name].getNativeWindowHandle().readUInt32LE(0),
    name,
  );
/** Root children, bottom to top, as the X server stacks them. */
function rootStack() {
  return new Promise((resolve, reject) => {
    const client = x11.createClient((error, display) => {
      if (error) return reject(error);
      client.QueryTree(display.screen[0].root, (error, tree) => {
        client.terminate();
        if (error) reject(error);
        else resolve(tree.children);
      });
    });
    client.on("error", reject);
  });
}
async function openCard(app, page) {
  // The card window is created once and then reused.
  // A click on Blink while it waits on a permission request opens the full
  // card; a plain click opens the mini composer (N5.1).
  await page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
  await expect.poll(() => !!cardPage(app)).toBe(true);
  const card = cardPage(app);
  await expect(card.getByRole("textbox", { name: "輸入問題" })).toBeVisible();
  await expect.poll(() => composerState(app).then((s) => s.focused)).toBe(true);
  // The card keeps asking for the keyboard for its first 250 ms (the window
  // manager may hand it elsewhere); a click away after that is the user's.
  await page.waitForTimeout(400);
  return card;
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("on X11 hover ends and the wheel scrolls the deck even when Electron's cursor point is stale", async () => {
  const { app, page } = await launch();
  try {
    await background(app);
    await reveal(page);
    // Electron's own cursor point freezes while the pointer is over other clients.
    await app.evaluate(({ screen }) => {
      const frozen = screen.getCursorScreenPoint();
      screen.getCursorScreenPoint = () => frozen;
    });
    move(40, 40);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 2500,
    });
    await fillDeck(app);
    const bubbles = bubblesPage(app);
    await expect
      .poll(() => bubbles.locator(".gl-answer-bubble").count())
      .toBeGreaterThan(8);
    const target = await bubbles.evaluate(() => {
      const deck = document.querySelector(".gl-bubble-deck");
      const r = [...deck.querySelectorAll(".gl-answer-bubble")]
        .map((n) => n.getBoundingClientRect())
        .find((r) => r.top > 40 && r.bottom < innerHeight - 40);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.bubbles.getBounds();
      return { x: b.x, y: b.y };
    });
    const top = () =>
      bubbles.evaluate(
        () => document.querySelector(".gl-bubble-deck").scrollTop,
      );
    const before = await top();
    // Let the pointer settle on the deck first, as a person's hand would.
    move(origin.x + target.x, origin.y + target.y);
    await page.waitForTimeout(300);
    wheel(origin.x + target.x, origin.y + target.y, -4);
    await expect.poll(top).toBeLessThan(before - 20);
    expect(
      await app.evaluate(() => globalThis.blinklingTest.pointer.source),
    ).toBe("x11");
  } finally {
    await app.close();
  }
});

test("the deck follows Blink to each of the four edges", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await fillDeck(app, 4);
    for (const [edge, x, y] of [
      ["bottom", 640, 790],
      ["left", 10, 400],
      ["right", 1270, 400],
      ["top", 640, 10],
    ]) {
      await reveal(page);
      await page.waitForTimeout(700);
      const s = await page.evaluate(() => window.desktop.inspect());
      native([
        { type: "move", x: b.x + s.anchor.x - 18, y: b.y + s.anchor.y + 10 },
        { type: "down" },
        {
          type: "move",
          x: Math.max(0, x - 18),
          y: Math.max(0, y - 52),
          wait: 0.2,
        },
      ]);
      await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
      native([{ type: "up" }, { type: "move", x: 400, y: 700 }]);
      await expect
        .poll(() =>
          app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
        )
        .toBe(edge);
      const { display, position } = await app.evaluate(() =>
        globalThis.blinklingTest.snapshot(),
      );
      const expected = cardBounds(display, position);
      expect(
        await app.evaluate(() => globalThis.blinklingTest.bubbles.getBounds()),
        `deck at the ${edge} edge`,
      ).toEqual(expected);
      await shot(app, `deck-follows-${edge}`);
    }
  } finally {
    await app.close();
  }
});

test("with bubbles present Blink stays above the deck and every menu bubble is clickable", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await app.evaluate(() => {
      globalThis.actions = [];
      for (const action of ["capture", "guide", "auto-explain", "settings"])
        globalThis.blinklingTest.registerAction(action, () => {
          globalThis.actions.push(action);
          return { ok: true, enabled: action === "auto-explain" };
        });
    });
    await fillDeck(app, 10);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.bubbles.isVisible()),
      )
      .toBe(true);
    await reveal(page);
    await page.waitForTimeout(700);
    const [blink, bubbles] = await Promise.all([
      nativeId(app, "blink"),
      nativeId(app, "bubbles"),
    ]);
    const stack = await rootStack();
    expect(stack.indexOf(bubbles)).toBeGreaterThan(-1);
    expect(stack.indexOf(blink)).toBeGreaterThan(stack.indexOf(bubbles));
    await shot(app, "menu-over-deck");
    let count = 0;
    for (const action of ["capture", "guide", "auto-explain", "settings"]) {
      const r = await bubble(page, action).boundingBox();
      click(b.x + r.x + r.width / 2, b.y + r.y + r.height / 2);
      await expect
        .poll(() => app.evaluate(() => globalThis.actions.length))
        .toBe(++count);
    }
    await reveal(page);
    await page.waitForTimeout(500);
    await clickBlink(page);
    await expect.poll(() => miniState(app)).toBe(true);
  } finally {
    await app.close();
  }
});

test("the card stays open while typing, holding a chip or a dialog, and still closes on Esc and on leave when empty", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  try {
    await background(app);
    const away = () => click(40, 40);
    const settle = (ms = 3600) => page.waitForTimeout(ms);
    // A non-empty draft keeps it, even without focus and with the pointer far away.
    await reveal(page);
    let card = await openCard(app, page);
    const box = card.getByRole("textbox", { name: "輸入問題" });
    await box.fill("a half written question");
    away();
    await settle();
    expect((await composerState(app)).visible).toBe(true);
    await shot(app, "card-kept-draft");
    expect(await box.inputValue()).toBe("a half written question");
    // Emptying it releases it: the card then closes on leave.
    await box.fill("");
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // Focus alone keeps it.
    await reveal(page);
    card = await openCard(app, page);
    move(60, 60);
    await settle();
    expect(await composerState(app)).toEqual({ visible: true, focused: true });
    away();
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // A pending chip keeps it (right after a capture the draft is empty).
    await reveal(page);
    card = await openCard(app, page);
    await card.locator('input[type="file"]').setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    away();
    await settle();
    expect((await composerState(app)).visible).toBe(true);
    await shot(app, "card-kept-chip");
    await card.getByRole("button", { name: /移除/ }).click();
    await card.mouse.move(-20, -20); // the click above was a synthetic pointer
    away();
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // The attach dialog keeps it while it is open.
    await reveal(page);
    card = await openCard(app, page);
    const chooser = card.waitForEvent("filechooser");
    await card.getByRole("button", { name: "加入附件" }).first().click();
    const dialog = await chooser;
    await card.mouse.move(-20, -20);
    away();
    await settle();
    expect((await composerState(app)).visible).toBe(true);
    await dialog.setFiles([]);
    away();
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // Esc is explicit: it closes at once, even with a draft.
    await reveal(page);
    card = await openCard(app, page);
    await card.getByRole("textbox", { name: "輸入問題" }).fill("discard me");
    await card.keyboard.press("Escape");
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 1000 })
      .toBe(false);
  } finally {
    await app.close();
  }
});

test("after an area capture the mini composer and its text box have focus and typing lands in the draft", async () => {
  test.setTimeout(90000);
  const { app, page } = await launch();
  try {
    await background(app);
    // The overlay windows exist from the start and are shown on demand. The
    // capture call answers only when the capture ends, so it is not awaited.
    await page.evaluate(() => void window.blinkling.action("capture"));
    let selector;
    await expect
      .poll(
        () => {
          selector = app
            .windows()
            .find((p) => /\/capture\/selection\.html$/.test(p.url()));
          return !!selector;
        },
        { timeout: 20000 },
      )
      .toBe(true);
    await expect(selector.locator("body")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await selector.mouse.move(400, 200);
    await selector.mouse.down();
    await selector.mouse.move(520, 290, { steps: 12 });
    // Releasing the drag takes the area; the shot flies into Blink.
    await selector.mouse.up();
    const mini = await (async () => {
      await expect
        .poll(() => miniPage(app)?.locator(".mini-entry-image").count())
        .toBe(1);
      return miniPage(app);
    })();
    await expect.poll(() => miniState(app)).toBe(true);
    expect(
      await mini.evaluate(
        () =>
          document.hasFocus() &&
          document.activeElement === document.querySelector(".mini-input"),
      ),
    ).toBe(true);
    // Real keyboard events through the X server, not Playwright's injection.
    keys("typed after capture");
    await expect(mini.locator(".mini-input")).toHaveValue(
      "typed after capture",
    );
    await shot(app, "mini-after-capture");
    // The capture stays in the mini composer after the pointer leaves.
    click(40, 40);
    await page.waitForTimeout(1500);
    await expect(mini.locator(".mini-entry-image")).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test("capture busy clears when delivery throws, hangs, or the selection never answers", async () => {
  const { app } = await launch();
  try {
    const outcome = await app.evaluate(async () => {
      const t = globalThis.blinklingTest;
      const service = t.features.capture;
      const id = String(t.snapshot().display.id);
      const result = {};
      const original = {
        onCapture: service.onCapture,
        select: service.select,
        limits: { ...service.limits },
      };
      service.limits.delivery = 300;
      service.limits.run = 600;
      const attempt = async (name) => {
        try {
          await service.screen(id);
          result[name] = "resolved";
        } catch (error) {
          result[name] = error.code ?? error.message;
        }
        result[`${name}Busy`] = service.busy;
      };
      service.onCapture = async () => {
        throw new Error("composer exploded");
      };
      await attempt("throws");
      service.onCapture = () => new Promise(() => {});
      await attempt("hangs");
      service.onCapture = original.onCapture;
      service.select = () => new Promise(() => {});
      try {
        await service.region(id);
        result.selection = "resolved";
      } catch (error) {
        result.selection = error.code ?? error.message;
      }
      result.selectionBusy = service.busy;
      service.select = original.select;
      service.limits = original.limits;
      return result;
    });
    expect(outcome).toEqual({
      throws: "composer exploded",
      throwsBusy: false,
      hangs: "CAPTURE_DELIVERY_TIMEOUT",
      hangsBusy: false,
      selection: "CAPTURE_TIMEOUT",
      selectionBusy: false,
    });
  } finally {
    await app.close();
  }
});

test("hovering on the top edge near a corner does not move Blink sideways", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await reveal(page);
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => window.desktop.inspect());
    native([
      { type: "move", x: b.x + s.anchor.x - 18, y: b.y + s.anchor.y + 10 },
      { type: "down" },
      { type: "move", x: 40, y: 0, wait: 0.2 },
    ]);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "drag");
    native([{ type: "up" }, { type: "move", x: 600, y: 600 }]);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
      )
      .toMatch(/top|left/);
    await page.waitForTimeout(2200);
    const rest = await app.evaluate(
      () => globalThis.blinklingTest.snapshot().position,
    );
    await reveal(page);
    await page.waitForTimeout(700);
    const hovered = await page.evaluate(() => window.desktop.inspect().anchor);
    const peekX = rest.edge === "top" ? rest.peek.x : rest.peek.x;
    if (rest.edge === "top")
      expect(Math.abs(hovered.x - peekX)).toBeLessThan(1.5);
    else expect(Math.abs(hovered.y - rest.peek.y)).toBeLessThan(1.5);
    await shot(app, "corner-hover");
  } finally {
    await app.close();
  }
});
