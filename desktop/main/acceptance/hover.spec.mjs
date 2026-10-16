import { test, expect } from "@playwright/test";
import x11 from "x11";
import { cardBounds } from "../placement.mjs";
import { launch, native, move, click, wheel } from "./support.mjs";
import {
  reveal,
  onBlink,
  clickBlink,
  bubble,
  background,
  shot,
} from "./helpers.mjs";

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
/** Messages for the history, then a streaming answer so the card opens by itself. */
const fillHistory = (app, count = 14) =>
  app.evaluate((_electron, count) => {
    const { session } = globalThis.blinklingTest;
    for (let i = 0; i < count; i++)
      session.emit({
        type: "message",
        id: `history-${i}`,
        role: i % 2 ? "assistant" : "user",
        content: [
          { type: "text", text: `Message number ${i} in the history.` },
        ],
      });
    session.emit({ type: "delta", id: "latest", text: "The newest line." });
  }, count);
const composerState = (app) =>
  app.evaluate(() => {
    const c = globalThis.blinklingTest.composer;
    return { visible: !!c && c.isVisible(), focused: !!c && c.isFocused() };
  });
const nativeId = (app, name) =>
  app.evaluate(
    (_electron, name) =>
      globalThis.blinklingTest[name].getNativeWindowHandle().readUInt32LE(0),
    name,
  );
/** Where a window sits among the root's children, bottom to top, as the X
 * server stacks them. A window the manager framed counts as its frame. */
function stackIndex(...ids) {
  return new Promise((resolve, reject) => {
    const client = x11.createClient((error, display) => {
      if (error) return reject(error);
      const query = (window) =>
        new Promise((done, fail) =>
          client.QueryTree(window, (e, tree) => (e ? fail(e) : done(tree))),
        );
      (async () => {
        const root = await query(display.screen[0].root);
        const framed = new Map();
        for (const child of root.children) {
          const tree = await query(child).catch(() => ({ children: [] }));
          framed.set(child, tree.children);
        }
        return ids.map((id) =>
          root.children.findIndex(
            (child) => child === id || framed.get(child).includes(id),
          ),
        );
      })()
        .then(resolve, reject)
        .finally(() => client.terminate());
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

test("on X11 hover ends and the wheel scrolls the card history even when Electron's cursor point is stale", async () => {
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
    await fillHistory(app, 40);
    await expect.poll(() => !!cardPage(app)).toBe(true);
    const card = cardPage(app);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
      )
      .toBe(true);
    const top = () =>
      card.evaluate(() => document.querySelector(".gl-chat-history").scrollTop);
    await expect
      .poll(() =>
        card.evaluate(() => {
          const n = document.querySelector(".gl-chat-history");
          return n.scrollHeight - n.clientHeight - n.scrollTop;
        }),
      )
      .toBeLessThan(3);
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.composer.getBounds();
      return { x: b.x + b.width / 2, y: b.y + b.height / 3 };
    });
    const before = await top();
    // Let the pointer settle on the card first, as a person's hand would.
    move(origin.x, origin.y);
    await page.waitForTimeout(300);
    wheel(origin.x, origin.y, -4);
    await expect.poll(top).toBeLessThan(before - 20);
    expect(
      await app.evaluate(() => globalThis.blinklingTest.pointer.source),
    ).toBe("x11");
  } finally {
    await app.close();
  }
});

test("the card follows Blink to each of the four edges", async () => {
  const { app, page } = await launch();
  try {
    const b = await background(app);
    await fillHistory(app, 4);
    for (const [edge, x, y] of [
      ["bottom", 640, 790],
      ["left", 10, 400],
      ["right", 1270, 400],
      ["top", 640, 10],
    ]) {
      await onBlink(page);
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
      // The card is as tall as its content needs, so the height comes from
      // the shell; the placement itself is checked against the pure module.
      const wanted = await app.evaluate(
        () => globalThis.blinklingTest.composer.getBounds().height,
      );
      const expected = cardBounds(display, position, undefined, wanted);
      expect(
        await app.evaluate(() => globalThis.blinklingTest.composer.getBounds()),
        `card at the ${edge} edge`,
      ).toEqual(expected);
      await shot(app, `card-follows-${edge}`);
    }
  } finally {
    await app.close();
  }
});

test("with the card open Blink stays above it and every menu bubble is clickable", async () => {
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
    await fillHistory(app, 10);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.composer.isVisible()),
      )
      .toBe(true);
    await page.waitForTimeout(700);
    const [blink, composer] = await Promise.all([
      nativeId(app, "blink"),
      nativeId(app, "composer"),
    ]);
    const [blinkAt, composerAt] = await stackIndex(blink, composer);
    expect(composerAt).toBeGreaterThan(-1);
    expect(blinkAt).toBeGreaterThan(composerAt);
    // A click on Blink swaps the card for the menu; the card is not covered by it.
    await onBlink(page);
    await clickBlink(page);
    await page.waitForFunction(() => window.desktop.inspect().fan.rested);
    await page.waitForTimeout(450);
    await shot(app, "menu-over-card");
    let count = 0;
    // The full screen bubble closes the menu when it is used, so it goes last.
    for (const action of ["guide", "auto-explain", "settings", "capture"]) {
      const r = await bubble(page, action).boundingBox();
      click(b.x + r.x + r.width / 2, b.y + r.y + r.height / 2);
      await expect
        .poll(() => app.evaluate(() => globalThis.actions.length))
        .toBe(++count);
    }
    await page.waitForTimeout(500);
    expect(
      (
        await app.evaluate(() =>
          globalThis.blinklingTest.nBlinkMenuFaces.interaction(),
        )
      ).menu,
    ).toBe(false);
    await clickBlink(page);
    await expect
      .poll(() => composerState(app).then((s) => s.visible))
      .toBe(true);
  } finally {
    await app.close();
  }
});

