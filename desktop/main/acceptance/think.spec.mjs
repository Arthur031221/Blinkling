import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { launch, move } from "./support.mjs";
import { background, sleep } from "./helpers.mjs";
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
const emit = (app, event) =>
  app.evaluate(
    (_electron, event) => globalThis.blinklingTest.send(event),
    event,
  );

/** Where Blink and its thought bubbles are on the screen. */
async function around(app, page) {
  const blink = await app.evaluate(() =>
    globalThis.blinklingTest.blink.getBounds(),
  );
  const body = await page.evaluate(() => {
    const r = document.querySelector(".blink-body").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const x = Math.max(0, Math.round(blink.x + body.x - 40));
  const y = Math.max(0, Math.round(blink.y + body.y - 40));
  return {
    x,
    y,
    width: Math.round(body.width + 80),
    height: Math.round(body.height + 80),
  };
}
const crop = (box) => `${box.width}:${box.height}:${box.x}:${box.y}`;
const read = (file) => PNG.sync.read(readFileSync(file));
/** How many pixels differ clearly between two same-sized frames. */
function changed(a, b) {
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
}

test("while the answer is on its way Blink thinks: it looks up and aside and its thought bubbles blink on the real screen, with the pointer far away", async () => {
  test.setTimeout(120000);
  const { app, page } = await launch();
  const rec = record("think_motion", { suffix: "-321" });
  try {
    await background(app);
    await place(app, "right", 0.5);
    move(60, 60);
    await page.waitForTimeout(1800);
    const box = await around(app, page);
    const idle = read(rec.frame("idle", crop(box)));
    await emit(app, { type: "activity", state: "thinking" });
    await expect(page.locator("#blink")).toHaveAttribute(
      "data-expression",
      "thinking",
    );
    // The pointer is nowhere near Blink, so nothing but the thinking moves it.
    expect(
      await app.evaluate(() =>
        globalThis.blinklingTest.nBlinkMenuFaces.interaction(),
      ),
    ).toMatchObject({ out: false });
    await sleep(700);
    const first = read(rec.frame("thinking-1", crop(box)));
    await sleep(500);
    const second = read(rec.frame("thinking-2", crop(box)));
    await sleep(500);
    const third = read(rec.frame("thinking-3", crop(box)));
    const pose = await page.evaluate(() => ({
      look: window.desktop.character.last.look,
      front: window.desktop.character.last.front,
    }));
    expect(pose.look[1]).toBeLessThan(-0.5);
    expect(pose.front).toContain("<circle");
    // The thought bubbles and the lifted arm are on the screen, not only in the model.
    expect(changed(idle, first), "thinking differs from idle").toBeGreaterThan(
      200,
    );
    // And they blink: the three frames are not the same picture.
    expect(
      Math.max(changed(first, second), changed(second, third)),
      "the bubbles animate",
    ).toBeGreaterThan(40);
    await emit(app, { type: "done", turnId: "think" });
    await sleep(1200);
    rec.frame("done", crop(box));
  } finally {
    await rec.stop();
    await app.close();
  }
});
