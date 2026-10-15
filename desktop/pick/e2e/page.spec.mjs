import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
import {
  SCALE,
  px,
  launch,
  openFixture,
  record,
  log,
  frames,
  frameStats,
  domRect,
  domSentence,
  pageEval,
  raised,
  miniOpen,
  miniEval,
  sameRect,
  near,
  sent,
  input,
  poll,
  shot,
} from "./harness.mjs";

const OUT = process.env.PICK_SHOTS ?? `/tmp/pick-e2e-${SCALE}`;
mkdirSync(OUT, { recursive: true });
const png = (buffer) => PNG.sync.read(buffer);

// A failed test must not leave the key or the button down in the X server for the next one.
test.afterEach(() => {
  input([["release"], ["up", "ctrl"], ["up", "shift"]]);
});

async function start(env) {
  const app = await launch({ scale: SCALE, env });
  await openFixture(app);
  await record(app);
  return app;
}

const screen = async (app, name) => {
  const file = `${OUT}/${name}.png`;
  await shot(app, file);
  return file;
};

/** Pointer on a DIP point, the pick key held until the layer is up. */
async function hold(app, point) {
  input([["move", px(point.x), px(point.y)]]);
  const [downAt] = input([["down", "ctrl"]]);
  await poll(() => raised(app), 3000, "the layer to rise");
  // A person cannot click within a frame of the layer appearing: wait for its first outline.
  await poll(
    async () => sent(await log(app), "outline").length > 0,
    3000,
    "the first outline",
  );
  await pause(120);
  return downAt;
}
const release = () => input([["up", "ctrl"]]);
const click = () => input([["press"], ["release"]]);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (app, channel, count = 1) => {
  let data;
  await poll(
    async () => ((data = await log(app)), sent(data, channel).length >= count),
    4000,
    `${channel} x${count}`,
  );
  return data;
};
const outlineNear = async (app, rect, label) => {
  let last;
  await poll(
    async () => {
      last = sent(await log(app), "outline").at(-1);
      return last?.rect && sameRect(last.rect, rect, 2);
    },
    4000,
    `${label} outline ${JSON.stringify(rect)}, last ${JSON.stringify(last)}`,
  );
  return last;
};
const stats = async (app, surface) => frameStats(await frames(app), surface);

/** A frame gate that is honest about the machine: Xvfb with llvmpipe. */
const gate = (s, { max = 50, p95 = 20 } = {}) => {
  expect(s.frames, `${s.surface} drew frames`).toBeGreaterThan(5);
  expect(s.jumps, `${s.surface} box jumps`).toBe(0);
  expect(s.p95, `${s.surface} p95`).toBeLessThanOrEqual(p95);
  expect(s.max, `${s.surface} max`).toBeLessThanOrEqual(max);
};

/** Pixels that differ along a horizontal band, as a share of its length. */
function differs(a, b, x0, x1, y, band = 3) {
  let changed = 0;
  const total = Math.round((x1 - x0) * SCALE);
  for (let x = Math.round(x0 * SCALE); x < Math.round(x1 * SCALE); x++) {
    let d = 0;
    for (let k = -band; k <= band; k++) {
      const yy = Math.round(y * SCALE) + k;
      const i = (yy * a.width + x) * 4;
      d = Math.max(
        d,
        Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
    }
    if (d > 40) changed++;
  }
  return changed / total;
}

test("M4 the layer rises one frame after the 250 ms threshold, not before, with the crayon badge", async () => {
  const app = await start();
  try {
    const p = await domRect(app, "#photo");
    input([["move", px(p.x + 40), px(p.y + 40)]]);
    const [downAt] = input([["down", "ctrl"]]);
    await pause(150);
    expect(await raised(app), "not raised at 150 ms").toBe(false);
    await poll(() => raised(app), 2000, "raise");
    const data = await log(app);
    const lateness = data.shows[0] - downAt;
    console.log(
      `SCALE ${SCALE}: layer shown ${lateness.toFixed(0)} ms after the key went down`,
    );
    expect(lateness).toBeGreaterThanOrEqual(245);
    expect(lateness).toBeLessThanOrEqual(250 + 50);
    expect(sent(data, "badge")[0]).toEqual({ name: "crayon" });
    const visible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (w) => w.webContents.getURL().includes("layer.html") && w.isVisible(),
      ),
    );
    expect(visible).toBe(true);
    await pause(400);
    await screen(app, "01-held");
    release();
  } finally {
    await app.close();
  }
});

