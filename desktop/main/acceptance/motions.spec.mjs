import { test, expect } from "@playwright/test";
import { launch, native, bodyPoint } from "./support.mjs";
import { background, reveal } from "./helpers.mjs";
import { record } from "./record.mjs";

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

/** Remembers every pose the figure played, frame by frame. */
const watch = (page) =>
  page.evaluate(() => {
    window.__poses = [];
    const step = () => {
      const key = window.desktop.character.key();
      if (window.__poses.at(-1) !== key) window.__poses.push(key);
      requestAnimationFrame(step);
    };
    step();
  });
const played = (page) => page.evaluate(() => window.__poses);
const sees = (page, key, timeout = 8000) =>
  expect
    .poll(() => played(page), { timeout, message: `the ${key} pose played` })
    .toContain(key);

/** Press on Blink, carry it, and let go. `path` is a list of screen points. */
const carry = (from, path) =>
  native([
    { type: "move", x: from.x, y: from.y },
    { type: "down" },
    { type: "wait", seconds: 0.4 },
    ...path.map(([x, y]) => ({ type: "move", x, y, wait: 0.02 })),
    { type: "wait", seconds: 0.3 },
    { type: "up" },
  ]);

const circle = (cx, cy, r, loops) =>
  Array.from({ length: Math.round(loops * 48) }, (_, i) => [
    cx + r * Math.cos((i / 48) * Math.PI * 2),
    cy + r * Math.sin((i / 48) * Math.PI * 2),
  ]);

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

test("Blink appears with a motion when it launches", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch({ env: { BLINKLING_MOTIONS: "1" } });
  const rec = record("motions_appear", { suffix: "-324" });
  try {
    await background(app);
    await watch(page);
    rec.frame("start");
    await sees(page, "appear");
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(1500);
    rec.frame("mid");
    // It goes back to the edge by itself once the motion is over.
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "peek", {
      timeout: 12000,
    });
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("Blink leaves with a motion when the app quits: it waves, jumps out of the picture and only then is the app gone", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch({ env: { BLINKLING_MOTIONS: "1" } });
  const rec = record("leave_motion", {
    suffix: "-324",
    also: ["motions_leave"],
  });
  try {
    await background(app);
    await watch(page);
    await page.waitForTimeout(5500);
    const blink = await app.evaluate(() =>
      globalThis.blinklingTest.blink.getBounds(),
    );
    const box = await page.evaluate(() => {
      const r = document.querySelector(".blink-body").getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Blink and the room it jumps through, on the screen.
    const crop = `${Math.round(box.width + 240)}:${Math.round(box.height + 300)}:${Math.max(0, Math.round(blink.x + box.x - 120))}:${Math.max(0, Math.round(blink.y + box.y - 200))}`;
    const first = rec.frame("before", crop);
    const gone = new Promise((done) => app.process().on("exit", done));
    const quitAt = Date.now();
    void app.evaluate(({ app }) => app.quit());
    await sees(page, "leave", 3000);
    const seen = [];
    for (const label of ["wave", "crouch", "jump", "out"]) {
      await page.waitForTimeout(550).catch(() => {});
      seen.push(rec.frame(label, crop));
    }
    await gone;
    // The motion is played in full before the app is gone.
    expect(Date.now() - quitAt).toBeGreaterThan(2000);
    // Blink is drawn in the first frames and is out of the picture in the last.
    const { PNG } = await import("pngjs");
    const { readFileSync } = await import("node:fs");
    const read = (f) => PNG.sync.read(readFileSync(f));
    const differs = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.data.length; i += 4)
        if (
          Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) >
          60
        )
          n++;
      return n;
    };
    const frames = [first, ...seen].map(read);
    const last = frames.at(-1);
    expect(
      differs(frames[0], last),
      "Blink is gone at the end",
    ).toBeGreaterThan(300);
    // Every frame while it waves and jumps is a different picture.
    expect(differs(frames[1], frames[3]), "it moves").toBeGreaterThan(150);
  } finally {
    await rec.stop();
    await app.close().catch(() => {});
  }
});

