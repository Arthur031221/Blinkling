import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";
import { background } from "./helpers.mjs";
import {
  cardPage,
  place,
  install,
  marks,
  collect,
  writeRows,
  holdRows,
} from "./perf-kit.mjs";

const results = {};
const pick = (card, model, effort) =>
  card.evaluate((s) => window.blinkling.select(s), { model, effort });
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** The card dragged to a new size, an answer with code blocks streaming into it
 * and each effort's show on Blink, at 100% and 200%: the rows of perf.json the
 * other perf runs do not write, held to the same budget. */
for (const scale of [1, 2])
  test(`resizing the card, answers with code blocks and each effort show keep to the frame budget at ${scale * 100}%`, async () => {
    test.setTimeout(300000);
    const rows = (results[`${scale * 100}%`] = {});
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      await place(app, "right", 0.5);
      await page.waitForTimeout(800);
      await app.evaluate(() => {
        const { composer } = globalThis.blinklingTest;
        globalThis.__hidden = [];
        setInterval(() => {
          if (!composer.isVisible()) globalThis.__hidden.push(Date.now());
        }, 20);
      });
      const hidden = () => app.evaluate(() => globalThis.__hidden);
      await install(page);
      await page.evaluate(() => void window.blinkling.action("click"));
      await expect.poll(() => !!cardPage(app)).toBe(true);
      const card = () => cardPage(app);
      await install(card());
      await page.waitForTimeout(1200);
      const measure = async (name, run) => {
        await marks([page, card()], name);
        await run();
        rows[name] = await collect([page, card()], name, await hidden());
      };

      // The left edge of the card is dragged out and back, then a corner.
      await measure("card_resize", async () => {
        const drag = async (edge, path) => {
          await card().evaluate((edge) => {
            window.blinkling.cardResize({ phase: "start", edge });
          }, edge);
          for (const [dx, dy] of path) {
            await card().evaluate(
              ([edge, dx, dy]) =>
                window.blinkling.cardResize({ phase: "move", edge, dx, dy }),
              [edge, dx, dy],
            );
            await page.waitForTimeout(16);
          }
          await card().evaluate(
            ([edge, dx, dy]) =>
              window.blinkling.cardResize({ phase: "end", edge, dx, dy }),
            [edge, ...path.at(-1)],
          );
        };
        await drag(
          "w",
          Array.from({ length: 40 }, (_, i) => [-(i + 1) * 4, 0]),
        );
        await drag(
          "w",
          Array.from({ length: 40 }, (_, i) => [(i + 1) * 4, 0]),
        );
        await drag(
          "sw",
          Array.from({ length: 40 }, (_, i) => [-(i + 1) * 3, (i + 1) * 3]),
        );
        await page.waitForTimeout(600);
      });

      // An answer whose text is full of code blocks grows in the card, the same
      // message coming again with more of its text.
      await measure("answer_code", async () => {
        const block = (i) =>
          `Step ${i}. Run this:\n\n\`\`\`js\nfor (let n = 0; n < ${i + 3}; n++) {\n  console.log("line", n, "of block ${i}");\n}\n\`\`\`\n\nThen \`check\` the result.\n\n`;
        let text = "";
        for (let i = 0; i < 16; i++) {
          text += block(i);
          await app.evaluate(
            (_e, text) =>
              globalThis.blinklingTest.session.emit({
                type: "message",
                id: "a-code",
                role: "assistant",
                content: [{ type: "text", text }],
              }),
            text,
          );
          await page.waitForTimeout(90);
        }
        await expect(
          card().locator(".gl-assistant pre code").first(),
        ).toBeVisible();
        await page.waitForTimeout(1200);
      });

      // Each effort level plays its show on Blink: the pick is made from another
      // effort, since a repeat plays nothing.
      for (const effort of EFFORTS) {
        await pick(card(), "opus", effort === "medium" ? "high" : "medium");
        await page.waitForTimeout(4200);
        await measure(`costume_${effort}`, async () => {
          await pick(card(), "opus", effort);
          await page.waitForTimeout(3500);
        });
      }
    } finally {
      await app.close();
    }
    writeRows(results);
    console.log("PERF3 " + JSON.stringify(results));
    holdRows(expect, rows);
  });
