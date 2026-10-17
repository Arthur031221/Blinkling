import { expect } from "@playwright/test";
import { move, click } from "./support.mjs";
import { background, reveal, bubble } from "./helpers.mjs";

/** What the 3.2.4 walk specs share: a guide the model "answers", the card and
 * overlay windows as the screen shows them, and real clicks. */
export const place = (app, edge, ratio) =>
  app.evaluate(
    async ({ screen }, [edge, ratio]) => {
      const t = globalThis.blinklingTest,
        d = screen.getPrimaryDisplay();
      await t.positionStore.save(d.id, { edge, ratio });
      t.setDisplay(d);
    },
    [edge, ratio],
  );
export const cardPage = (app) =>
  app.windows().find((p) => p.url().includes("surface=card"));
export const cardWindow = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.isVisible() && w.webContents.getURL().includes("surface=card"),
    );
    return w ? w.getBounds() : null;
  });
export const cardShown = async (app) => Boolean(await cardWindow(app));
export const overlayShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.isVisible() && w.webContents.getURL().includes("/overlay/"),
    ),
  );
export const regions = (app, kinds) =>
  app.evaluate(
    (_, kinds) =>
      globalThis.blinklingTest.features.overlay.regions?.(kinds) ?? [],
    kinds,
  );
export const machine = (app) =>
  app.evaluate(() => globalThis.blinklingTest.nBlinkMenuFaces.interaction());
export const turnCount = (app) =>
  app.evaluate(() => globalThis.fakeTurns.length);
export const meet = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
export const guideButton = (app, action) =>
  cardPage(app).locator(`.gl-guide button[data-action="${action}"]`);

const SECTIONS = [
  {
    id: "s1",
    label: "Logo",
    rect: { x: 400, y: 110, width: 160, height: 100 },
  },
  {
    id: "s2",
    label: "Headline",
    rect: { x: 420, y: 300, width: 330, height: 120 },
  },
  {
    id: "s3",
    label: "Read more",
    rect: { x: 700, y: 520, width: 260, height: 60 },
  },
];
/** A session that answers a guide request with a guide of the test page after
 * `delay` ms and anything else with one line. Every turn is kept. */
export const fakeSession = (app, delay = 300, sections = SECTIONS) =>
  app.evaluate(
    (_, [delay, sections]) => {
      const listeners = new Set();
      const guide = {
        purpose: "A page with three parts.",
        title: "Test page",
        sections: sections.map((r) => ({
          ...r,
          description: r.label,
          paragraphs: [r.label],
        })),
        steps: sections.map((r) => ({
          id: `t-${r.id}`,
          note: `Look at the ${r.label}.`,
          regionIds: [r.id],
        })),
      };
      globalThis.fakeTurns = [];
      globalThis.blinklingTest.features.setSession({
        subscribe: (f) => {
          listeners.add(f);
          return () => listeners.delete(f);
        },
        send: async (turn) => {
          globalThis.fakeTurns.push({ ...turn, at: Date.now() });
          const text =
            turn.source === "guide"
              ? JSON.stringify(guide)
              : "This is a blue test page.\n\nIt has one sentence.";
          setTimeout(() => {
            for (const f of listeners) {
              f({
                type: "message",
                role: "assistant",
                content: [{ type: "text", text }],
              });
              f({ type: "done", turnId: turn.id });
            }
          }, delay);
        },
        stop: async () => {},
      });
    },
    [delay, sections],
  );
export async function clickAt(at) {
  move(at.x, at.y);
  await new Promise((r) => setTimeout(r, 250));
  const pressed = Date.now();
  click(at.x, at.y);
  return pressed;
}
export async function clickIn(app, locator) {
  const win = await cardWindow(app);
  const box = await locator.boundingBox();
  return clickAt({
    x: win.x + box.x + box.width / 2,
    y: win.y + box.y + box.height / 2,
  });
}
/** The menu with a fake session in, Blink at its edge; returns the frame, the
 * real click on a menu bubble and a spot of empty page. */
export async function ready(
  app,
  page,
  { delay = 300, edge = "left", ratio = 0.55 } = {},
) {
  const frame = await background(app);
  await fakeSession(app, delay);
  await place(app, edge, ratio);
  await page.waitForTimeout(800);
  await reveal(page);
  const press = async (action) => {
    const box = await bubble(page, action).boundingBox();
    const at = {
      x: frame.x + box.x + box.width / 2,
      y: frame.y + box.y + box.height / 2,
    };
    return clickAt(at);
  };
  return {
    frame,
    press,
    empty: { x: frame.x + 640, y: frame.y + 700 },
  };
}
export const expectStep = (app, text) =>
  expect(cardPage(app).locator(".gl-guide-head")).toContainText(text, {
    timeout: 10000,
  });