test("a picked-up Blink turns when the edge changes", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_turn", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    await page.waitForTimeout(1500);
    await reveal(page);
    await watch(page);
    const at = await bodyPoint(page);
    rec.frame("before");
    await carry(at, [
      [at.x - 200, at.y],
      [at.x - 500, at.y - 100],
      [30, 400],
      [14, 420],
    ]);
    await page.waitForTimeout(1500);
    await sees(page, "turn");
    rec.frame("turning");
    await page.waitForTimeout(1200);
    rec.frame("after");
    expect(
      (await page.evaluate(() => window.desktop.inspect())).shell.edge,
    ).toBe("left");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("Blink walks when it moves along its edge", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_walk", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.2);
    await page.waitForTimeout(1500);
    await reveal(page);
    await watch(page);
    rec.frame("before");
    await place(app, "bottom", 0.8);
    await sees(page, "walk", 4000);
    await page.waitForTimeout(250);
    rec.frame("walking");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("two loops while held whirl Blink in the air and leave it dizzy on the drop", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_dizzy", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await reveal(page);
    await watch(page);
    const at = await bodyPoint(page);
    rec.frame("before");
    await carry(at, [
      [at.x, at.y - 120],
      ...circle(at.x, at.y - 220, 110, 2.6),
    ]);
    await sees(page, "dizzy", 4000);
    expect(await played(page)).toContain("whirl");
    rec.frame("dizzy");
    await page.waitForTimeout(1500);
    rec.frame("dizzy-late");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("one loop is only a drag: no whirl and no dizziness", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await reveal(page);
    await watch(page);
    const at = await bodyPoint(page);
    await carry(at, [
      [at.x, at.y - 120],
      ...circle(at.x, at.y - 220, 110, 0.8),
    ]);
    await page.waitForTimeout(1500);
    const seen = await played(page);
    expect(seen).not.toContain("whirl");
    expect(seen).not.toContain("dizzy");
  } finally {
    await app.close();
  }
});

test("Blink picks while the capture pick is on", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_pick", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await watch(page);
    await app.evaluate(() => globalThis.blinklingTest.picking(true));
    await sees(page, "pick");
    await expect(page.locator("#blink")).toHaveAttribute("data-mode", "hover");
    await page.waitForTimeout(600);
    rec.frame("pick");
    await app.evaluate(() => globalThis.blinklingTest.picking(false));
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a file dropped on Blink is caught and goes into the card", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_file", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await reveal(page);
    await watch(page);
    const at = await bodyPoint(page);
    rec.frame("before");
    await page.evaluate(
      ([png, x, y]) => {
        const dt = new DataTransfer();
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], "note.png", { type: "image/png" }));
        document.dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: dt,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [PNG, at.x, at.y],
    );
    await sees(page, "file", 4000);
    await page.waitForTimeout(900);
    rec.frame("caught");
    await expect
      .poll(() =>
        app.evaluate(() => globalThis.blinklingTest.snapshot().chatOpen),
      )
      .toBe(true);
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a long answer is celebrated and an empty one is shrugged at", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("motions_react", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await watch(page);
    const say = (id, words) =>
      app.evaluate(
        (_electron, [id, words]) => {
          const { session } = globalThis.blinklingTest;
          if (words)
            session.emit({
              type: "delta",
              id,
              text: Array(words).fill("word").join(" "),
            });
          session.emit({ type: "done", turnId: id });
        },
        [id, words],
      );
    await say("long", 120);
    await sees(page, "celebrate", 4000);
    await page.waitForTimeout(700);
    rec.frame("celebrate");
    await page.waitForTimeout(3500);
    await say("none", 0);
    await sees(page, "shrug", 4000);
    await page.waitForTimeout(700);
    rec.frame("shrug");
  } finally {
    await rec.stop();
    await app.close();
  }
});

test("a capture is sucked into Blink's mouth while Blink eats it", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("eat", { suffix: "-324" });
  try {
    await background(app);
    await place(app, "bottom", 0.5);
    await page.waitForTimeout(1500);
    await watch(page);
    rec.frame("before");
    const started = Date.now();
    const delivered = app.evaluate(async ({ screen }, png) => {
      const d = screen.getPrimaryDisplay();
      await globalThis.blinklingTest.attachCapture({
        image: { id: "eat-test", mediaType: "image/png", data: png },
        display: d,
        region: { x: 300, y: 180, width: 360, height: 240 },
      });
    }, PNG);
    await sees(page, "eat", 3000);
    // The mouth is open before the picture starts to move: the lead is 400 ms.
    await page.waitForTimeout(700);
    rec.frame("mouth-open");
    await page.waitForTimeout(450);
    rec.frame("sucked-in");
    await delivered;
    expect(Date.now() - started).toBeGreaterThan(1200);
    await page.waitForTimeout(1500);
    rec.frame("chew");
    await page.waitForTimeout(1500);
    rec.frame("done");
    expect(await played(page)).toContain("eat");
  } finally {
    await rec.stop();
    await app.close();
  }
});
