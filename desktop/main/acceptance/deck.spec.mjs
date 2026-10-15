import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { launch, move, wheel } from "./support.mjs";
import { reveal, shot, background } from "./helpers.mjs";

const bubblesPage = (app) =>
  app
    .windows()
    .find(
      (p) =>
        p.url().includes("composer/index.html") &&
        !p.url().includes("surface=card"),
    );
const say = (app, count) =>
  app.evaluate((_electron, count) => {
    for (let i = 0; i < count; i++)
      globalThis.blinklingTest.send({
        type: "message",
        id: `deck-${i}`,
        role: "assistant",
        content: [{ type: "text", text: `Answer sentence number ${i}.` }],
        complete: true,
      });
  }, count);
/** A real Chromium page, tall enough to scroll, under Blink and its deck. */
const tallPage = (app) =>
  app.evaluate(async ({ BrowserWindow, screen }) => {
    const bg = new BrowserWindow({
      ...screen.getPrimaryDisplay().bounds,
      frame: false,
      show: false,
      backgroundColor: "#204080",
    });
    await bg.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="margin:0;background:#204080"><div style="height:9000px"></div></body>',
        ),
    );
    bg.show();
    globalThis.tall = bg;
  });
const pageScroll = (app) =>
  app.evaluate(() => globalThis.tall.webContents.executeJavaScript("scrollY"));

test("the wheel over a bubble scrolls the deck only; over a gap it scrolls the page", async () => {
  const { app, page } = await launch();
  try {
    await tallPage(app);
    // Control: far from Blink and the deck, the wheel scrolls the page.
    wheel(200, 300, 2);
    await expect.poll(() => pageScroll(app)).toBeGreaterThan(0);
    await reveal(page);
    move(40, 40);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 2500,
    });
    await say(app, 14);
    const bubbles = bubblesPage(app);
    await expect
      .poll(() => bubbles.locator(".gl-answer-bubble").count())
      .toBeGreaterThan(8);
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.bubbles.isVisible()),
      )
      .toBe(true);
    // The deck must settle on the newest answer before the reader scrolls.
    await bubbles.waitForTimeout(500);
    const spots = await bubbles.evaluate(() => {
      const rects = [...document.querySelectorAll(".gl-answer-bubble")]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.top > 60 && r.bottom < innerHeight - 20);
      const [a, b] = rects.slice(-3);
      return {
        bubble: { x: a.x + a.width / 2, y: a.y + a.height / 2 },
        gap: { x: a.x + a.width / 2, y: (a.bottom + b.top) / 2 },
        gapSize: b.top - a.bottom,
      };
    });
    expect(spots.gapSize).toBeGreaterThanOrEqual(6);
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.bubbles.getBounds();
      return { x: b.x, y: b.y };
    });
    const deckTop = () =>
      bubbles.evaluate(
        () => document.querySelector(".gl-bubble-deck").scrollTop,
      );
    const at = (p) => [origin.x + p.x, origin.y + p.y];

    await page.waitForTimeout(600); // let the page's smooth scrolling finish
    const pageBefore = await pageScroll(app);
    const deckBefore = await deckTop();
    move(...at(spots.bubble));
    await page.waitForTimeout(300);
    wheel(...at(spots.bubble), -10);
    await expect.poll(deckTop).toBeLessThan(deckBefore - 20);
    await shot(app, "deck-wheel-over-bubble");
    expect(await pageScroll(app), "page under a bubble stays put").toBe(
      pageBefore,
    );

    move(...at(spots.gap));
    await page.waitForTimeout(300);
    wheel(...at(spots.gap), 4);
    await expect.poll(() => pageScroll(app)).toBeGreaterThan(pageBefore);
  } finally {
    await app.close();
  }
});

