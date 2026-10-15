import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  SCALE,
  px,
  launch,
  openPdf,
  record,
  log,
  input,
  poll,
  shot,
  raised,
  miniOpen,
  miniEval,
  sent,
} from "./harness.mjs";

const OUT = process.env.PICK_SHOTS ?? `/tmp/pick-e2e-${SCALE}`;
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test.afterEach(() => {
  input([["release"], ["up", "ctrl"]]);
});

const TEXT_PDF = `<h1>Quarterly figures</h1><p>Blink reads the numbers aloud when you ask it to.</p>`;
const IMAGE_PDF = `<img width="500" height="300" src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='300'%3E%3Crect width='500' height='300' fill='%234a90a4'/%3E%3C/svg%3E">`;

async function open(html) {
  const app = await launch({ scale: SCALE });
  await openPdf(app, html);
  await record(app);
  // The viewer needs a moment to lay the document out.
  await pause(1500);
  return app;
}

async function pickOnce(app, point) {
  input([["move", px(point.x), px(point.y)]]);
  input([["down", "ctrl"]]);
  await poll(() => raised(app), 3000, "the layer to rise");
  const outlines = sent(await log(app), "outline").length;
  await poll(
    async () => sent(await log(app), "outline").length > outlines,
    3000,
    "the first outline",
  );
  await pause(150);
  // The log keeps every earlier pick, so wait for one more than there was.
  const before = sent(await log(app), "taken").length;
  input([["press"], ["release"]]);
  await poll(
    async () => sent(await log(app), "taken").length > before,
    4000,
    "taken",
  );
  input([["up", "ctrl"]]);
  await poll(() => miniOpen(app), 6000, "the mini composer");
  await pause(500);
}

test("N2.8 Ctrl+click on text in the browser's own PDF viewer takes the selected text", async () => {
  const app = await open(TEXT_PDF);
  try {
    // Select everything the way a reader would: click into the page (the viewer's
    // thumbnails and toolbar sit left of and above it), Ctrl+A.
    input([["move", px(550), px(350)], ["press"], ["release"]]);
    await pause(300);
    input([
      ["down", "ctrl"],
      ["key", "a"],
      ["up", "ctrl"],
    ]);
    await pause(400);
    await pickOnce(app, { x: 450, y: 143 });
    const chips = JSON.parse(
      await miniEval(
        app,
        "JSON.stringify([...document.querySelectorAll('.mini-entry')].map((e) => [e.className, e.textContent]))",
      ),
    );
    expect(chips).toHaveLength(1);
    expect(chips[0][0]).toMatch(/mini-entry-text/);
    expect(chips[0][1]).toMatch(/Quarterly figures/);
    await shot(app, `${OUT}/14-pdf-text.png`);
    const offers = await miniEval(
      app,
      "document.querySelectorAll('.mini-offer[data-id=pdf-reader]').length",
    );
    expect(offers, "a PDF that returned text offers no reader").toBe(0);
  } finally {
    await app.close();
  }
});

test("N2.8 a pick on a PDF with no text offers the PDF reader once, and never again", async () => {
  const app = await open(IMAGE_PDF);
  try {
    await pickOnce(app, { x: 550, y: 300 });
    const offered = () =>
      miniEval(
        app,
        "[...document.querySelectorAll('.mini-offer')].map((o) => o.dataset.id).join()",
      );
    expect(await offered()).toBe("pdf-reader");
    await shot(app, `${OUT}/15-pdf-offer.png`);
    input([["key", "esc"]]);
    await poll(async () => !(await miniOpen(app)), 3000, "the mini closes");
    await pause(600);
    await pickOnce(app, { x: 550, y: 300 });
    expect(await offered(), "the offer is made once").toBe("");
  } finally {
    await app.close();
  }
});
