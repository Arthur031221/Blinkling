import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, move } from "./support.mjs";
import { background, onBlink, reveal, bubble, sleep } from "./helpers.mjs";
import { record, r3 } from "./record.mjs";

/** The costume rows of checklist-324: a scene per model, the pieces in every
 * pose, model and effort together, and the Settings switch. */

const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
const pageOf = (app, name) => app.windows().find((p) => p.url().includes(name));
const picture = () => {
  const png = new PNG({ width: 360, height: 240 });
  for (let i = 0; i < png.data.length; i += 4)
    png.data.set([30, 140, 90, 255], i);
  return PNG.sync.write(png).toString("base64");
};
const MARK = {
  opus: "#c9374d",
  sonnet: 'fill-opacity=".12"',
  haiku: "#ee6a56",
  fable: "#7c5fc4",
};
const outfit = (page) =>
  page.evaluate((marks) => {
    const svg = document.querySelector("svg").innerHTML;
    return Object.entries(marks)
      .filter(([, m]) => svg.includes(m))
      .map(([name]) => name);
  }, MARK);
const keysOf = (page) => page.evaluate(() => window.__keys);
const watch = (page) =>
  page.evaluate(() => {
    window.__keys = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__keys.at(-1) !== key) window.__keys.push(key);
      requestAnimationFrame(step);
    };
    step();
  });
