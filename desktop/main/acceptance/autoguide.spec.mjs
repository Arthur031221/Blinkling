import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { launch, move, click, key } from "./support.mjs";
import { background, reveal, bubble } from "./helpers.mjs";
import { record } from "./record.mjs";

const read = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );
/** A session that answers a guide request with a guide of the test page and
 * anything else with one line, after `delay` ms. */
const fakeSession = (app, delay = 150) =>
  app.evaluate((_, delay) => {
    const listeners = new Set();
    const guide = {
      purpose: "A blue page with a sentence on it.",
      title: "Test page",
      sections: [
        {
          id: "s1",
          rect: { x: 20, y: 20, width: 500, height: 120 },
          label: "Heading",
          description: "The sentence at the top",
          paragraphs: ["It names the page."],
        },
        {
          id: "s2",
          rect: { x: 20, y: 300, width: 600, height: 300 },
          label: "Body",
          description: "The empty area",
          paragraphs: ["Nothing is written here."],
        },
      ],
      steps: [
        { id: "t1", note: "Read the heading.", regionIds: ["s1"] },
        { id: "t2", note: "Look at the empty body.", regionIds: ["s2"] },
      ],
    };
    globalThis.fakeTurns = [];
    globalThis.blinklingTest.features.setSession({
      subscribe: (f) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      send: async (turn) => {
        globalThis.fakeTurns.push({ ...turn, at: Date.now() });
        const text =
          turn.source === "guide"
            ? JSON.stringify(guide)
            : "This is a blue test page.\n\nIt has one sentence.";
        setTimeout(() => {
          for (const f of listeners) {
            f({
              type: "message",
              role: "assistant",
              content: [{ type: "text", text }],
            });
            f({ type: "done", turnId: turn.id });
          }
        }, delay);
      },
      stop: async () => {},
    });
  }, delay);
const stall = (app) =>
  app.evaluate(() => {
    const watch = (globalThis.__stall = {
      worst: 0,
      last: Date.now(),
      all: [],
    });
    watch.timer = setInterval(() => {
      const now = Date.now();
      const gap = now - watch.last - 10;
      watch.worst = Math.max(watch.worst, gap);
      if (gap > 40) watch.all.push(gap);
      watch.last = now;
    }, 10);
  });
const stalled = (app) =>
  app.evaluate(() => {
    clearInterval(globalThis.__stall.timer);
    return { worst: globalThis.__stall.worst, all: globalThis.__stall.all };
  });
async function clickBubble(page, action, origin) {
  const box = await bubble(page, action).boundingBox();
  const at = {
    x: origin.x + box.x + box.width / 2,
    y: origin.y + box.y + box.height / 2,
  };
  move(at.x, at.y);
  await page.waitForTimeout(300);
  click(at.x, at.y);
  return Date.now();
}
const overlayShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("/overlay/"),
    ),
  );
const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const cardShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("surface=card"),
    ),
  );
const guideText = (app) =>
  cardPage(app)
    ?.locator(".gl-guide")
    .innerText()
    .catch(() => "") ?? "";

