import { test, expect } from "@playwright/test";
import {
  launch,
  background,
  desktopShot,
  native,
} from "../../capture/e2e/support.mjs";

// Elements the stub locator knows, laid over the page `background` draws:
// the red "Main result" panel and the page title.
const elements = [
  {
    id: "save",
    kind: "button",
    name: "Main result",
    bounds: { x: 240, y: 160, width: 160, height: 100 },
  },
  {
    id: "title",
    kind: "text",
    name: "Desktop report",
    bounds: { x: 24, y: 24, width: 260, height: 48 },
    lines: [{ x: 24, y: 24, width: 260, height: 48 }],
  },
];
const filler = Array.from(
  { length: 14 },
  (_, i) => `Filler sentence number ${i + 1} keeps the deck long enough.`,
).join(" ");
const answer =
  "The panel is here [[1:save|Main result]]. " +
  filler +
  " The heading is there [[2:title|Heading]].";

async function ask(app, text = answer) {
  await app.evaluate(async ({ screen }, text) => {
    const t = globalThis.blinklingTest;
    const { id, bounds, scaleFactor } = screen.getPrimaryDisplay();
    const display = { id, bounds, scaleFactor };
    t.locator.set({
      elements: async () =>
        globalThis.b3Elements.map((e) => ({ ...e, display })),
      windowAt: () => ({ id: "w1", title: "Report" }),
    });
    // The model's reply is scripted; the shell's own send path is the real one.
    t.session.send = async (turn) => {
      globalThis.b3Turn = turn;
      t.session.emit({
        type: "message",
        id: "u1",
        role: "user",
        content: [{ type: "text", text: turn.text }],
      });
      t.session.emit({
        type: "message",
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text }],
      });
      t.session.emit({ type: "done", turnId: turn.id });
    };
    await t.openComposer();
  }, text);
  await app.evaluate((_electron, list) => {
    globalThis.b3Elements = list;
  }, elements);
  await app.evaluate(() =>
    globalThis.blinklingTest.composer.webContents.executeJavaScript(
      `window.blinkling.sendTurn({id:"t1",text:"What is on this screen?",source:"composer",attachments:[{mediaType:"image/png",data:"iVBORw0KGgo="}]})`,
    ),
  );
}
const overlayPage = (app) =>
  app.windows().find((p) => /\/desktop\/overlay\/index\.html$/.test(p.url()));
const overlayEval = async (app, code) => {
  const page = overlayPage(app);
  return page ? page.evaluate(code) : undefined;
};
const marks = (app) =>
  overlayEval(
    app,
    `[...document.querySelectorAll("#drawings .mark")].map((g) => {
      const r = g.getBoundingClientRect();
      return { n: +g.dataset.n, kind: g.getAttribute("class").split(" ")[1],
        x: r.x, y: r.y, width: r.width, height: r.height };
    })`,
  );

for (const scale of [1, 2]) {
  test(`an answer naming two elements draws two numbered marks on them at ${scale * 100}%`, async () => {
    const { app, close } = await launch(scale);
    try {
      await app.firstWindow();
      await background(app);
      // The card stays open while the pointer is on it; keep it off the card.
      native(5, 5);
      await ask(app);
      await expect.poll(() => marks(app)).toHaveLength(2);
      const [one, two] = await marks(app);
      expect([one.n, one.kind]).toEqual([1, "circle"]);
      expect([two.n, two.kind]).toEqual([2, "underline"]);
      // A hand-drawn mark wobbles around its element; it stays on it, and
      // is nowhere near the other one.
      const on = (mark, box) => {
        const cx = mark.x + mark.width / 2,
          cy = mark.y + mark.height / 2;
        expect(cx).toBeGreaterThan(box.x - 24);
        expect(cx).toBeLessThan(box.x + box.width + 24);
        expect(cy).toBeGreaterThan(box.y - 24);
        expect(cy).toBeLessThan(box.y + box.height + 24);
        expect(mark.width).toBeGreaterThan(box.width * 0.7);
        expect(mark.width).toBeLessThan(box.width + 80);
      };
      on(one, elements[0].bounds);
      on(two, elements[1].bounds);
      const badges = await overlayEval(
        app,
        `[...document.querySelectorAll(".badge")].map((b) => b.textContent)`,
      );
      expect(badges).toEqual(["1", "2"]);
      // The question carried the element list; the user's bubble hides it.
      const turn = await app.evaluate(() => globalThis.b3Turn.text);
      expect(turn).toContain("save button Main result");
      expect(turn).toContain("title text Desktop report");
      await desktopShot(app, `pointing-answer-${scale * 100}`);
    } finally {
      await close();
    }
  });
}

