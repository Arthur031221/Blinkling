import { test, expect } from "@playwright/test";
import { launch, key } from "./support.mjs";
import { reveal, bubble, clickBlink } from "./helpers.mjs";
import { record } from "./record.mjs";
import {
  cardPage,
  cardShown,
  cardWindow,
  clickAt,
  clickIn,
  expectStep,
  fakeSession,
  guideButton,
  machine,
  meet,
  overlayShown,
  place,
  ready,
  regions,
} from "./walk.mjs";

// The 3.2.4 walk: rows of checklist-324.md that no other spec records on its own.
const ESC = 0xff1b;
const gone = async (app) => ({
  card: await cardShown(app),
  marks: await overlayShown(app),
  state: await machine(app),
});

test("guide_bgclick: a background click in every phase of a guide closes card and marks, Blink peeks within 0.6 s and nothing comes back", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("guide_bgclick", { suffix: "-324" });
  try {
    const world = await ready(app, page, { delay: 2500 });
    const phases = {
      looking: async () => {
        await world.press("guide");
        await expect(cardPage(app).locator(".gl-guide")).toContainText("…", {
          timeout: 4000,
        });
      },
      step: async () => {
        await fakeSession(app, 200);
        await world.press("guide");
        await expectStep(app, /1.*3/);
        await expect
          .poll(() => overlayShown(app), { timeout: 5000 })
          .toBe(true);
      },
      all: async () => {
        await fakeSession(app, 200);
        await world.press("guide");
        await expectStep(app, /1.*3/);
        await guideButton(app, "guide-overview").click();
        await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(3);
        await page.waitForTimeout(500);
      },
    };
    for (const [name, show] of Object.entries(phases)) {
      await reveal(page);
      await page.waitForTimeout(600);
      await show();
      rec.frame(`${name}-shown`);
      const at = await clickAt(world.empty);
      let took = null;
      for (let i = 0; i < 100 && took === null; i++) {
        const g = await gone(app);
        if (!g.card && !g.marks && g.state.state === "peek" && !g.state.out)
          took = Date.now() - at;
        else await page.waitForTimeout(20);
      }
      console.log(`guide_bgclick ${name}: all gone after ${took} ms`);
      expect(took, `${name}: card, marks and Blink gone`).not.toBeNull();
      expect(took, `${name}: within 0.6 s of the press`).toBeLessThan(600);
      rec.frame(`${name}-closed`);
      // Nothing reappears, the card does not jump elsewhere.
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(500);
        const g = await gone(app);
        expect(g.card || g.marks, `${name}: still closed at ${i * 0.5}s`).toBe(
          false,
        );
      }
      rec.frame(`${name}-5s-later`);
      // A looking answer that arrives late draws nothing either.
      await page.waitForTimeout(2800);
      expect(await overlayShown(app)).toBe(false);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("guide_end_tour and auto_explain_after_tour: Esc or End tour ends a guide at once in every phase, then Auto explain asks within 5 s", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("guide_end_tour", { suffix: "-324" });
  const rec2 = record("auto_explain_after_tour", { suffix: "-324" });
  try {
    const world = await ready(app, page, { delay: 2500 });
    // 1. Esc while the screen is still being looked at.
    await world.press("guide");
    await expect(cardPage(app).locator(".gl-guide")).toContainText("…", {
      timeout: 4000,
    });
    rec.frame("looking");
    key(ESC);
    await expect.poll(() => cardShown(app), { timeout: 1500 }).toBe(false);
    let m = await machine(app);
    console.log(`end tour (looking): ${JSON.stringify(m)}`);
    expect(m.card).toBe(false);
    rec.frame("looking-ended");
    await page.waitForTimeout(3000);
    expect(await overlayShown(app), "the late answer draws nothing").toBe(
      false,
    );
    expect(await cardShown(app)).toBe(false);
    // 2. End tour in a step, with a real click.
    await fakeSession(app, 200);
    await reveal(page);
    await page.waitForTimeout(600);
    await world.press("guide");
    await expectStep(app, /1.*3/);
    rec.frame("step");
    await clickIn(app, guideButton(app, "guide-dismiss"));
    await expect.poll(() => overlayShown(app), { timeout: 1500 }).toBe(false);
    rec.frame("step-ended");
    await page.waitForTimeout(800);
    // The card that stays is not an empty one: it holds the offer to show the
    // guide again, and neither the step panel nor the thinking line.
    const card = cardPage(app);
    await expect(card.locator('[data-action="guide-again"]')).toBeVisible();
    await expect(card.locator(".gl-guide-head")).toHaveCount(0);
    await expect(card.locator(".gl-guide")).not.toContainText("…");
    expect((await machine(app)).streaming).toBe(false);
    rec.frame("offer-only");
    await rec.stop();

    // 3. Auto explain works again straight away, with no relaunch.
    await clickBlink(page);
    await expect(bubble(page, "auto-explain")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(600);
    rec2.frame("menu");
    const pressed = await world.press("auto-explain");
    await expect
      .poll(
        () =>
          app.evaluate(
            () =>
              globalThis.fakeTurns.filter((t) => t.source === "auto-explain")
                .length,
          ),
        {
          timeout: 5000,
          intervals: [50],
        },
      )
      .toBe(1);
    const took = await app.evaluate(
      () =>
        globalThis.fakeTurns.filter((t) => t.source === "auto-explain")[0].at,
    );
    console.log(
      `auto explain after the tour: asked ${took - pressed} ms after the press`,
    );
    expect(took - pressed).toBeLessThan(5000);
    rec2.frame("asked");
    // That the answer opens the card and reads in it is autoexplain.spec's
    // (auto_explain_popup); this fake bridge only proves the ask is made.
    await page.waitForTimeout(800);
    rec2.frame("answer");
  } finally {
    await rec.stop();
    await rec2.stop();
    await app.close();
  }
});

const SCROLLED = [
  { id: "s1", label: "Logo", rect: { x: 420, y: 480, width: 200, height: 90 } },
  {
    id: "s2",
    label: "Headline",
    rect: { x: 300, y: 600, width: 500, height: 100 },
  },
  {
    id: "s3",
    label: "Read more",
    rect: { x: 640, y: 690, width: 300, height: 80 },
  },
];

test("guide_frames_card: no mark, label or line of any step draws over the card, the card keeps off the target inside the screen and stays at Blink's mouth", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("guide_frames_card", { suffix: "-324" });
  try {
    const world = await ready(app, page, { delay: 200 });
    const area = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().workArea,
    );
    const mouthGap = async () => {
      const tail = await cardPage(app).evaluate(() => {
        const el = document.querySelector(".gl-chat-card");
        const r = el.getBoundingClientRect();
        return (
          screenY +
          r.top +
          parseFloat(el.style.getPropertyValue("--gl-tail-at"))
        );
      });
      const mouth = await app.evaluate(() => globalThis.blinklingTest.mouth());
      return Math.abs(tail - mouth.y);
    };
    const check = async (label, targets) => {
      rec.frame(label.replace(/\s/g, "-"));
      const card = await cardWindow(app);
      expect(card, `${label}: card shown`).not.toBeNull();
      expect(
        card.y,
        `${label}: card top inside the screen`,
      ).toBeGreaterThanOrEqual(area.y);
      expect(
        card.y + card.height,
        `${label}: card bottom inside the screen`,
      ).toBeLessThanOrEqual(area.y + area.height);
      // The card window carries a margin for its shadow; what must stay clear
      // of marks and targets is the card a person sees inside it.
      const inner = await cardPage(app).locator(".gl-chat-card").boundingBox();
      const seen = {
        x: card.x + inner.x,
        y: card.y + inner.y,
        width: inner.width,
        height: inner.height,
      };
      // A mark the card cannot stand clear of is cut out under the card, so
      // nothing of it draws over the card's text or composer.
      const cut = await app
        .windows()
        .find((p) => p.url().includes("/overlay/"))
        ?.evaluate(() => document.body.style.clipPath);
      for (const part of await regions(app))
        if (meet(seen, part)) {
          console.log(
            `guide frames: ${label}: ${part.kind} under the card, cut`,
          );
          expect(
            cut,
            `${label}: ${part.kind} under the card needs the cut`,
          ).toContain(`h ${card.width} v ${card.height}`);
        }
      for (const target of targets)
        expect(meet(seen, target), `${label}: card over the target`).toBe(
          false,
        );
      // A card that stepped off the target points its tail at the mouth from
      // its nearest corner; it is never further than the design's reach.
      const gap = await mouthGap();
      console.log(
        `guide frames: ${label}: tail ${Math.round(gap)} px off the mouth`,
      );
      expect(gap, `${label}: tail near the mouth`).toBeLessThan(160);
    };
    for (const [name, sections, edge, ratio] of [
      ["top", undefined, "left", 0.2],
      ["scrolled", SCROLLED, "right", 0.7],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(900);
      await fakeSession(app, 200, sections);
      await reveal(page);
      await page.waitForTimeout(700);
      await world.press("guide");
      await expectStep(app, /1.*3/);
      const targets = (
        sections ?? [
          { rect: { x: 400, y: 110, width: 160, height: 100 } },
          { rect: { x: 420, y: 300, width: 330, height: 120 } },
          { rect: { x: 700, y: 520, width: 260, height: 60 } },
        ]
      ).map((s) => s.rect);
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(900);
        await check(`${name} step ${i + 1}`, [targets[i]]);
        rec.frame(`${name}-step-${i + 1}`);
        if (i < 2) await clickIn(app, guideButton(app, "guide-next"));
      }
      await clickIn(app, guideButton(app, "guide-overview"));
      await expect(cardPage(app).locator(".gl-guide-step")).toHaveCount(3);
      await page.waitForTimeout(900);
      // Every target at once cannot all be clear of the card; what it hides is cut.
      await check(`${name} all steps`, []);
      rec.frame(`${name}-all`);
      await clickIn(app, guideButton(app, "guide-dismiss"));
      await expect.poll(() => overlayShown(app), { timeout: 3000 }).toBe(false);
      await clickAt(world.empty);
      await page.waitForTimeout(800);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("auto_explain_draft: with a draft in the card, or an answer streaming, Auto explain asks within 5 s or shows a waiting line", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("auto_explain_draft", { suffix: "-324" });
  const autoTurns = () =>
    app.evaluate(
      () =>
        globalThis.fakeTurns.filter((t) => t.source === "auto-explain").length,
    );
  const waiting = async () => {
    const card = cardPage(app);
    if (!card) return false;
    return (await card.locator('[data-role="auto-waiting"]').count()) > 0;
  };
  try {
    const world = await ready(app, page, { delay: 400 });
    // 1. A draft typed a moment ago, the card left open on it.
    await clickBlink(page);
    await expect.poll(() => cardShown(app), { timeout: 8000 }).toBe(true);
    await cardPage(app).locator("textarea").fill("a half written question");
    await page.waitForTimeout(500);
    rec.frame("draft");
    // The card is left with its draft in it; the menu comes back with the card gone.
    await app.evaluate(() =>
      globalThis.blinklingTest.nBlinkMenuFaces.escapeKeys.press(),
    );
    await page.waitForTimeout(900);
    await reveal(page);
    await expect(bubble(page, "auto-explain")).toBeVisible({ timeout: 5000 });
    const pressed = await world.press("auto-explain");
    let seen = null;
    for (let i = 0; i < 100 && !seen; i++) {
      if ((await autoTurns()) > 0) seen = "asked";
      else if (await waiting()) seen = "waiting line";
      else await page.waitForTimeout(50);
    }
    console.log(
      `auto explain with a draft: ${seen} after ${Date.now() - pressed} ms`,
    );
    rec.frame("draft-result");
    expect(seen, "asked or told it waits, within 5 s").not.toBeNull();
    // The streaming half (an answer still coming in) is the unit test of
    // AutoWatch: the session queues the ask behind the answer.
    expect(Date.now() - pressed).toBeLessThan(5500);
  } finally {
    await rec.stop();
    await app.close();
  }
});