test("Guide: one click on the bubble says it is looking at once, draws the marks, walks the steps and ends cleanly, without the app standing still", async () => {
  test.setTimeout(150000);
  const { app, page } = await launch();
  const rec = record("guide_v1-321");
  try {
    const frame = await background(app);
    await fakeSession(app, 1200);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await reveal(page);
    rec.frame("menu");
    await stall(app);
    const clicked = await clickBubble(page, "guide", frame);
    // Within 150 ms of the click the card says the screen is being looked at.
    await expect
      .poll(() => guideText(app), { intervals: [10], timeout: 3000 })
      .toContain("…");
    const feedback = Date.now() - clicked;
    expect(feedback).toBeLessThan(400);
    rec.frame("looking");
    // The answer arrives; the marks are drawn and the overview is in the card.
    await expect.poll(() => overlayShown(app), { timeout: 8000 }).toBe(true);
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "A blue page with a sentence on it.",
      { timeout: 8000 },
    );
    rec.frame("overview");
    // All steps: the overview is a short list, one row per step, not a pile of
    // bubbles with the model's own sections.
    await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(2);
    await expect(cardPage(app).locator(".gl-answer-bubble")).toHaveCount(1);
    const cardButton = (action) =>
      cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);
    await cardButton("guide-next").click();
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "Read the heading.",
    );
    rec.frame("step-1");
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/1.*2/);
    await page.waitForTimeout(600);
    rec.frame("step-1-pointing");
    // A row of All steps goes straight to its step.
    await cardButton("guide-overview").click();
    await cardPage(app).locator(".gl-guide-step").nth(1).click();
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "Look at the empty body.",
    );
    await expect(cardPage(app).locator(".gl-guide-head")).toContainText(/2.*2/);
    await page.waitForTimeout(600);
    rec.frame("step-2-pointing");
    await cardButton("guide-back").click();
    await cardButton("guide-next").click();
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "Look at the empty body.",
    );
    await cardButton("guide-back").click();
    await expect(cardPage(app).locator(".gl-guide")).toContainText(
      "Read the heading.",
    );
    await cardButton("guide-next").click();
    await cardButton("guide-next").click();
    // The last step ends the tour with its goodbye and the way back.
    await expect(cardButton("guide-overview")).toBeVisible();
    await expect(cardButton("guide-next")).toHaveCount(0);
    rec.frame("finished");
    // The card's close button ends the guide: the marks go and the card is plain again.
    const ended = Date.now();
    await cardButton("guide-dismiss").click();
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(false);
    // The card the guide opened has nothing left in it, so it goes with the marks.
    await expect
      .poll(() => cardShown(app), { intervals: [50], timeout: 2000 })
      .toBe(false);
    console.log(`guide: card closed ${Date.now() - ended} ms after the end`);
    expect(Date.now() - ended).toBeLessThan(2000);
    rec.frame("dismissed");
    const seen = await stalled(app);
    console.log(
      `guide: feedback ${feedback} ms, main stall ${JSON.stringify(seen)}`,
    );
    expect(seen.worst).toBeLessThan(100);
    // Esc ends a guide too.
    move(40, 40);
    await expect
      .poll(async () => (await read(app)).state, { timeout: 12000 })
      .toBe("peek");
    await reveal(page);
    await clickBubble(page, "guide", frame);
    await expect.poll(() => overlayShown(app), { timeout: 8000 }).toBe(true);
    key(0xff1b);
    await expect.poll(() => overlayShown(app), { timeout: 5000 }).toBe(false);
  } finally {
    await rec.stop();
    await app.close();
  }
});

/** Changes what the page behind Blink shows, so the screen differs as a whole. */
const repaint = (app, colour, word) =>
  app.evaluate(
    (_, [colour, word]) =>
      globalThis.bg.webContents.executeJavaScript(
        `document.body.style.background=${JSON.stringify(colour)};document.querySelector('div').textContent=${JSON.stringify(word)}`,
      ),
    [colour, word],
  );
const turnCount = (app) => app.evaluate(() => globalThis.fakeTurns.length);
const userPictures = (app) =>
  cardPage(app)?.locator(".gl-user .gl-message-image").count();

test("Auto explain: switching it on looks at the whole screen at once, puts the picture in the card and asks, then asks again only for each change, without the app standing still", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch({ env: { BLINKLING_TEST_SLOW: "1" } });
  const rec = record("auto_explain-321");
  try {
    const frame = await background(app);
    await spy(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await reveal(page);
    rec.frame("menu");
    await stall(app);
    const clicked = await clickBubble(page, "auto-explain", frame);
    // The first ask is at once: the user said yes by pressing, and does not
    // have to hold still first.
    await expect.poll(() => turnCount(app), { timeout: 8000 }).toBe(1);
    const first = await app.evaluate(() => globalThis.fakeTurns[0]);
    console.log(`auto: first ask ${first.at - clicked} ms after the press`);
    expect(first.at - clicked).toBeLessThan(5000);
    expect(first.source).toBe("auto-explain");
    expect(first.text).toMatch(/few short paragraphs/);
    const image = PNG.sync.read(
      Buffer.from(first.attachments[0].data, "base64"),
    );
    expect([image.width, image.height]).toEqual([1280, 800]);
    // The card opens by itself with the picture and the answer.
    await expect
      .poll(() => cardShown(app), { timeout: 8000, intervals: [100] })
      .toBe(true);
    await expect
      .poll(() => userPictures(app), { timeout: 8000 })
      .toBeGreaterThan(0);
    rec.frame("first-ask");
    await expect(cardPage(app).locator(".gl-assistant").last()).toContainText(
      "First sentence",
      { timeout: 8000 },
    );
    rec.frame("first-answer");
    move(30, 30);
    // Nothing changed: nothing more is asked.
    await page.waitForTimeout(9000);
    expect(await turnCount(app)).toBe(1);
    // Two changes of the screen, each asked about once after the cool-down.
    await repaint(app, "#e9d67d", "A yellow page");
    const firstChange = Date.now();
    await expect.poll(() => turnCount(app), { timeout: 40000 }).toBe(2);
    const second = await app.evaluate(() => globalThis.fakeTurns[1]);
    console.log(`auto: change 1 asked ${second.at - firstChange} ms later`);
    expect(second.at - firstChange).toBeLessThan(16000);
    rec.frame("second-ask");
    await expect
      .poll(() => cardPage(app).locator(".gl-assistant").count(), {
        timeout: 8000,
      })
      .toBeGreaterThan(1);
    await page.waitForTimeout(1200);
    rec.frame("second-answer");
    await repaint(app, "#7dd6a8", "A green page");
    const secondChange = Date.now();
    await expect.poll(() => turnCount(app), { timeout: 40000 }).toBe(3);
    const third = await app.evaluate(() => globalThis.fakeTurns[2]);
    console.log(`auto: change 2 asked ${third.at - secondChange} ms later`);
    expect(third.at - secondChange).toBeLessThan(16000);
    expect(third.at - second.at).toBeGreaterThanOrEqual(11000);
    await expect
      .poll(() => cardPage(app).locator(".gl-assistant").count(), {
        timeout: 8000,
      })
      .toBeGreaterThan(2);
    await page.waitForTimeout(1200);
    rec.frame("third-answer");
    const seen = await stalled(app);
    console.log(`auto: main stall ${JSON.stringify(seen)}`);
    expect(seen.worst).toBeLessThan(100);
  } finally {
    await rec.stop();
    await app.close();
  }
});