const newestVisible = (bubbles) =>
  bubbles.evaluate(async () => {
    // Two frames: one for the message to render, one to paint it.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const deck = document
      .querySelector(".gl-bubble-deck")
      .getBoundingClientRect();
    const last = [...document.querySelectorAll(".gl-answer-bubble")].at(-1);
    const r = last.getBoundingClientRect();
    return {
      text: last.textContent,
      top: r.top - deck.top,
      bottom: deck.bottom - r.bottom,
      scrollTop: document.querySelector(".gl-bubble-deck").scrollTop,
    };
  });
const sayOne = (app, id, text) =>
  app.evaluate(
    (_electron, { id, text }) =>
      globalThis.blinklingTest.send({
        type: "message",
        id,
        role: "assistant",
        content: [{ type: "text", text }],
        complete: true,
      }),
    { id, text },
  );

test("a new answer is fully visible within a frame, also for the second turn and auto explain", async () => {
  const { app, page } = await launch();
  try {
    await tallPage(app);
    await reveal(page);
    move(40, 40);
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 2500,
    });
    await say(app, 14);
    const bubbles = bubblesPage(app);
    await expect
      .poll(() => bubbles.locator(".gl-answer-bubble").count())
      .toBeGreaterThan(8);
    await bubbles.waitForTimeout(400);
    await sayOne(app, "second-turn", "Second turn answer.");
    const second = await newestVisible(bubbles);
    expect(second.text).toContain("Second turn answer.");
    expect(
      second.bottom,
      "newest bubble inside the deck",
    ).toBeGreaterThanOrEqual(0);
    expect(second.top).toBeGreaterThanOrEqual(0);
    await shot(app, "deck-second-turn");

    // The reader scrolls back over the deck; the next answer waits a few
    // seconds for them, then a new bubble is shown again.
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.bubbles.getBounds();
      return { x: b.x, y: b.y };
    });
    move(origin.x + 220, origin.y + 360);
    await page.waitForTimeout(300);
    wheel(origin.x + 220, origin.y + 360, -6);
    await page.waitForTimeout(500);
    const reading = await newestVisible(bubbles);
    expect(reading.bottom, "the reader's position is kept").toBeLessThan(0);
    await page.waitForTimeout(4500);
    await sayOne(app, "auto-explain", "Auto explain says hello.");
    const auto = await newestVisible(bubbles);
    expect(auto.text).toContain("Auto explain says hello.");
    expect(auto.bottom).toBeGreaterThanOrEqual(0);
    expect(auto.top).toBeGreaterThanOrEqual(0);
  } finally {
    await app.close();
  }
});

const peek = async (app, page, scale = 1) => {
  await reveal(page, scale);
  move(40 * scale, 40 * scale);
  await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
    timeout: 2500,
  });
};