test("M7 the first hold says to click once, near the cursor, and never again", async () => {
  const app = await start();
  try {
    const p = await domRect(app, "#photo");
    await hold(app, { x: p.x + 40, y: p.y + 40 });
    const first = await waitFor(app, "hint");
    expect(sent(first, "hint")[0].text).toMatch(/click once/i);
    const text = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("layer.html"))
        .webContents.executeJavaScript(
          "document.querySelector('.pick-hint').textContent",
        ),
    );
    expect(text).toMatch(/click once/i);
    release();
    await poll(async () => !(await raised(app)), 2000, "drop");
    await hold(app, { x: p.x + 40, y: p.y + 40 });
    await pause(300);
    expect(
      sent(await log(app), "hint").length,
      "the hint is not sent a second time",
    ).toBe(1);
    release();
  } finally {
    await app.close();
  }
});

test("M4 N1.3 Ctrl+click on text takes the sentence: outline, a crayon stroke per line, a text chip", async () => {
  const app = await start();
  try {
    const dom = await domSentence(app);
    expect(dom.lines.length, "the fixture sentence wraps").toBeGreaterThan(1);
    await screen(app, "02-base");
    const base = png(readFileSync(`${OUT}/02-base.png`));
    await hold(app, dom.point);
    const outline = await outlineNear(app, dom.bounds, "sentence");
    expect(outline.kind).toBe("text");
    await pause(450);
    await screen(app, "03-text-outline");
    const during = png(readFileSync(`${OUT}/03-text-outline.png`));
    // The outline is really on screen along the sentence's top edge, and the page far away is untouched.
    expect(
      differs(
        base,
        during,
        dom.bounds.x + 20,
        dom.bounds.x + dom.bounds.width - 20,
        dom.bounds.y,
      ),
    ).toBeGreaterThan(0.8);
    expect(differs(base, during, 800, 1000, 100)).toBe(0);

    const before = (await frames(app)).filter(
      (f) => f.surface === "pick-effect",
    ).length;
    click();
    const data = await waitFor(app, "taken");
    const taken = sent(data, "taken")[0];
    expect(taken.kind).toBe("text");
    expect(taken.effect.effect).toBe("crayon-lines");
    const crayons = taken.effect.strokes.filter((s) => s.role === "crayon");
    expect(crayons.length, "one crayon stroke per rendered line").toBe(
      dom.lines.length,
    );
    expect(sameRect(taken.bounds, dom.bounds, 2)).toBe(true);
    expect(taken.effect.total).toBeLessThanOrEqual(450);
    await pause(700);
    const run = (await frames(app))
      .filter((f) => f.surface === "pick-effect")
      .slice(before);
    const span = run.at(-1).t - run[0].t;
    console.log(
      `SCALE ${SCALE}: crayon effect ran ${span.toFixed(0)} ms over ${run.length} frames`,
    );
    expect(span).toBeLessThanOrEqual(450 + 20);
    await screen(app, "04-text-taken");

    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
    const mini = JSON.parse(
      await miniEval(
        app,
        `JSON.stringify({
      text: [...document.querySelectorAll('.mini-entry-text')].map((e) => e.textContent),
      images: document.querySelectorAll('.mini-entry-image').length,
      chips: [...document.querySelectorAll('.mini-chip')].map((c) => [c.dataset.id, c.classList.contains('is-default')])
    })`,
      ),
    );
    expect(mini.text).toHaveLength(1);
    expect(mini.text[0]).toMatch(/The second sentence/);
    expect(mini.images).toBe(0);
    expect(mini.chips.filter(([, d]) => d)).toHaveLength(1);
    await pause(600);
    await screen(app, "05-text-mini");
    await miniEval(app, "document.querySelector('.mini-input').focus()");
    input([["key", "esc"]]);
    await poll(async () => !(await miniOpen(app)), 3000, "escape closes");
  } finally {
    await app.close();
  }
});