/** Records every turn the real session is handed, then passes it on. */
const spy = (app) =>
  app.evaluate(() => {
    const session = globalThis.blinklingTest.features.auto.session;
    const send = session.send.bind(session);
    globalThis.fakeTurns = [];
    session.send = (turn) => {
      globalThis.fakeTurns.push({ ...turn, at: Date.now() });
      return send(turn);
    };
  });

test("Auto explain, the whole path: the tooltip reads, the picture is sent, the card opens by itself and the answer streams in", async () => {
  test.setTimeout(150000);
  const { app, page } = await launch({ env: { BLINKLING_TEST_SLOW: "1" } });
  const rec = record("auto_explain_path-321");
  try {
    const frame = await background(app);
    await spy(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(800);
    await reveal(page);
    await clickBubble(page, "auto-explain", frame);
    await expect(bubble(page, "auto-explain")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // With auto explain on, the tooltip title is dark on its light surface.
    const label = await bubble(page, "auto-explain")
      .locator(".action-label")
      .evaluate((el) => {
        const strong = el.querySelector("strong");
        return {
          text: strong.textContent,
          color: getComputedStyle(strong).color,
          surface: getComputedStyle(el).backgroundColor,
        };
      });
    console.log(`auto tooltip: ${JSON.stringify(label)}`);
    expect(label.color).not.toBe(label.surface);
    expect(label.color).not.toBe("rgb(255, 255, 255)");
    rec.frame("tooltip");
    move(30, 30);
    await expect
      .poll(
        () =>
          app.evaluate(
            () => !!globalThis.blinklingTest.features.auto.policy.baseline,
          ),
        { timeout: 15000, intervals: [250] },
      )
      .toBe(true);
    await app.evaluate(() =>
      globalThis.bg.webContents.executeJavaScript(
        "document.body.style.background='#e9d67d'",
      ),
    );
    await expect
      .poll(() => app.evaluate(() => globalThis.fakeTurns.length), {
        timeout: 40000,
        intervals: [100],
      })
      .toBeGreaterThan(0);
    const turn = await app.evaluate(() => globalThis.fakeTurns[0]);
    expect(turn.source).toBe("auto-explain");
    expect(turn.attachments).toHaveLength(1);
    expect(turn.attachments[0].mediaType).toBe("image/png");
    rec.frame("sent");
    // Nobody touches anything: the card opens on the first words of the answer.
    await expect
      .poll(() => cardPage(app)?.locator(".gl-assistant").count(), {
        timeout: 8000,
      })
      .toBeGreaterThan(0);
    const shown = () =>
      cardPage(app)
        .locator(".gl-assistant")
        .last()
        .innerText()
        .catch(() => "");
    await expect.poll(shown, { timeout: 8000 }).toContain("First sentence");
    const early = await shown();
    rec.frame("first-words");
    await expect.poll(shown, { timeout: 8000 }).toContain("third");
    expect((await shown()).length).toBeGreaterThan(early.length);
    rec.frame("answer");
  } finally {
    await rec.stop();
    await app.close();
  }
});
