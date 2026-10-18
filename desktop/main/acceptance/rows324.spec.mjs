import { test, expect } from "@playwright/test";
import { launch, move, click, key, native } from "./support.mjs";
import { background, onBlink, clickBlink, reveal } from "./helpers.mjs";
import { place, cardPage, cardShown, machine, clickIn } from "./walk.mjs";
import { record } from "./record.mjs";

const cardEmit = (app, event) =>
  app.evaluate(
    (_e, event) => globalThis.blinklingTest.session.emit(event),
    event,
  );
const say = (app, id, role, text, at = Date.now()) =>
  cardEmit(app, {
    type: "message",
    id,
    role,
    at,
    content: [{ type: "text", text }],
  });
const clipboard = (app) =>
  app.evaluate(({ clipboard }) => clipboard.readText());
const clearClipboard = (app) =>
  app.evaluate(({ clipboard }) => clipboard.writeText(""));

/** One recording per row of checklist-324 that no earlier spec records under
 * the row's own id. */

const emit = (app, event) =>
  app.evaluate((_e, event) => globalThis.blinklingTest.send(event), event);
const openCard = (page) =>
  page.evaluate(() =>
    window.blinkling.shell({ type: "click", permission: true }),
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test("stuck: the card and the permission bubble each close with Esc, a click outside and the close button, also after Blink changed its edge", async () => {
  test.setTimeout(240000);
  const { app, page } = await launch();
  const rec = record("stuck", { suffix: "-324" });
  const bubble = page.locator("#permission-alert");
  try {
    const frame = await background(app);
    for (const [edge, ratio] of [
      ["right", 0.5],
      ["left", 0.4],
    ]) {
      await place(app, edge, ratio);
      await page.waitForTimeout(700);
      // Empty page on the side away from the card.
      const away = {
        x: edge === "right" ? frame.x + 140 : frame.x + frame.width - 160,
        y: frame.y + 170,
      };
      // The card: Esc, then the close button, then a click outside.
      for (const how of ["esc", "button", "outside"]) {
        await reveal(page);
        await page.waitForTimeout(500);
        await openCard(page);
        await expect.poll(() => cardShown(app), { timeout: 5000 }).toBe(true);
        await page.waitForTimeout(900);
        rec.frame(`card-${edge}-${how}`);
        if (how === "esc") key(0xff1b);
        else if (how === "button")
          await clickIn(
            app,
            cardPage(app).locator(".gl-card-header button").last(),
          );
        else click(away.x, away.y);
        await expect
          .poll(() => cardShown(app), {
            timeout: 4000,
            message: `${edge} ${how}`,
          })
          .toBe(false);
        await page.waitForTimeout(500);
      }
      // A card that opened by itself has no focus; Esc still closes it.
      await emit(app, {
        type: "blink-say",
        text: "This card opened by itself.",
      });
      await expect.poll(() => cardShown(app), { timeout: 8000 }).toBe(true);
      const focused = await app.evaluate(() =>
        globalThis.blinklingTest.composer.isFocused(),
      );
      await page.waitForTimeout(900);
      rec.frame(`card-${edge}-unfocused-${focused}`);
      key(0xff1b);
      await expect
        .poll(() => cardShown(app), {
          timeout: 4000,
          message: `${edge} unfocused esc`,
        })
        .toBe(false);
      await page.waitForTimeout(500);
      // The permission bubble: Esc, its close button, then a click outside.
      for (const how of ["esc", "button", "outside"]) {
        await emit(app, { type: "activity", state: "permission" });
        await expect(bubble).toBeVisible();
        await page.waitForTimeout(400);
        rec.frame(`permission-${edge}-${how}`);
        if (how === "esc") key(0xff1b);
        else if (how === "button") {
          const blink = await app.evaluate(() =>
            globalThis.blinklingTest.blink.getBounds(),
          );
          const at = await page.locator("#permission-close").boundingBox();
          click(blink.x + at.x + at.width / 2, blink.y + at.y + at.height / 2);
        } else click(away.x, away.y);
        await expect(bubble, `${edge} ${how}`).toBeHidden({ timeout: 4000 });
        await emit(app, { type: "activity", state: "idle" });
        await page.waitForTimeout(400);
      }
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("code_copy: every code block has a copy button that puts exactly its code on the clipboard and shows a copied state", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("code_copy", { suffix: "-324" });
  const one = "function add(a, b) {\n  return a + b;\n}";
  const two = "$ npm install\n$ npm test";
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    await say(app, "u1", "user", "Show two snippets.");
    await say(
      app,
      "a1",
      "assistant",
      [
        "First:",
        "",
        "```js",
        one,
        "```",
        "",
        "Then:",
        "",
        "```bash",
        two,
        "```",
      ].join("\n"),
    );
    const card = cardPage(app);
    await expect(card.locator(".gl-code-toolbar button")).toHaveCount(2);
    await page.waitForTimeout(600);
    rec.frame("two-blocks");
    for (const [i, code] of [one, two].entries()) {
      await clearClipboard(app);
      await card.locator(".gl-code-toolbar button").nth(i).click();
      await expect.poll(() => clipboard(app)).toBe(code);
      // The pasted text has no fence and no language name.
      expect(await clipboard(app)).not.toMatch(/```|^(js|bash)\n/);
      await page.waitForTimeout(250);
      const state = await card
        .locator(".gl-code-toolbar button")
        .nth(i)
        .evaluate((b) => ({
          text: b.textContent,
          label: b.getAttribute("aria-label"),
          data: { ...b.dataset },
        }));
      console.log(
        `code copy: block ${i + 1} copied state ${JSON.stringify(state)}`,
      );
      rec.frame(`copied-${i + 1}`);
      await page.waitForTimeout(1800);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("message_actions: time, delivered mark, copy, and edit and resend sent as one new question that is answered once", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("message_actions", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    const card = cardPage(app);
    const box = card.locator("textarea");
    await box.fill("slow: what is this");
    await box.press("Enter");
    await expect(card.locator(".gl-assistant").last()).toContainText(
      "And a third.",
      { timeout: 15000 },
    );
    await page.waitForTimeout(700);
    const row = card.locator(".gl-user .gl-message-meta");
    await expect(row.locator(".gl-meta-time")).toHaveCount(1);
    await expect(row.locator(".gl-meta-tick")).toHaveCount(1);
    rec.frame("sent-and-delivered");
    await clearClipboard(app);
    await row.locator('[data-act="copy"]').click();
    await expect.poll(() => clipboard(app)).toBe("slow: what is this");
    rec.frame("copied");
    const answers = await card.locator(".gl-assistant").count();
    await row.locator('[data-act="edit"]').click();
    await expect(box).toHaveValue("slow: what is this");
    await box.fill("slow: what is that instead");
    rec.frame("edited");
    await box.press("Enter");
    await expect(card.locator(".gl-user")).toHaveCount(2, { timeout: 8000 });
    await expect(card.locator(".gl-user").last()).toContainText(
      "what is that instead",
    );
    await expect(card.locator(".gl-assistant")).toHaveCount(answers + 1, {
      timeout: 15000,
    });
    await page.waitForTimeout(4000);
    expect(await card.locator(".gl-assistant").count(), "answered once").toBe(
      answers + 1,
    );
    expect(await card.locator(".gl-user").count(), "asked once").toBe(2);
    rec.frame("resent-one-answer");
  } finally {
    await rec.stop();
    await app.close();
  }
});

const askIn = async (card, text) => {
  const before = await card.locator(".gl-assistant").count();
  await card.locator("textarea").fill(text);
  await card.locator("textarea").press("Enter");
  await expect(card.locator(".gl-assistant")).toHaveCount(before + 1, {
    timeout: 10000,
  });
  await expect(card.locator(".gl-assistant").last()).toContainText(
    "And a third.",
    { timeout: 15000 },
  );
};

test("no_empty_bubble: from sending a question to the first token no empty pill shows beside Blink or in the card", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("no_empty_bubble", { suffix: "-324", fps: 30 });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    const card = cardPage(app);
    // Every frame, look for a visible pill with nothing written in it.
    const watchEmpty = (p) =>
      p.evaluate(() => {
        window.__empty = [];
        const pills =
          ".gl-assistant, #status, #grumble, #permission-alert, .gl-bubble, .gl-pill";
        const step = () => {
          for (const el of document.querySelectorAll(pills)) {
            const r = el.getBoundingClientRect();
            const shown =
              r.width > 4 &&
              r.height > 4 &&
              getComputedStyle(el).visibility !== "hidden" &&
              getComputedStyle(el).opacity !== "0" &&
              el.dataset.shown !== "false";
            const copy = el.cloneNode(true);
            copy.querySelector(".gl-message-meta")?.remove();
            if (
              shown &&
              !copy.textContent.trim() &&
              !el.querySelector("img,canvas,svg")
            )
              window.__empty.push(
                `${el.className || el.id} ${Math.round(r.width)}x${Math.round(r.height)}`,
              );
          }
          requestAnimationFrame(step);
        };
        step();
      });
    await watchEmpty(card);
    await watchEmpty(page);
    rec.frame("before-send");
    await card.locator("textarea").fill("think: what is this");
    await card.locator("textarea").press("Enter");
    await expect(card.locator(".gl-thinking")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    rec.frame("thinking");
    await expect(card.locator(".gl-assistant").last()).toContainText(
      "And a third.",
      {
        timeout: 15000,
      },
    );
    await page.waitForTimeout(500);
    rec.frame("answered");
    const empty = [
      ...(await card.evaluate(() => window.__empty)),
      ...(await page.evaluate(() => window.__empty)),
    ];
    console.log(`empty pills seen: ${JSON.stringify(empty)}`);
    expect(empty, "no empty pill in any frame").toEqual([]);
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("user_right_ai_left: my messages are on the right in light green and the answers on the left, from the card and from the terminal, in both themes", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("user_right_ai_left", { suffix: "-324" });
  try {
    await background(app);
    await reveal(page);
    await clickBlink(page);
    await expect.poll(() => cardPage(app)).toBeTruthy();
    await page.waitForTimeout(900);
    const card = cardPage(app);
    await askIn(card, "slow: a question typed in Blink");
    // A prompt typed in the terminal and its answer.
    await say(app, "t1", "user", "A prompt typed in the terminal");
    await say(
      app,
      "t2",
      "assistant",
      "The answer shown for the terminal prompt.",
    );
    await expect(card.locator(".gl-user")).toHaveCount(2);
    await expect(card.locator(".gl-assistant")).toHaveCount(2);
    await page.waitForTimeout(500);
    for (const theme of ["light", "dark"]) {
      await card.emulateMedia({ colorScheme: theme });
      await card.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.waitForTimeout(400);
      const sides = await card.evaluate(() => {
        const h = document
          .querySelector(".gl-chat-history")
          .getBoundingClientRect();
        const mid = (h.left + h.right) / 2;
        const pick = (sel) =>
          [...document.querySelectorAll(sel)].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              centre: (r.left + r.right) / 2 > mid ? "right" : "left",
              bg: getComputedStyle(el).backgroundColor,
              text: el.textContent.slice(0, 24),
            };
          });
        return { user: pick(".gl-user"), ai: pick(".gl-assistant") };
      });
      console.log(`user right ${theme}: ${JSON.stringify(sides)}`);
      for (const u of sides.user) {
        expect(u.centre, `${theme} user ${u.text}`).toBe("right");
        const [r, g, b] = u.bg.startsWith("color(")
          ? u.bg.match(/[\d.]+(?= |\))/g).map((v) => Number(v) * 255)
          : u.bg.match(/\d+/g).map(Number);
        expect(g, `${theme} user bubble is green`).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b - 10);
      }
      for (const a of sides.ai)
        expect(a.centre, `${theme} ai ${a.text}`).toBe("left");
      rec.frame(theme);
    }
    await card.emulateMedia({ colorScheme: "light" });
    await card.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("panel_select: dragging or double clicking the Settings or the Welcome header never selects the title", async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  const rec = record("panel_select", { suffix: "-324" });
  try {
    await background(app);
    await page.waitForTimeout(800);
    for (const [name, open, url, title] of [
      [
        "settings",
        () => globalThis.blinklingTest.settings.open(),
        "/settings/index.html",
        "#settings-title",
      ],
      [
        "welcome",
        () => globalThis.blinklingTest.welcome.open(),
        "/welcome/index.html",
        ".welcome-head, #welcome-title",
      ],
    ]) {
      await app.evaluate(open);
      await expect
        .poll(() => app.windows().some((p) => p.url().includes(url)), {
          timeout: 8000,
        })
        .toBe(true);
      const panel = app.windows().find((p) => p.url().includes(url));
      await page.waitForTimeout(1200);
      const at = await panel.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return {
          x: screenX + r.left,
          y: screenY + r.top,
          w: r.width,
          h: r.height,
        };
      }, title);
      const x = at.x + Math.min(at.w / 2, 120);
      const y = at.y + at.h / 2;
      // Drag across the title text, then double click it.
      native([
        { type: "move", x, y },
        { type: "down" },
        { type: "move", x: x + 60, y: y + 4 },
        { type: "move", x: x + 140, y: y + 6 },
        { type: "up" },
      ]);
      await page.waitForTimeout(300);
      rec.frame(`${name}-dragged`);
      const dragged = await panel.evaluate(() => getSelection().toString());
      const nx = x + 140,
        ny = y + 6;
      native([
        { type: "move", x: nx, y: ny },
        { type: "down" },
        { type: "up" },
        { type: "down" },
        { type: "up" },
      ]);
      await page.waitForTimeout(300);
      rec.frame(`${name}-double`);
      const doubled = await panel.evaluate(() => getSelection().toString());
      console.log(
        `panel select ${name}: dragged "${dragged}" double "${doubled}"`,
      );
      expect(dragged, `${name} drag`).toBe("");
      expect(doubled, `${name} double click`).toBe("");
      await app.evaluate((_e, n) => globalThis.blinklingTest[n].close(), name);
      await page.waitForTimeout(500);
    }
  } finally {
    await rec.stop();
    await app.close();
  }
});