for (const scale of [1, 1.5, 2])
  for (const theme of ["light", "dark"])
    test(`the deck fades by distance with a top mask at ${scale * 100}% ${theme}`, async () => {
      const { app, page } = await launch({ scale, theme });
      try {
        await peek(app, page, scale);
        await say(app, 14);
        const bubbles = bubblesPage(app);
        // The deck follows the OS scheme; headless Linux has no setting to read.
        await bubbles.emulateMedia({ colorScheme: theme });
        await expect
          .poll(() => bubbles.locator(".gl-answer-bubble").count())
          .toBeGreaterThan(8);
        await bubbles.waitForTimeout(600);
        const deck = await bubbles.evaluate(() => {
          const host = document.querySelector(".gl-bubble-deck");
          const box = host.getBoundingClientRect();
          const inside = [...document.querySelectorAll(".gl-answer-bubble")]
            .map((n) => ({ n, r: n.getBoundingClientRect() }))
            .filter(({ r }) => r.bottom > box.top && r.top < box.bottom);
          const style = getComputedStyle(host);
          const surface = getComputedStyle(inside.at(-1).n);
          return {
            mask: style.maskImage || style.webkitMaskImage,
            opacities: inside.map(({ n }) =>
              Number(getComputedStyle(n).opacity),
            ),
            clippedAtTop: inside[0].r.top < box.top + 1,
            background: surface.backgroundColor,
            transition: surface.transitionProperty,
            dark: matchMedia("(prefers-color-scheme: dark)").matches,
          };
        });
        expect(deck.dark).toBe(theme === "dark");
        expect(deck.mask).toContain("linear-gradient");
        expect(deck.opacities.at(-1)).toBe(1);
        expect(deck.opacities[0]).toBeLessThan(deck.opacities.at(-1));
        expect(deck.opacities).toEqual(
          [...deck.opacities].sort((a, b) => a - b),
        );
        expect(deck.background, "the bubble surface is opaque").toMatch(
          /^rgb\(/,
        );
        await shot(app, `deck-fade-${scale * 100}-${theme}`);
      } finally {
        await app.close();
      }
    });

test("the first bubble shows within a frame of the first sentence, not the whole answer", async () => {
  const { app, page } = await launch();
  try {
    await peek(app, page);
    const bubbles = bubblesPage(app);
    await bubbles.evaluate(() => {
      window.timeline = { seen: [] };
      new MutationObserver(() => {
        for (const n of document.querySelectorAll(".gl-answer-bubble")) {
          const text = n.textContent;
          for (const key of ["First sentence.", "longer"])
            if (text.includes(key) && !window.timeline[key])
              window.timeline[key] = performance.now();
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      window.blinkling.onEvent((event) => {
        const text = event.text ?? "";
        if (event.type === "delta" && text.includes("First sentence."))
          window.timeline.delta = performance.now();
      });
    });
    await app.evaluate(
      (_electron, id) =>
        globalThis.blinklingTest.session.send({
          id,
          text: "slow: tell me",
          attachments: [],
          source: "auto-explain",
        }),
      randomUUID(),
    );
    await expect
      .poll(() => bubbles.evaluate(() => window.timeline.longer ?? 0), {
        timeout: 10000,
      })
      .toBeGreaterThan(0);
    const t = await bubbles.evaluate(() => window.timeline);
    expect(t.delta, "the first sentence arrived").toBeGreaterThan(0);
    expect(
      t["First sentence."] - t.delta,
      "first bubble within a frame of its sentence",
    ).toBeLessThanOrEqual(40);
    expect(
      t.longer - t["First sentence."],
      "the first bubble did not wait for the rest",
    ).toBeGreaterThan(300);
    await shot(app, "deck-first-sentence");
  } finally {
    await app.close();
  }
});

test("reference badges show a number, report hover and scroll to their bubble on a mark click", async () => {
  const { app, page } = await launch();
  try {
    await peek(app, page);
    await app.evaluate(() => {
      const send = globalThis.blinklingTest.send;
      send({
        type: "message",
        id: "ref-first",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Press [[1:btn-save|Save button]] to keep it.",
          },
        ],
        complete: true,
      });
      for (let i = 0; i < 14; i++)
        send({
          type: "message",
          id: `ref-filler-${i}`,
          role: "assistant",
          content: [{ type: "text", text: `Filler sentence number ${i}.` }],
          complete: true,
        });
    });
    const bubbles = bubblesPage(app);
    const badge = bubbles.locator(".gl-ref");
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("1");
    expect(
      await bubbles.locator(".gl-answer-bubble").first().textContent(),
    ).not.toContain("btn-save");
    await bubbles.waitForTimeout(600);
    // The reference bubble is far above the newest one; a mark click brings it in.
    const inView = () =>
      bubbles.evaluate(() => {
        const deck = document
          .querySelector(".gl-bubble-deck")
          .getBoundingClientRect();
        const r = document.querySelector(".gl-ref").getBoundingClientRect();
        return r.top >= deck.top && r.bottom <= deck.bottom;
      });
    expect(await inView()).toBe(false);
    await app.evaluate(() =>
      globalThis.blinklingTest.deck.markClick("btn-save"),
    );
    await expect.poll(inView).toBe(true);
    await shot(app, "deck-mark-click");
    // Hovering the badge tells the shell which reference it is.
    const box = await badge.boundingBox();
    const origin = await app.evaluate(() => {
      const b = globalThis.blinklingTest.bubbles.getBounds();
      return { x: b.x, y: b.y };
    });
    move(origin.x + box.x + box.width / 2, origin.y + box.y + box.height / 2);
    await expect
      .poll(() => app.evaluate(() => globalThis.blinklingTest.deck.hovered))
      .toContain("btn-save");
  } finally {
    await app.close();
  }
});

/** Screen-space boxes of the visible deck bubbles and of the open fan. */
const screenBoxes = (app, page) =>
  Promise.all([
    app.evaluate(() => globalThis.blinklingTest.bubbles.getBounds()),
    app.evaluate(() => globalThis.blinklingTest.snapshot().display.bounds),
  ]).then(async ([at, display]) => ({
    bubbles: await bubblesPage(app).evaluate(
      ([x, y]) =>
        [...document.querySelectorAll(".gl-answer-bubble")]
          .filter(
            (n) =>
              n.closest(".gl-bubble-deck").dataset.visible === "true" &&
              Number(getComputedStyle(n).opacity) > 0.05,
          )
          .map((n) => {
            const r = n.getBoundingClientRect();
            return {
              x: r.x + x,
              y: r.y + y,
              width: r.width,
              height: r.height,
            };
          }),
      [at.x, at.y],
    ),
    fan: await page.locator(".action-bubble").evaluateAll(
      (nodes, [x, y]) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x + x, y: r.y + y, width: r.width, height: r.height };
        }),
      [display.x, display.y],
    ),
  }));