async function findDeck(app) {
  for (const page of app.windows()) {
    if (!/\/composer\//.test(page.url())) continue;
    const surface = await page
      .evaluate(() => document.body.dataset.surface)
      .catch(() => null);
    if (surface === "bubbles") return page;
  }
}
// Everything a pointing test needs: the answer drawn, the cursor off the card,
// and the bubble deck's page.
async function drawn(scale = 1) {
  const run = await launch(scale);
  await run.app.firstWindow();
  await background(run.app);
  native(5, 5);
  await ask(run.app);
  await expect.poll(() => marks(run.app)).toHaveLength(2);
  let deck;
  await expect
    .poll(async () => (deck = await findDeck(run.app)), { timeout: 10000 })
    .toBeTruthy();
  await expect
    .poll(() =>
      deck.evaluate(() => document.querySelectorAll(".gl-ref").length),
    )
    .toBe(2);
  return { ...run, deck };
}
const pulsing = (app, n) =>
  overlayEval(
    app,
    `document.getAnimations().some((a) => a.playState === "running" &&
      a.effect.target?.dataset?.n === "${n}" &&
      a.effect.getKeyframes().some((k) => /scale\\(1\\.12\\)/.test(k.transform ?? "")))`,
  );

test("hovering a bubble's number pulses that mark and nothing else", async () => {
  const { app, deck, close } = await drawn();
  try {
    await deck
      .locator(".gl-ref")
      .first()
      .dispatchEvent("mouseover", { bubbles: true });
    await expect.poll(() => pulsing(app, 1)).toBe(true);
    expect(await pulsing(app, 2)).toBe(false);
    const hovered = await app.evaluate(
      () => globalThis.blinklingTest.deck.hovered,
    );
    expect(hovered.at(-1)).toEqual(expect.any(String));
  } finally {
    await close();
  }
});

test("clicking a mark scrolls the deck to the bubble that carries its number", async () => {
  const { app, deck, close } = await drawn();
  try {
    const offscreen = () =>
      deck.evaluate(() => {
        const ref = document.querySelector(".gl-ref");
        const bubble = ref.closest(".gl-answer-bubble");
        const box = bubble.getBoundingClientRect();
        const deckBox = bubble.parentElement.getBoundingClientRect();
        return box.bottom <= deckBox.top || box.top >= deckBox.bottom;
      });
    await expect.poll(offscreen).toBe(true);
    await overlayEval(
      app,
      `document.querySelector('.badge[data-n="1"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))`,
    );
    await expect.poll(offscreen).toBe(false);
  } finally {
    await close();
  }
});

test("marks never take the mouse: only a badge under the cursor does", async () => {
  const { app, close } = await drawn();
  try {
    const style = await overlayEval(
      app,
      `({
        mark: getComputedStyle(document.querySelector("#drawings .mark")).pointerEvents,
        label: getComputedStyle(document.querySelector("#labels .label")).pointerEvents,
        body: getComputedStyle(document.body).pointerEvents,
      })`,
    );
    expect(style).toEqual({ mark: "none", label: "none", body: "none" });
    const focusable = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => /overlay/.test(w.webContents.getURL()))
        .map((w) => w.isFocusable()),
    );
    expect(focusable).toEqual([false]);
  } finally {
    await close();
  }
});

test("marks fade with the bubbles on their settle timer and come back with them", async () => {
  const { app, deck, close } = await drawn();
  try {
    const faded = () =>
      overlayEval(
        app,
        `document.querySelector("#stage").classList.contains("faded")`,
      );
    expect(await faded()).toBe(false);
    await expect.poll(faded, { timeout: 20000 }).toBe(true);
    await deck.evaluate(() => window.conversation.hover(true));
    await expect.poll(faded).toBe(false);
  } finally {
    await close();
  }
});