test("a click outside closes the card with a draft or a chip in it and the page keeps them; an open dialog keeps it; Esc closes at once", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  try {
    await background(app);
    const away = () => click(40, 40);
    // A click outside Blinkling takes the keyboard away from a focused card.
    const leave = async (card) => {
      const box = await card.getByRole("textbox").boundingBox();
      const at = await app.evaluate(() =>
        globalThis.blinklingTest.composer.getBounds(),
      );
      click(at.x + box.x + box.width / 2, at.y + box.y + box.height / 2);
      await expect
        .poll(() => composerState(app).then((s) => s.focused))
        .toBe(true);
      away();
    };
    const settle = (ms = 3600) => page.waitForTimeout(ms);
    // A click outside closes the card even over a draft: the page keeps the text.
    await reveal(page);
    let card = await openCard(app, page);
    const box = card.getByRole("textbox", { name: "輸入問題" });
    await box.fill("a half written question");
    away();
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);
    await reveal(page);
    card = await openCard(app, page);
    expect(
      await card.getByRole("textbox", { name: "輸入問題" }).inputValue(),
    ).toBe("a half written question");
    await card.getByRole("textbox", { name: "輸入問題" }).fill("");
    await leave(card);
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // Focus alone keeps it.
    await reveal(page);
    card = await openCard(app, page);
    move(60, 60);
    await settle();
    expect(await composerState(app)).toEqual({ visible: true, focused: true });
    await leave(card);
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);

    // A pending chip does not hold the card open either, and is still there on return.
    await reveal(page);
    card = await openCard(app, page);
    await card.locator('input[type="file"]').setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    away();
    await expect
      .poll(() => composerState(app).then((s) => s.visible), { timeout: 5000 })
      .toBe(false);
    await reveal(page);
    card = await openCard(app, page);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(1);
    await card.getByRole("button", { name: /移除/ }).click();
    await card.mouse.move(-20, -20); // the click above was a synthetic pointer
    await leave(card);
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
    await leave(card);
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
        open: service.overlays.open,
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
      service.overlays.open = () => new Promise(() => {});
      try {
        await service.pick(id);
        result.selection = "resolved";
      } catch (error) {
        result.selection = error.code ?? error.message;
      }
      result.selectionBusy = service.busy;
      service.overlays.open = original.open;
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