const intersects = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

test("hover recall of the last answer never overlaps the fan bubbles", async () => {
  const { app, page } = await launch();
  try {
    // The real pointer outlives the app: park it away from the deck so the
    // previous test's hover cannot hold the fade timer.
    move(2, 2);
    await background(app);
    await say(app, 3);
    const bubbles = bubblesPage(app);
    await expect(bubbles.locator(".gl-answer-bubble")).toHaveCount(3);
    // The answer settles and fades by itself (N6.6), then Blink is hovered.
    await expect
      .poll(
        () => bubbles.locator('.gl-bubble-deck[data-visible="true"]').count(),
        {
          timeout: 20000,
        },
      )
      .toBe(0);
    await reveal(page);
    await expect(
      bubbles.locator('.gl-bubble-deck[data-visible="true"]'),
    ).toHaveCount(1);
    await expect(page.locator(".action-bubble")).toHaveCount(4);
    await bubbles.waitForTimeout(900);
    const { bubbles: deck, fan } = await screenBoxes(app, page);
    expect(deck.length).toBeGreaterThan(0);
    expect(fan).toHaveLength(4);
    await shot(app, "recall-with-fan");
    for (const a of deck)
      for (const b of fan) expect(intersects(a, b)).toBe(false);
  } finally {
    await app.close();
  }
});

test("hover recall and a fresh answer never overlap the fan, at any edge or position", async () => {
  const { app, page } = await launch();
  try {
    await background(app);
    await say(app, 3);
    const bubbles = bubblesPage(app);
    for (const [edge, ratio] of [
      ["bottom", 0.5],
      ["bottom", 0],
      ["bottom", 1],
      ["top", 0.5],
      ["top", 0],
      ["top", 1],
      ["left", 0.5],
      ["left", 0],
      ["left", 1],
      ["right", 0.1],
      ["right", 0.5],
      ["right", 1],
    ]) {
      await app.evaluate(
        async ({ screen }, { edge, ratio }) => {
          const t = globalThis.blinklingTest;
          await t.positionStore.save(t.snapshot().display.id, { edge, ratio });
          t.setDisplay(screen.getPrimaryDisplay());
        },
        { edge, ratio },
      );
      await page.waitForTimeout(500);
      await reveal(page);
      await bubbles.waitForTimeout(900);
      const { bubbles: deck, fan } = await screenBoxes(app, page);
      expect(fan, `${edge} ${ratio}`).toHaveLength(4);
      for (const a of deck)
        for (const b of fan)
          expect(intersects(a, b), `${edge} ${ratio}`).toBe(false);
    }
  } finally {
    await app.close();
  }
});