test("M4 N1.1 Ctrl+click on an image: loop effect, flight into Blink, image chip with the highlighted default, Enter sends", async () => {
  const app = await start();
  try {
    const photo = await domRect(app, "#photo");
    await hold(app, { x: photo.x + 60, y: photo.y + 50 });
    const o = await outlineNear(app, photo, "image");
    expect(o.kind).toBe("image");
    click();
    const taken = sent(await waitFor(app, "taken"), "taken")[0];
    expect(taken.kind).toBe("image");
    expect(taken.effect.effect).toBe("loop");
    expect(taken.effect.total).toBeLessThanOrEqual(450);
    await pause(500);
    await screen(app, "06-image-taken");
    release();
    await poll(
      async () => (await log(app)).flights.length > 0,
      4000,
      "the flight",
    );
    await pause(120);
    await screen(app, "07-image-flight");
    await poll(() => miniOpen(app), 6000, "the mini composer");
    const data = await log(app);
    const flight = data.flights[0];
    expect(sameRect(flight.items[0].bounds, photo, 2)).toBe(true);
    expect(flight.items[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    const blink = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("renderer/index.html"))
        .webContents.executeJavaScript(
          "(() => { const r = document.getElementById('blink').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
        ),
    );
    console.log(
      `SCALE ${SCALE}: flight to ${JSON.stringify(flight.to)}, Blink at ${JSON.stringify(blink)}`,
    );
    expect(flight.to.x).toBeGreaterThanOrEqual(blink.x - 60);
    expect(flight.to.x).toBeLessThanOrEqual(blink.x + blink.width + 60);
    expect(flight.to.y).toBeGreaterThanOrEqual(blink.y - 60);
    expect(flight.to.y).toBeLessThanOrEqual(blink.y + blink.height + 60);
    const layerFrames = (await frames(app)).filter(
      (f) => f.surface === "flight",
    );
    const last = layerFrames.at(-1).box;
    expect(near(last.x + last.width / 2, flight.to.x, 24)).toBe(true);
    expect(near(last.y + last.height / 2, flight.to.y, 24)).toBe(true);

    await pause(500);
    const mini = JSON.parse(
      await miniEval(
        app,
        `JSON.stringify({
      images: document.querySelectorAll('.mini-entry-image').length,
      thumb: document.querySelector('.mini-thumb')?.src.slice(0, 22),
      chips: [...document.querySelectorAll('.mini-chip')].map((c) => [c.textContent, c.classList.contains('is-default')]),
      focus: document.activeElement?.className
    })`,
      ),
    );
    expect(mini.images).toBe(1);
    expect(mini.thumb).toBe("data:image/png;base64,");
    expect(mini.chips).toHaveLength(3);
    expect(mini.chips.filter(([, d]) => d)).toHaveLength(1);
    expect(mini.focus).toBe("mini-input");
    await screen(app, "08-image-mini");

    input([["key", "enter"]]);
    await poll(
      async () => (await log(app)).turns.length === 1,
      4000,
      "the turn",
    );
    const [turn] = (await log(app)).turns;
    expect(turn.source).toBe("quick-ask");
    expect(turn.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(turn.attachments).toHaveLength(1);
    expect(turn.attachments[0].mediaType).toBe("image/png");
    await poll(
      async () => !(await miniOpen(app)),
      3000,
      "the mini closes after a send",
    );

    const all = [];
    for (const surface of ["pick-effect", "flight", "mini-composer"]) {
      const s = await stats(app, surface);
      console.log(`SCALE ${SCALE}: ${JSON.stringify(s)}`);
      const ts = (await frames(app))
        .filter((f) => f.surface === surface)
        .map((f) => f.t);
      console.log(
        `SCALE ${SCALE}: ${surface} gaps ${ts
          .slice(1)
          .map((t, i) => Math.round(t - ts[i]))
          .join(" ")}`,
      );
      all.push(s);
    }
    all.forEach((s) => gate(s));
  } finally {
    await app.close();
  }
});

test("M4 Ctrl+click on a table: outline sweep over the table, the table goes as text", async () => {
  const app = await start();
  try {
    const table = await domRect(app, "#prices");
    await hold(app, { x: table.x + 30, y: table.y + 30 });
    const o = await outlineNear(app, table, "table");
    expect(o.kind).toBe("table");
    click();
    const taken = sent(await waitFor(app, "taken"), "taken")[0];
    expect(taken.kind).toBe("table");
    expect(taken.effect.effect).toBe("outline-sweep");
    expect(taken.effect.total).toBeLessThanOrEqual(450);
    await pause(600);
    await screen(app, "09-table-taken");
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
    const entry = JSON.parse(
      await miniEval(
        app,
        "JSON.stringify([...document.querySelectorAll('.mini-entry')].map((e) => e.className))",
      ),
    );
    expect(entry).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test("N1.2 Ctrl+drag past 6 px takes an area equal to the dragged rectangle and selects no page text", async () => {
  const app = await start();
  try {
    const t = await domRect(app, "#story-text");
    const from = { x: t.x + 10, y: t.y + 6 };
    const to = { x: t.x + 300, y: t.y + 150 };
    await hold(app, from);
    input([["drag", px(from.x), px(from.y), px(to.x), px(to.y), 400]]);
    const data = await waitFor(app, "taken");
    const taken = sent(data, "taken")[0];
    expect(taken.kind).toBe("area");
    expect(
      sameRect(
        taken.bounds,
        { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
        2,
      ),
      JSON.stringify(taken.bounds),
    ).toBe(true);
    expect(
      sent(data, "drag").some((d) => d.rect),
      "a rubber band was drawn",
    ).toBe(true);
    expect(
      sent(data, "badge").some((b) => b.name === "crosshair"),
      "the badge turns to the crosshair while dragging",
    ).toBe(true);
    expect(await pageEval(app, "getSelection().toString()")).toBe("");
    await pause(300);
    await screen(app, "10-area");
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
  } finally {
    await app.close();
  }
});

test("MP-3 the rubber band sits on the pointer while the button is held, not behind it", async () => {
  const app = await start();
  try {
    const t = await domRect(app, "#story-text");
    const from = { x: t.x + 10, y: t.y + 6 };
    const to = { x: t.x + 300, y: t.y + 150 };
    await hold(app, from);
    const path = Array.from({ length: 24 }, (_, i) => [
      [
        "move",
        px(from.x + ((to.x - from.x) * (i + 1)) / 24),
        px(from.y + ((to.y - from.y) * (i + 1)) / 24),
      ],
      ["wait", 8],
    ]).flat();
    const steps = [["move", px(from.x), px(from.y)], ["press"], ...path];
    input(steps);
    await pause(300);
    const drawn = (await frames(app)).filter(
      (f) => f.surface === "pick-band" || f.surface === "pick-pointer",
    );
    const bands = drawn.filter((f) => f.surface === "pick-band");
    const pointers = drawn.filter((f) => f.surface === "pick-pointer");
    expect(bands.length, "the band was drawn while dragging").toBeGreaterThan(
      8,
    );
    // In every frame the band's far corner is where the pointer is in that frame.
    const behind = bands.filter((band, i) => {
      const at = pointers[i].box;
      return (
        Math.abs(band.box.x + band.box.width - at.x) > 1 ||
        Math.abs(band.box.y + band.box.height - at.y) > 1
      );
    });
    expect(behind.length, "frames with the band behind the pointer").toBe(0);
    await screen(app, "10b-held");
    input([["release"]]);
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
  } finally {
    await app.close();
  }
});

test("MP-5 the mini composer is shown within 200 ms of the pick key coming up", async () => {
  const app = await start();
  try {
    const p = await domRect(app, "#photo");
    await hold(app, { x: p.x + 40, y: p.y + 40 });
    click();
    await waitFor(app, "taken");
    // Watch from inside the main process, so polling from here adds no delay.
    const shown = app.evaluate(
      () =>
        new Promise((resolve) => {
          const win = globalThis.blinklingTest.pick.test.miniWindow;
          const look = () =>
            win.isVisible() ? resolve(Date.now()) : setTimeout(look, 2);
          look();
        }),
    );
    const releasedAt = Date.now();
    release();
    const took = (await shown) - releasedAt;
    console.log(`SCALE ${SCALE}: mini visible ${took} ms after release`);
    expect(took).toBeLessThanOrEqual(200);
  } finally {
    await app.close();
  }
});

test("N1.2 a drag of 6 px or less is a click, not an area", async () => {
  const app = await start();
  try {
    const p = await domRect(app, "#photo");
    const from = { x: p.x + 40, y: p.y + 40 };
    await hold(app, from);
    input([
      ["drag", px(from.x), px(from.y), px(from.x + 4), px(from.y + 2), 120],
    ]);
    const taken = sent(await waitFor(app, "taken"), "taken")[0];
    expect(taken.kind).toBe("image");
    release();
  } finally {
    await app.close();
  }
});

test("Esc discards the pick, takes nothing and gives focus back", async () => {
  const app = await start();
  try {
    await app.evaluate(() => globalThis.__fixture.focus());
    await poll(
      () => app.evaluate(() => globalThis.__fixture.isFocused()),
      3000,
      "fixture focus",
    );
    const photo = await domRect(app, "#photo");
    await hold(app, { x: photo.x + 40, y: photo.y + 40 });
    click();
    await waitFor(app, "taken");
    input([["key", "esc"]]);
    await poll(async () => !(await raised(app)), 3000, "the layer drops");
    release();
    await pause(900);
    const data = await log(app);
    expect(data.flights).toHaveLength(0);
    expect(data.turns).toHaveLength(0);
    expect(await miniOpen(app)).toBe(false);
  } finally {
    await app.close();
  }
});

test("Esc in the mini composer discards, sends nothing and returns the keyboard to the app that had it", async () => {
  const app = await start();
  try {
    await app.evaluate(() => globalThis.__fixture.focus());
    await poll(
      () => app.evaluate(() => globalThis.__fixture.isFocused()),
      3000,
      "fixture focus",
    );
    const photo = await domRect(app, "#photo");
    await hold(app, { x: photo.x + 40, y: photo.y + 40 });
    click();
    await waitFor(app, "taken");
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
    await poll(
      () =>
        app.evaluate(() =>
          globalThis.blinklingTest.pick.test.miniWindow.isFocused(),
        ),
      3000,
      "the mini takes the keyboard",
    );
    input([["key", "esc"]]);
    await poll(async () => !(await miniOpen(app)), 3000, "closes");
    await poll(
      () => app.evaluate(() => globalThis.__fixture.isFocused()),
      4000,
      "focus returns to the fixture",
    );
    expect((await log(app)).turns).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test("N1.5 Shift is not a capture key: holding it, and Shift+drag, do nothing", async () => {
  const app = await start();
  try {
    const t = await domRect(app, "#story-text");
    input([["move", px(t.x + 10), px(t.y + 6)]]);
    input([["down", "shift"]]);
    await pause(700);
    expect(await raised(app)).toBe(false);
    input([
      ["drag", px(t.x + 10), px(t.y + 6), px(t.x + 300), px(t.y + 100), 300],
    ]);
    await pause(300);
    input([["up", "shift"]]);
    const data = await log(app);
    expect(data.raises).toHaveLength(0);
    expect(data.shows).toHaveLength(0);
    expect(data.flights).toHaveLength(0);
    expect(await miniOpen(app)).toBe(false);
  } finally {
    await app.close();
  }
});

test("Ctrl+C, Ctrl+V and Ctrl+Tab are left alone: no layer, nothing swallowed", async () => {
  const app = await start();
  try {
    for (const key of ["c", "v", "tab"]) {
      input([
        ["down", "ctrl"],
        ["key", key],
        ["up", "ctrl"],
      ]);
      await pause(400);
      expect(await raised(app), `Ctrl+${key}`).toBe(false);
    }
    expect((await log(app)).shows).toHaveLength(0);
    // Ctrl+C reaches the focused page: copy really happened.
    await app.evaluate(() => globalThis.__fixture.focus());
    await poll(
      () => app.evaluate(() => globalThis.__fixture.isFocused()),
      3000,
      "focus",
    );
    await pageEval(
      app,
      "getSelection().selectAllChildren(document.getElementById('story-text')); 1",
    );
    input([
      ["down", "ctrl"],
      ["key", "c"],
      ["up", "ctrl"],
    ]);
    await pause(300);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toMatch(
      /Blink looks at your screen/,
    );
    expect(await raised(app)).toBe(false);
  } finally {
    await app.close();
  }
});

test("the first wheel tick drops the layer so scrolling works", async () => {
  const app = await start();
  try {
    const photo = await domRect(app, "#photo");
    await hold(app, { x: photo.x + 40, y: photo.y + 40 });
    input([["wheel", -1]]);
    await poll(
      async () => !(await raised(app)),
      3000,
      "the layer drops on a wheel tick",
    );
    const hidden = await app.evaluate(
      ({ BrowserWindow }) =>
        !BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("layer.html"))
          .isVisible(),
    );
    expect(hidden).toBe(true);
    release();
    await pause(600);
    expect((await log(app)).flights).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test("a secure field locks: no outline, no taken, the lock is drawn", async () => {
  const app = await start();
  try {
    const secret = await domRect(app, "#secret");
    await hold(app, { x: secret.x + 20, y: secret.y + 8 });
    click();
    await pause(100);
    await screen(app, "11-secure");
    await pause(400);
    const data = await log(app);
    expect(sent(data, "taken")).toHaveLength(0);
    expect(
      sent(data, "lock").length +
        sent(data, "outline").filter((o) => o.lock).length,
    ).toBeGreaterThan(0);
    release();
    await pause(500);
    expect(await miniOpen(app)).toBe(false);
  } finally {
    await app.close();
  }
});

test("a pick growth to the whole page in a browser offers 翻譯整頁, and clicking it sends the page as a translate turn", async () => {
  const app = await start();
  try {
    const dom = await domSentence(app);
    await hold(app, dom.point);
    let taken = 0;
    for (let i = 0; i < 6 && taken < 4; i++) {
      click();
      taken = sent(await waitFor(app, "taken", i + 1), "taken").length;
      await pause(150);
    }
    const kinds = sent(await log(app), "taken").map((t) => t.kind);
    console.log(`SCALE ${SCALE}: growth ${kinds.join(" > ")}`);
    expect(kinds.at(-1)).toBe("page");
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
    await poll(
      async () =>
        (await miniEval(
          app,
          "document.querySelectorAll('.mini-offer').length",
        )) > 0,
      3000,
      "the offer",
    );
    const offers = JSON.parse(
      await miniEval(
        app,
        "JSON.stringify([...document.querySelectorAll('.mini-offer')].map((o) => [o.dataset.id, o.textContent]))",
      ),
    );
    expect(offers.map(([id]) => id)).toContain("translate-page");
    await pause(500);
    await screen(app, "12-page-offer");
    await miniEval(
      app,
      "document.querySelector('.mini-offer[data-id=translate-page]').click()",
    );
    await poll(
      async () => (await log(app)).turns.length === 1,
      4000,
      "the translate turn",
    );
    const [turn] = (await log(app)).turns;
    expect(turn.source).toBe("quick-ask");
    expect(turn.text).toMatch(/翻譯|translate/i);
    expect(turn.attachments[0].mediaType).toBe("text/plain");
    expect(Buffer.from(turn.attachments[0].data, "base64").toString()).toMatch(
      /Lake notes/,
    );
  } finally {
    await app.close();
  }
});

test("N2.5 with auto explain on, the mini composer says it is paused and auto explain resumes on close", async () => {
  const app = await start({ BLINKLING_LOCALE: "zh-TW" });
  try {
    await app.evaluate(() => {
      globalThis.__auto = [];
      globalThis.blinklingTest.registerAction(
        "auto-explain",
        async (context) => {
          globalThis.__auto.push(context.enabled);
          return { ok: true };
        },
      );
    });
    const blinkWindow = (code) =>
      app.evaluate(
        ({ BrowserWindow }, code) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes("renderer/index.html"))
            .webContents.executeJavaScript(code),
        code,
      );
    await blinkWindow("window.blinkling.action('auto-explain')");
    await poll(
      async () => (await app.evaluate(() => globalThis.__auto)).length === 1,
      3000,
      "auto explain on",
    );

    const photo = await domRect(app, "#photo");
    await hold(app, { x: photo.x + 40, y: photo.y + 40 });
    click();
    await waitFor(app, "taken");
    release();
    await poll(() => miniOpen(app), 6000, "the mini composer");
    await pause(500);
    const line = JSON.parse(
      await miniEval(
        app,
        "JSON.stringify({ shown: !document.querySelector('.mini-pause').hidden, text: document.querySelector('.mini-pause').textContent })",
      ),
    );
    expect(line.shown).toBe(true);
    expect(line.text).toBe("暫停自動解說");
    await screen(app, "13-pause-line");
    expect(await app.evaluate(() => globalThis.__auto)).toEqual([true, false]);
    input([["key", "esc"]]);
    await poll(
      async () => (await app.evaluate(() => globalThis.__auto)).length === 3,
      4000,
      "auto explain resumes",
    );
    expect(await app.evaluate(() => globalThis.__auto)).toEqual([
      true,
      false,
      true,
    ]);
  } finally {
    await app.close();
  }
});

test("K2 a second pick within 60 s stays in the chat; one 66 s later opens a new chat", async () => {
  test.setTimeout(150_000);
  const app = await start();
  try {
    await app.evaluate(() => {
      globalThis.__fresh = [];
      const grouper = globalThis.blinklingTest.pick.test.grouper;
      const join = grouper.join;
      grouper.join = (...args) => {
        const result = join(...args);
        globalThis.__fresh.push(result.fresh);
        return result;
      };
    });
    const photo = await domRect(app, "#photo");
    const once = async () => {
      const seen = (await app.evaluate(() => globalThis.__fresh.length)) + 1;
      await hold(app, { x: photo.x + 40, y: photo.y + 40 });
      click();
      await waitFor(app, "taken", seen);
      release();
      await poll(() => miniOpen(app), 6000, "the mini composer");
      input([["key", "esc"]]);
      await poll(async () => !(await miniOpen(app)), 3000, "closed");
      await pause(300);
    };
    await once();
    await once();
    await pause(66_000);
    await once();
    expect(await app.evaluate(() => globalThis.__fresh)).toEqual([
      true,
      false,
      true,
    ]);
  } finally {
    await app.close();
  }
});