/** Time between animation frames while a scene plays. */
const timing = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        const step = (now) => {
          gaps.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(step);
          else {
            gaps.sort((a, b) => a - b);
            resolve({
              frames: gaps.length,
              p95: gaps[Math.floor(gaps.length * 0.95)],
              max: gaps.at(-1),
            });
          }
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
const around = async (page, w = 420, h = 380) => {
  const b = await page.evaluate(() => {
    const r = document.querySelector(".blink-body").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const x = Math.max(0, Math.round(b.x - w / 2));
  const y = Math.max(0, Math.round(b.y - h * 0.62));
  return `${w}:${h}:${x}:${y}`;
};
const attach = (app) =>
  app.evaluate(
    async ({ screen }, data) =>
      globalThis.blinklingTest.attachCapture({
        image: { id: "c", name: "a.png", mediaType: "image/png", data },
        display: screen.getPrimaryDisplay(),
        region: { x: 300, y: 200, width: 360, height: 240 },
      }),
    picture(),
  );
const open = async (app) => {
  await background(app);
  await sleep(1500);
  await attach(app);
  await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
  return cardPage(app);
};
const pick = (card, model, effort) =>
  card.evaluate((s) => window.blinkling.select(s), { model, effort });
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
const played = (page, before, what) =>
  expect
    .poll(async () => (await keysOf(page)).slice(before).join(" "), {
      timeout: 6000,
    })
    .toContain(what);
const MODELS = ["opus", "sonnet", "haiku", "fable"];

test("every model plays its own scene once, inside the frame budget", async () => {
  test.setTimeout(400000);
  const { app, page } = await launch();
  try {
    const card = await open(app);
    await sleep(5000);
    await watch(page);
    await pick(card, "sonnet", "medium");
    await sleep(3600);
    // Frame timing first, with nothing else running on the display.
    const rows = {};
    for (const model of ["opus", "haiku", "fable", "sonnet"]) {
      const before = (await keysOf(page)).length;
      await pick(card, model, "medium");
      await played(page, before, `costume:model:${model}`);
      rows[model] = await timing(page, 3200);
      await sleep(1500);
    }
    writeFileSync(
      join(r3, "costume_scene-324-perf.json"),
      JSON.stringify(rows, null, 2),
    );
    console.log(`costume_scene timing ${JSON.stringify(rows)}`);
    for (const [model, row] of Object.entries(rows)) {
      expect(row.p95, `${model} p95`).toBeLessThanOrEqual(16.8);
      expect(row.max, `${model} slowest frame`).toBeLessThan(50);
    }
    // One recording per model.
    for (const model of ["haiku", "opus", "sonnet", "fable"]) {
      const rec = record("costume_scene", {
        suffix: `-324-${model}`,
        fps: 12,
      });
      try {
        const crop = await around(page);
        const before = (await keysOf(page)).length;
        await pick(card, model, "medium");
        await played(page, before, `costume:model:${model}`);
        for (let i = 0; i < 9; i++) {
          rec.frame(`${model}-${i}`, crop);
          await sleep(350);
        }
        await sleep(1200);
        const keys = (await keysOf(page)).slice(before);
        expect(keys.filter((k) => k.startsWith("costume:")).length).toBe(1);
        expect(await outfit(page)).toEqual([model]);
        rec.frame(`${model}-worn`, crop);
        await sleep(700);
      } finally {
        await rec.stop();
      }
    }
  } finally {
    await app.close().catch(() => {});
  }
});

test("model and effort combine, a repeat does nothing, the first change after start plays, and reduced motion shows a still", async () => {
  test.setTimeout(300000);
  const { app, page } = await launch();
  const rec = record("costume_combine", { suffix: "-324", fps: 10 });
  try {
    const card = await open(app);
    await watch(page);
    const crop = await around(page);
    // Nothing fires at start.
    await sleep(2500);
    expect((await keysOf(page)).some((k) => k.startsWith("costume:"))).toBe(
      false,
    );
    rec.frame("start-quiet", crop);
    // The very first change after start plays, with the state still loading.
    let before = (await keysOf(page)).length;
    await pick(card, "opus", "high");
    await played(page, before, "costume:model:opus");
    for (let i = 0; i < 6; i++) {
      rec.frame(`first-opus-high-${i}`, crop);
      await sleep(450);
    }
    await sleep(1500);
    expect(await outfit(page)).toEqual(["opus"]);
    // The same value again: nothing.
    before = (await keysOf(page)).length;
    await pick(card, "opus", "high");
    await sleep(2500);
    expect(
      (await keysOf(page)).slice(before).some((k) => k.startsWith("costume:")),
    ).toBe(false);
    rec.frame("same-value", crop);
    // The effort alone changes the performance, the model's piece stays.
    before = (await keysOf(page)).length;
    await pick(card, "opus", "max");
    await played(page, before, "costume:effort:max");
    for (let i = 0; i < 5; i++) {
      rec.frame(`opus-max-${i}`, crop);
      await sleep(500);
    }
    await sleep(3000);
    expect(await outfit(page)).toEqual(["opus"]);
    // A second combination: another outfit and another show.
    before = (await keysOf(page)).length;
    await pick(card, "haiku", "low");
    await played(page, before, "costume:model:haiku");
    for (let i = 0; i < 6; i++) {
      rec.frame(`haiku-low-${i}`, crop);
      await sleep(450);
    }
    await sleep(2500);
    expect(await outfit(page)).toEqual(["haiku"]);
    // Reduced motion: a short still pose, no props moving.
    await page.emulateMedia({ reducedMotion: "reduce" });
    before = (await keysOf(page)).length;
    await pick(card, "fable", "xhigh");
    await sleep(500);
    const props = [];
    for (let i = 0; i < 6; i++) {
      props.push(
        await page.evaluate(() => document.querySelectorAll(".prop").length),
      );
      rec.frame(`reduced-${i}`, crop);
      await sleep(300);
    }
    await sleep(2000);
    console.log(`costume_combine reduced props ${props.join(",")}`);
    expect(Math.max(...props), "no moving props").toBeLessThanOrEqual(2);
    expect(await outfit(page)).toEqual(["fable"]);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});

for (const model of MODELS) {
  test(`the ${model} outfit hugs the body standing, at every edge, during an eat and in the guide pose`, async () => {
    test.setTimeout(240000);
    const { app, page } = await launch();
    const rec = record("costume_fit", { suffix: `-324-${model}`, fps: 8 });
    try {
      const card = await open(app);
      await sleep(4000);
      await watch(page);
      await pick(card, model === "sonnet" ? "haiku" : "sonnet", "medium");
      await sleep(3600);
      await pick(card, model, "medium");
      await sleep(4500);
      expect(await outfit(page)).toEqual([model]);
      // Close the card, then stand and peek at each edge.
      await card.keyboard.press("Escape");
      await sleep(900);
      const frame = await app.evaluate(
        ({ screen }) => screen.getPrimaryDisplay().workArea,
      );
      for (const [edge, ratio, name] of [
        ["right", 0.5, "right"],
        ["left", 0.5, "left"],
        ["bottom", 0.5, "bottom"],
        ["top", 0.5, "top"],
      ]) {
        await place(app, edge, ratio);
        await sleep(800);
        move(frame.x + frame.width / 2, frame.y + frame.height / 2);
        await sleep(900);
        rec.frame(`${model}-${name}-rest`, await around(page, 300, 300));
        await onBlink(page);
        await sleep(500);
        rec.frame(`${model}-${name}-out`, await around(page, 300, 300));
        move(frame.x + frame.width / 2, frame.y + frame.height / 2);
        await sleep(900);
        expect(await outfit(page), `${edge} edge`).toEqual([model]);
      }
      // An eat: the mouth is wide open while the picture goes in.
      await place(app, "right", 0.5);
      await sleep(900);
      await app.evaluate(({ screen }) => {
        const t = globalThis.blinklingTest;
        t.features.setSession({
          subscribe: () => () => {},
          send: async () => {},
          stop: async () => {},
        });
        const c = t.features.capture,
          bounds = screen.getPrimaryDisplay().bounds;
        c.list = async () => [
          {
            id: "w1",
            title: "Docs - Google Chrome",
            bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          },
        ];
        c.companion = () => true;
        c.overlays.open = async () => {
          await new Promise((r) => setTimeout(r, 800));
          return { kind: "screen" };
        };
        void t.features.select();
      });
      for (let i = 0; i < 16; i++) {
        rec.frame(`${model}-eat-${i}`, await around(page, 340, 340));
        await sleep(220);
      }
      await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
      await cardPage(app).keyboard.press("Escape");
      await sleep(900);
      expect(await outfit(page)).toEqual([model]);
      // The guide pose: a stick in hand while it points.
      await app.evaluate(
        (_, regions) => {
          const listeners = new Set();
          const guide = {
            purpose: "A page with three parts.",
            title: "Test page",
            sections: regions.map((r) => ({
              ...r,
              description: r.label,
              paragraphs: [r.label],
            })),
            steps: regions.map((r) => ({
              id: `t-${r.id}`,
              note: `Look at the ${r.label}.`,
              regionIds: [r.id],
            })),
          };
          globalThis.blinklingTest.features.setSession({
            subscribe: (f) => {
              listeners.add(f);
              return () => listeners.delete(f);
            },
            send: async (turn) => {
              setTimeout(() => {
                for (const f of listeners) {
                  f({
                    type: "message",
                    role: "assistant",
                    content: [{ type: "text", text: JSON.stringify(guide) }],
                  });
                  f({ type: "done", turnId: turn.id });
                }
              }, 300);
            },
            stop: async () => {},
          });
        },
        [
          {
            id: "s1",
            label: "Address bar",
            rect: { x: 20, y: 20, width: 300, height: 80 },
          },
          {
            id: "s2",
            label: "Logo",
            rect: { x: 960, y: 20, width: 300, height: 80 },
          },
        ],
      );
      await reveal(page);
      const box = await bubble(page, "guide").boundingBox();
      const at = {
        x: frame.x + box.x + box.width / 2,
        y: frame.y + box.y + box.height / 2,
      };
      move(at.x, at.y);
      await sleep(300);
      const { click } = await import("./support.mjs");
      click(at.x, at.y);
      await expect(cardPage(app).locator(".gl-guide-head")).toContainText(
        /1.*2/,
        { timeout: 10000 },
      );
      for (let i = 0; i < 6; i++) {
        rec.frame(`${model}-guide-${i}`, await around(page, 360, 360));
        await sleep(450);
      }
      expect(await outfit(page)).toEqual([model]);
    } finally {
      await rec.stop();
      await app.close().catch(() => {});
    }
  });
}

test("the costume switch is on by default, keeps the piece through card, retreat and a long wait, never replays, and the choice survives a restart", async () => {
  test.setTimeout(400000);
  const rec = record("costume_setting", { suffix: "-324", fps: 6 });
  let first;
  let second;
  try {
    first = await launch();
    const { app, page, data } = first;
    const card = await open(app);
    await sleep(4000);
    await watch(page);
    const crop = await around(page);
    await pick(card, "sonnet", "medium");
    await sleep(3600);
    await pick(card, "fable", "medium");
    await sleep(5000);
    expect(await outfit(page)).toEqual(["fable"]);
    rec.frame("on-by-default-piece", crop);
    const settingsOf = async (a) => {
      await a.evaluate(() => globalThis.blinklingTest.settings.open());
      await expect.poll(() => pageOf(a, "/settings/index.html")).toBeTruthy();
      return pageOf(a, "/settings/index.html");
    };
    let settings = await settingsOf(app);
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    rec.frame("switch-on");
    await app.evaluate(() => globalThis.blinklingTest.settings.close());
    await onBlink(page);
    // Card open and close, retreat, then a long wait: the piece stays, and no
    // scene replays.
    const base = (await keysOf(page)).filter((k) => k.startsWith("costume:"));
    await attach(app);
    await expect.poll(() => !!cardPage(app), { timeout: 8000 }).toBe(true);
    await sleep(2000);
    expect(await outfit(page)).toEqual(["fable"]);
    rec.frame("card-open", crop);
    await cardPage(app).keyboard.press("Escape");
    await sleep(1200);
    const frame = await app.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().workArea,
    );
    move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await sleep(2500);
    rec.frame("retreated", crop);
    expect(await outfit(page)).toEqual(["fable"]);
    await sleep(60000);
    await onBlink(page);
    rec.frame("after-60s", crop);
    expect(await outfit(page)).toEqual(["fable"]);
    expect(
      (await keysOf(page)).filter((k) => k.startsWith("costume:")),
      "no scene replayed",
    ).toEqual(base);
    // Restart: the piece is there, the scene does not play.
    await app.close();
    second = await launch({ data });
    await second.page.waitForTimeout(100);
    await watch(second.page);
    await sleep(6000);
    await onBlink(second.page);
    rec.frame("restarted", await around(second.page));
    await expect
      .poll(() => outfit(second.page), { timeout: 8000 })
      .toEqual(["fable"]);
    expect(
      (await keysOf(second.page)).some((k) => k.startsWith("costume:")),
      "no scene after the restart",
    ).toBe(false);
    // Off: no piece and no scene, and the choice is kept across a restart.
    settings = await settingsOf(second.app);
    await settings.locator("#costume-switch").click();
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect.poll(() => outfit(second.page), { timeout: 4000 }).toEqual([]);
    rec.frame("off", await around(second.page));
    await second.app.close();
    const third = await launch({ data });
    second = third;
    await third.page.waitForTimeout(100);
    await watch(third.page);
    await sleep(5000);
    await onBlink(third.page);
    expect(await outfit(third.page)).toEqual([]);
    settings = await settingsOf(third.app);
    await expect(settings.locator("#costume-switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    rec.frame("off-after-restart", await around(third.page));
  } finally {
    await rec.stop();
    await first?.app.close().catch(() => {});
    await second?.app.close().catch(() => {});
  }
});
