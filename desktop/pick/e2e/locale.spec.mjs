import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  SCALE,
  px,
  launch,
  openFixture,
  record,
  log,
  domRect,
  raised,
  miniOpen,
  miniEval,
  sent,
  input,
  poll,
  shot,
} from "./harness.mjs";
import { strings as menu } from "../../menu/strings.mjs";
import { strings as pick } from "../strings.mjs";
import { strings as capture } from "../../capture/strings.mjs";

// N3.10: the language follows the system, and every surface follows the same
// one. The system here is the process locale, as a user's session sets it.

const OUT = process.env.PICK_SHOTS ?? `/tmp/pick-e2e-${SCALE}`;
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test.afterEach(() => {
  input([["release"], ["up", "ctrl"], ["up", "shift"]]);
});

const SYSTEMS = [
  { name: "zh-TW", locale: "zh-TW", env: { LANG: "zh_TW.UTF-8" } },
  { name: "ja", locale: "ja", env: { LANG: "ja_JP.UTF-8" } },
  // Chromium's own locale is set by the switch and the user's list is empty.
  {
    name: "ja via --lang",
    locale: "ja",
    env: { LANG: "en_US.UTF-8" },
    args: ["--lang=ja"],
  },
];

const windowEval = (app, url, code) =>
  app.evaluate(
    ({ BrowserWindow }, { url, code }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes(url))
        ?.webContents.executeJavaScript(code),
    { url, code },
  );

for (const system of SYSTEMS) {
  test(`G6-1 on a ${system.name} system the menu, capture hint, mini chips, pause line and pick hint all speak ${system.locale}`, async () => {
    const t = {
      menu: menu[system.locale],
      pick: pick[system.locale],
      capture: capture[system.locale],
    };
    const app = await launch({
      scale: SCALE,
      args: system.args,
      env: {
        // No override: the language comes from the system.
        BLINKLING_LOCALE: "",
        LC_ALL: "",
        LANGUAGE: "",
        ...system.env,
      },
    });
    try {
      await openFixture(app);
      await record(app);
      await app.evaluate(() =>
        globalThis.blinklingTest.registerAction("auto-explain", async () => ({
          ok: true,
        })),
      );

      // The menu.
      const menuLabels = JSON.parse(
        await windowEval(
          app,
          "renderer/index.html",
          "JSON.stringify([...document.querySelectorAll('.action-bubble')].map((b) => [b.querySelector('strong').textContent, b.querySelector('span, small, em, div')?.textContent ?? '']))",
        ),
      );
      const titles = menuLabels.map(([title]) => title);
      expect(titles).toContain(t.menu.capture);
      expect(titles).toContain(t.menu.guide);
      expect(t.menu.capture).not.toBe(menu.en.capture);

      // Auto explain on, so the mini composer shows its pause line.
      await windowEval(
        app,
        "renderer/index.html",
        "window.blinkling.action('auto-explain')",
      );

      // The pick hint, then the mini composer with its chips and pause line.
      const photo = await domRect(app, "#photo");
      input([["move", px(photo.x + 40), px(photo.y + 40)]]);
      input([["down", "ctrl"]]);
      await poll(() => raised(app), 3000, "the layer to rise");
      await poll(
        async () => sent(await log(app), "hint").length > 0,
        4000,
        "the pick hint",
      );
      expect(sent(await log(app), "hint")[0].text).toBe(t.pick["hint.pick"]);
      expect(
        await windowEval(
          app,
          "layer.html",
          "document.querySelector('.pick-hint').textContent",
        ),
      ).toBe(t.pick["hint.pick"]);
      await pause(200);
      input([["press"], ["release"]]);
      await poll(
        async () => sent(await log(app), "taken").length > 0,
        4000,
        "the capture",
      );
      input([["up", "ctrl"]]);
      await poll(() => miniOpen(app), 6000, "the mini composer");
      await pause(500);
      const mini = JSON.parse(
        await miniEval(
          app,
          "JSON.stringify({ pause: document.querySelector('.mini-pause').textContent, chips: [...document.querySelectorAll('.mini-chip')].map((c) => c.textContent) })",
        ),
      );
      expect(mini.pause).toBe(t.pick["mini.pause"]);
      expect(mini.chips.length).toBeGreaterThan(0);
      for (const chip of mini.chips)
        expect(Object.values(t.pick)).toContain(chip);
      await shot(
        app,
        `${OUT}/20-locale-${system.locale}-mini-${system.args ? "lang" : "env"}.png`,
      );
      input([["key", "esc"]]);
      await poll(async () => !(await miniOpen(app)), 4000, "the mini to close");

      // The capture overlay.
      await windowEval(
        app,
        "renderer/index.html",
        // The capture settles when the user has chosen; do not wait for it.
        "void window.blinkling.action('capture')",
      );
      const overlay = await poll(
        async () => {
          const hint = await windowEval(
            app,
            "selection.html",
            "document.getElementById('hint')?.textContent",
          );
          return hint || false;
        },
        8000,
        "the capture overlay",
      );
      expect(overlay).toBe(t.capture.hint);
      expect(
        await windowEval(
          app,
          "selection.html",
          "document.documentElement.lang",
        ),
      ).toBe(system.locale);
      await pause(600);
      await shot(
        app,
        `${OUT}/21-locale-${system.locale}-capture-${system.args ? "lang" : "env"}.png`,
      );
    } finally {
      await app.close();
    }
  });
}
