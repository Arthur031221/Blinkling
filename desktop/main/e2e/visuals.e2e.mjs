import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  report,
  native,
  launch,
  desktopShot,
  moveOn,
  background,
} from "./support.mjs";

const cardPage = (c) =>
  c.app.windows().find((p) => p.url().includes("surface=card"));

// rAF gaps for `ms` from now: every inter-frame gap, and when each late one hit.
const sampleFrames = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const gaps = [],
          late = [],
          start = performance.now();
        let last = start;
        const frame = (now) => {
          gaps.push(now - last);
          if (now - last > 33) late.push([Math.round(now - start), now - last]);
          last = now;
          if (now - start < ms) requestAnimationFrame(frame);
          else resolve({ gaps, late });
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );

async function placeBlink(c, edge, ratio = 0.5) {
  await c.app.evaluate(
    async ({ screen }, { edge, ratio }) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    { edge, ratio },
  );
  await expect
    .poll(() =>
      c.app.evaluate(() => globalThis.blinklingTest.snapshot().position.edge),
    )
    .toBe(edge);
}

const percent = (value) => value.trim().split(/\s+/).map(parseFloat);

for (const edge of ["left", "right", "top", "bottom"])
  test(`the card grows from Blink's side on the ${edge} edge`, async () => {
    const c = await launch();
    try {
      await background(c.app);
      await placeBlink(c, edge);
      await c.page.evaluate(() =>
        window.blinkling.shell({ type: "click", permission: false }),
      );
      await expect.poll(() => !!cardPage(c)).toBe(true);
      const card = cardPage(c);
      await expect(card.locator(".gl-chat-card")).toHaveAttribute(
        "data-open",
        "true",
      );
      const origin = percent(
        await card
          .locator(".gl-chat-card")
          .evaluate(
            (n) =>
              n.style.getPropertyValue("--gl-origin") ||
              getComputedStyle(document.documentElement).getPropertyValue(
                "--gl-origin",
              ) ||
              getComputedStyle(n).transformOrigin,
          ),
      );
      const geometry = await c.app.evaluate(({ screen }) => {
        const t = globalThis.blinklingTest,
          s = t.snapshot(),
          d = screen.getPrimaryDisplay();
        return {
          anchor: {
            x: s.position.reveal.x + d.bounds.x,
            y: s.position.reveal.y + d.bounds.y,
          },
          window: t.composer.getBounds(),
        };
      });
      // The origin is a percentage of the card element, which is inset in its window.
      const rect = await card.locator(".gl-chat-card").evaluate((n) => {
        let x = 0,
          y = 0;
        for (let e = n; e; e = e.offsetParent) {
          x += e.offsetLeft;
          y += e.offsetTop;
        }
        return {
          left: x,
          top: y,
          width: n.offsetWidth,
          height: n.offsetHeight,
        };
      });
      geometry.card = {
        x: geometry.window.x + rect.left,
        y: geometry.window.y + rect.top,
        width: rect.width,
        height: rect.height,
      };
      const expected = [
        ((geometry.anchor.x - geometry.card.x) / geometry.card.width) * 100,
        ((geometry.anchor.y - geometry.card.y) / geometry.card.height) * 100,
      ].map((v) => Math.min(100, Math.max(0, v)));
      expect(origin[0]).toBeCloseTo(expected[0], 0);
      expect(origin[1]).toBeCloseTo(expected[1], 0);
      // Never the old fixed bottom-right corner unless Blink is really there.
      if (edge === "left") expect(origin[0]).toBeLessThan(10);
      if (edge === "right") expect(origin[0]).toBeGreaterThan(90);
      // On the top edge the character is lowered to make room for the fan, so
      // the origin is wherever Blink really is relative to the card.
      if (edge === "top")
        expect(origin[1] > 50).toBe(
          geometry.anchor.y > geometry.card.y + geometry.card.height / 2,
        );
      if (edge === "bottom") expect(origin[1]).toBe(100);
      await card.waitForTimeout(450);
      await desktopShot(c.app, `grow-origin-${edge}`);
    } finally {
      await c.close();
    }
  });

for (const scale of [1, 1.5])
  test(`menu and card animations keep painting at ${scale * 100}%`, async () => {
    const c = await launch(scale);
    try {
      await background(c.app);
      native(20, 20);
      const limit = 50;
      const runs = {};
      const opening = sampleFrames(c.page, 1800);
      await moveOn(c.page, scale);
      runs.menuOpen = await opening;
      const closing = sampleFrames(c.page, 1800);
      native(20, 20);
      runs.menuClose = await closing;
      await moveOn(c.page, scale);
      await c.page.evaluate(() =>
        window.blinkling.shell({ type: "click", permission: false }),
      );
      await expect.poll(() => !!cardPage(c)).toBe(true);
      runs.cardOpen = await sampleFrames(cardPage(c), 800);
      await writeFile(
        join(report, `frame-gaps-${scale * 100}.json`),
        JSON.stringify(
          Object.fromEntries(
            Object.entries(runs).map(([name, { gaps, late }]) => [
              name,
              { frames: gaps.length, max: Math.max(...gaps), late },
            ]),
          ),
          null,
          2,
        ),
      );
      for (const [name, { gaps }] of Object.entries(runs)) {
        expect(gaps.length, name).toBeGreaterThan(10);
        expect(Math.max(...gaps), name).toBeLessThanOrEqual(limit);
      }
    } finally {
      await c.close();
    }
  });

for (const scale of [1, 1.5])
  test(`bubble text is at least 13px and auto explain shows on at ${scale * 100}%`, async () => {
    const c = await launch(scale);
    try {
      await background(c.app);
      await c.app.evaluate(() =>
        globalThis.blinklingTest.registerAction("auto-explain", async () => ({
          ok: true,
        })),
      );
      native(20, 20);
      await moveOn(c.page, scale);
      const sizes = await c.page.evaluate(() =>
        [...document.querySelectorAll(".action-bubble")].map((b) => ({
          label: b.getAttribute("aria-label"),
          font: parseFloat(
            getComputedStyle(b.querySelector(".action-label") ?? b).fontSize,
          ),
          icon: b.querySelector("svg")?.getBoundingClientRect().width ?? 0,
        })),
      );
      expect(sizes).toHaveLength(4);
      for (const s of sizes) {
        expect(s.font, s.label).toBeGreaterThanOrEqual(13);
        expect(s.icon, s.label).toBeGreaterThanOrEqual(20);
      }
      // The always-on auto badge is gone (N3); the bubble itself is the switch.
      await expect(c.page.locator("#auto-badge")).toHaveCount(0);
      await expect(
        c.page.locator('[data-action="auto-explain"]'),
      ).toHaveAttribute("aria-checked", "false");
      await c.page.evaluate(() => window.blinkling.action("auto-explain"));
      await expect(
        c.page.locator('[data-action="auto-explain"]'),
      ).toHaveAttribute("aria-checked", "true");
      await expect(
        c.page.locator('.action-bubble[data-on="true"]'),
      ).toHaveCount(1);
      await c.page.waitForTimeout(300);
      await desktopShot(c.app, `auto-explain-on-${scale * 100}`);
    } finally {
      await c.close();
    }
  });
