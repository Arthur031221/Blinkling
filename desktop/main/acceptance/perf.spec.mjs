import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { launch, native, click, key, bodyPoint, wheel } from "./support.mjs";
import { background, onBlink } from "./helpers.mjs";
import { PNG } from "pngjs";
import { r3 } from "./record.mjs";
import {
  cardPage,
  read,
  place,
  install,
  marks,
  collect,
  writeRows,
  holdRows,
} from "./perf-kit.mjs";

const results = {};

/** The same run at 100% and 200%: each is its own row set in perf.json. */
for (const scale of [1, 2])
  test(`every interaction keeps to the frame budget and answers within 100 ms at ${scale * 100}%`, async () => {
    test.setTimeout(300000);
    const rows = (results[`${scale * 100}%`] = {});
    const at = (p) => p && { x: p.x * scale, y: p.y * scale };
    const { app, page } = await launch({ scale });
    try {
      await background(app);
      await place(app, "right", 0.5);
      await page.waitForTimeout(600);
      const card = () => cardPage(app);
      await app.evaluate(() => {
        const { composer } = globalThis.blinklingTest;
        globalThis.__hidden = [];
        setInterval(() => {
          if (!composer.isVisible()) globalThis.__hidden.push(Date.now());
        }, 20);
      });
      const hidden = () => app.evaluate(() => globalThis.__hidden);
      await install(page);
      await install(card());
      const pages = () => [page, card()];
      await app.evaluate(() => {
        const c = globalThis.blinklingTest.composer;
        globalThis.__shownAt = null;
        c.on("show", () => (globalThis.__shownAt ??= Date.now()));
      });

      /** Marks the interaction, arms what counts as the figure's answer and plays
       * the input; `sent` is when the input reached the X server. */
      const start = async (name, answer) => {
        await marks(pages(), name);
        await page.evaluate((a) => a && window.__arm(a), answer ?? null);
      };
      const finish = async (name, sent, answer) => {
        const stat = await collect(pages(), name, await hidden());
        let at = null;
        if (answer === "card") {
          const shownAt = await app.evaluate(() => globalThis.__shownAt);
          const stamps = await card().evaluate(() => window.__perf.stamps);
          at = stamps.find((t) => t >= shownAt) ?? null;
        } else if (answer) at = await page.evaluate(() => window.__perf.first);
        rows[name] = {
          ...stat,
          ...(answer ? { response_ms: at && at - sent } : {}),
        };
      };

      // 0. Nothing is going on: Blink at rest at the edge.
      await expect.poll(async () => (await read(app)).state).toBe("peek");
      await start("idle");
      await page.waitForTimeout(2500);
      await finish("idle");

      // 1. The pointer arrives on Blink at the edge: it comes out.
      const spot = at(await bodyPoint(page));
      await start("reveal", "reveal");
      let stamps = native(
        [{ type: "move", x: spot.x, y: spot.y, wait: 0.05 }],
        {
          stamp: true,
        },
      );
      await page.waitForTimeout(1400);
      await finish("reveal", stamps[0], "reveal");

      // 1b. The pointer moves about on Blink while it is out.
      const around = at(await bodyPoint(page));
      await start("hover");
      native(
        Array.from({ length: 40 }, (_, i) => ({
          type: "move",
          x: around.x + Math.sin(i / 4) * 6 * scale,
          y: around.y + Math.cos(i / 4) * 4 * scale,
          wait: 0.03,
        })),
      );
      await finish("hover");

      // 2. A click on Blink opens the card.
      await onBlink(page);
      const here = at(await bodyPoint(page));
      await start("open_card");
      await app.evaluate(() => (globalThis.__shownAt = null));
      stamps = native(
        [
          { type: "move", x: here.x, y: here.y },
          { type: "down", wait: 0.01 },
          { type: "up", wait: 0.01 },
        ],
        { stamp: true },
      );
      await expect.poll(async () => (await read(app)).card).toBe(true);
      await page.waitForTimeout(1200);
      await finish("open_card", stamps[1], "card");

      // 3. An answer streams into the card.
      await start("stream");
      await app.evaluate(async () => {
        const { session } = globalThis.blinklingTest;
        for (let i = 0; i < 12; i++)
          session.emit({
            type: "message",
            id: `h-${i}`,
            role: i % 2 ? "assistant" : "user",
            content: [
              { type: "text", text: `Message number ${i} of the chat.` },
            ],
          });
        for (let i = 0; i < 60; i++) {
          session.emit({
            type: "delta",
            id: "latest",
            text: `Word number ${i} of a long streamed answer that wraps. `,
          });
          await new Promise((r) => setTimeout(r, 30));
        }
        session.emit({ type: "done", turnId: "latest" });
      });
      await page.waitForTimeout(600);
      await finish("stream");

      // 3b. The history is scrolled by the wheel with the pointer over the card.
      const cardBox = await card().evaluate(() => ({
        x: window.screenX + innerWidth / 2,
        y: window.screenY + innerHeight / 2,
      }));
      await start("chat_scroll");
      for (let i = 0; i < 6; i++) {
        wheel(cardBox.x * scale, cardBox.y * scale, i % 2 ? 3 : -3);
        await page.waitForTimeout(150);
      }
      await finish("chat_scroll");

      // 4. A second click turns the card into the menu.
      const again = at(await bodyPoint(page));
      await start("menu", "menu");
      stamps = native(
        [
          { type: "move", x: again.x, y: again.y },
          { type: "down", wait: 0.01 },
          { type: "up", wait: 0.01 },
        ],
        { stamp: true },
      );
      await expect.poll(async () => (await read(app)).menu).toBe(true);
      await page.waitForTimeout(1200);
      await finish("menu", stamps[1], "menu");

      // 5. Blink is picked up by a press and a first step, and carried across.
      await onBlink(page);
      const grab = at(await bodyPoint(page));
      await start("carry");
      native([
        { type: "move", x: grab.x, y: grab.y },
        { type: "down", wait: 0 },
      ]);
      await page.evaluate(() => window.__arm("carry"));
      stamps = native(
        [
          ...Array.from({ length: 60 }, (_, i) => ({
            type: "move",
            x: grab.x - (6 + i * 9) * scale,
            y: grab.y + Math.sin(i / 6) * 90 * scale,
            wait: 0.016,
          })),
          { type: "wait", seconds: 0.2 },
          { type: "up" },
        ],
        { stamp: true },
      );
      await finish("carry", stamps[0], "carry");

      // 6. A click elsewhere puts the menu away and Blink goes back to the edge.
      key(0xff1b);
      click(120 * scale, 720 * scale);
      await start("retreat");
      await expect
        .poll(async () => (await read(app)).state, { timeout: 12000 })
        .toBe("peek");
      await finish("retreat");

      // 7. A capture is sucked into Blink's mouth: the pick layer draws the flight.
      const layer = app.windows().find((p) => p.url().includes("layer.html"));
      await install(layer);
      const png = new PNG({ width: 360, height: 240 });
      for (let i = 0; i < png.data.length; i += 4)
        png.data.set([40 + ((i / 4) % 200), 160, 90, 255], i);
      await marks([layer], "eat");
      await app.evaluate(
        async ({ screen }, [data, region]) => {
          await globalThis.blinklingTest.attachCapture({
            image: {
              id: "perf-eat",
              name: "perf-eat.png",
              mediaType: "image/png",
              data,
            },
            display: screen.getPrimaryDisplay(),
            region,
          });
        },
        [
          PNG.sync.write(png).toString("base64"),
          { x: 300, y: 160, width: 360, height: 240 },
        ],
      );
      rows.eat = await collect([layer], "eat", []);

      // 8. The language is changed in the settings page with the card open:
      // every window changes its words in place, and nothing may stall.
      const shown = () =>
        app.evaluate(() => globalThis.blinklingTest.composer.isVisible());
      // The eat opens the card by itself once the picture is in.
      await page.waitForTimeout(2500);
      if (!(await shown()))
        await page.evaluate(() =>
          window.blinkling.shell({ type: "click", permission: true }),
        );
      await expect.poll(shown).toBe(true);
      await app.evaluate(() => globalThis.blinklingTest.settings.open());
      await expect
        .poll(() =>
          app.windows().find((p) => p.url().includes("/settings/index.html")),
        )
        .toBeTruthy();
      const settings = app
        .windows()
        .find((p) => p.url().includes("/settings/index.html"));
      await page.waitForTimeout(1500);
      for (const code of ["ja", "de", "en", "zh-TW"]) {
        await install(settings);
        await marks([...pages(), settings], "language");
        await settings.locator("#language-select").selectOption(code);
        await page.waitForTimeout(1200);
        const stat = await collect([...pages(), settings], "language", []);
        // The slowest of the four switches stands for the row.
        const worst = rows.language;
        rows.language =
          !worst || stat.frame_p95_ms > worst.frame_p95_ms ? stat : worst;
        if (worst)
          rows.language.frame_max_ms = Math.max(
            worst.frame_max_ms,
            stat.frame_max_ms,
          );
      }
    } finally {
      await app.close();
    }

    writeRows(results, {
      pick_frame: existsSync(`${r3}/perf-pick-frame.json`)
        ? JSON.parse(readFileSync(`${r3}/perf-pick-frame.json`, "utf8"))
        : null,
    });
    console.log("PERF " + JSON.stringify(results));
    holdRows(expect, rows);
  });
