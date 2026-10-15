import test from "node:test";
import assert from "node:assert/strict";
import { createPicker } from "./picker.mjs";
import {
  createLocatorStub, samplePage, element, DISPLAY, WINDOW,
} from "./test/locator-stub.mjs";

const allowed = { allowed: () => true };
const make = (options = {}) =>
  createPicker({
    locator: options.locator ?? createLocatorStub(options.stub),
    guard: options.guard ?? allowed,
    display: DISPLAY,
  });
const inPara = { x: 160, y: 160 };

test("hover outlines the element under the cursor", async () => {
  const p = make();
  const h = await p.hover({ x: 200, y: 280 });
  assert.deepEqual(h.outline, { x: 140, y: 230, width: 200, height: 120 });
  assert.equal(h.kind, "image");
  assert.equal(h.lock, false);
});

test("hover over nothing outlines the window the cursor is in", async () => {
  const p = make();
  const h = await p.hover({ x: 990, y: 650 });
  assert.equal(h.kind, "page");
});

test("clicking text takes the sentence under the cursor when the locator can reach it", async () => {
  const p = make();
  const r = await p.click(inPara);
  assert.equal(r.type, "taken");
  assert.equal(r.item.taken.kind, "text");
  assert.equal(r.item.taken.text, "Blink looks at your screen.");
  assert.deepEqual(r.item.taken.bounds, { x: 140, y: 150, width: 330, height: 20 });
  assert.equal(r.item.taken.source, "pick");
  assert.equal(r.item.taken.display, DISPLAY);
});

test("without sentence geometry a click takes the whole paragraph", async () => {
  const p = make({ stub: { sentences: false } });
  const r = await p.click(inPara);
  assert.equal(r.item.taken.text, "Blink looks at your screen. It never clicks anything.");
  assert.deepEqual(r.item.taken.lines.length, 2);
});

test("clicking the same spot again grows one level: sentence, paragraph, section, page", async () => {
  const p = make();
  const levels = [];
  for (let i = 0; i < 4; i++) {
    const r = await p.click(inPara);
    levels.push([r.item.level, r.item.taken.kind]);
    assert.equal(p.items().length, 1, "growth replaces, it does not add");
  }
  assert.deepEqual(levels, [
    ["sentence", "text"],
    ["paragraph", "text"],
    ["section", "section"],
    ["page", "page"],
  ]);
});

test("growing past the top stays on the page and says so", async () => {
  const p = make();
  for (let i = 0; i < 4; i++) await p.click(inPara);
  const r = await p.click(inPara);
  assert.equal(r.type, "taken");
  assert.equal(r.item.level, "page");
  assert.equal(r.grew, false);
});

test("clicking another element adds it to the same pick, up to six, the seventh is refused", async () => {
  const elements = samplePage();
  for (let i = 0; i < 6; i++)
    elements.push(
      element(`btn-${i}`, "control", { x: 700, y: 120 + i * 40, width: 60, height: 30 }, { parentId: "page", name: `B${i}` }),
    );
  const p = make({ stub: { elements } });
  await p.click({ x: 200, y: 280 }); // image
  for (let i = 0; i < 5; i++) {
    const r = await p.click({ x: 710, y: 130 + i * 40 });
    assert.equal(r.type, "taken", `item ${i + 2}`);
  }
  assert.equal(p.items().length, 6);
  const seventh = await p.click({ x: 710, y: 130 + 5 * 40 });
  assert.deepEqual([seventh.type, seventh.reason], ["refused", "limit"]);
  assert.equal(p.items().length, 6);
});

test("a click inside the app's own selection takes exactly the selection", async () => {
  const selection = {
    text: "never clicks",
    bounds: { x: 300, y: 170, width: 90, height: 20 },
    lines: [{ x: 300, y: 170, width: 90, height: 20 }],
  };
  const p = make({ stub: { selection } });
  const r = await p.click({ x: 320, y: 180 });
  assert.equal(r.item.taken.kind, "text");
  assert.equal(r.item.taken.text, "never clicks");
  assert.deepEqual(r.item.taken.bounds, selection.bounds);
  assert.equal(r.item.level, "selection");
});

test("a click outside the selection ignores it", async () => {
  const selection = { text: "x", bounds: { x: 300, y: 170, width: 90, height: 20 }, lines: [] };
  const p = make({ stub: { selection } });
  const r = await p.click({ x: 200, y: 280 });
  assert.equal(r.item.taken.kind, "image");
});

test("an empty area takes the whole window", async () => {
  const p = make({ stub: { elements: [element("only", "image", { x: 140, y: 230, width: 50, height: 50 })] } });
  const r = await p.click({ x: 900, y: 600 });
  assert.equal(r.item.taken.kind, "window");
  assert.deepEqual(r.item.taken.bounds, WINDOW.bounds);
});

test("a title bar takes the whole window", async () => {
  const p = make();
  const r = await p.click({ x: 500, y: 75 });
  assert.equal(r.item.taken.kind, "window");
  assert.deepEqual(r.item.taken.bounds, WINDOW.bounds);
});

test("with no element data at all the click takes the screen under it", async () => {
  const p = make({ stub: { elements: [] } });
  const r = await p.click({ x: 10, y: 10 });
  assert.equal(r.item.taken.kind, "screen");
  assert.deepEqual(r.item.taken.bounds, DISPLAY.bounds);
});

test("a secure field shows the lock and takes nothing", async () => {
  const p = make();
  const r = await p.click({ x: 200, y: 530 });
  assert.deepEqual([r.type, r.at], ["lock", { x: 200, y: 530 }]);
  assert.equal(p.items().length, 0);
  const h = await p.hover({ x: 200, y: 530 });
  assert.equal(h.lock, true);
  assert.equal(h.outline, null);
});

test("a secure parent hides everything below it", async () => {
  const elements = [
    element("form", "section", { x: 0, y: 0, width: 500, height: 500 }, { secure: true }),
    element("label", "text", { x: 10, y: 10, width: 100, height: 20 }, { parentId: "form", text: "visible?" }),
  ];
  const p = make({ stub: { elements } });
  assert.equal((await p.click({ x: 20, y: 20 })).type, "lock");
});

test("when the guard says no, the lock shows and the locator is never asked", async () => {
  const locator = createLocatorStub();
  const p = make({ locator, guard: { allowed: () => false } });
  const r = await p.click(inPara);
  assert.equal(r.type, "lock");
  assert.equal((await p.hover(inPara)).lock, true);
  assert.equal(locator.calls.locate, 0);
});

test("a focused secure field blocks a pick anywhere", async () => {
  const p = make({ stub: { focus: { secure: true } } });
  assert.equal((await p.click(inPara)).type, "lock");
});

test("content is real: tables as Markdown, code as code", async () => {
  const p = make();
  const table = (await p.click({ x: 400, y: 280 })).item.taken;
  assert.equal(table.kind, "table");
  assert.equal(table.text, "| Item | Price |\n| --- | --- |\n| Tea | 3 |\n| Cake | 5 |");
  const code = (await p.click({ x: 160, y: 430 })).item.taken;
  assert.equal(code.kind, "code");
  assert.equal(code.text, "```js\nconst a = 1;\nconsole.log(a);\n```");
});

test("formulas travel as LaTeX when the page gives it", async () => {
  const elements = [
    element("f", "formula", { x: 0, y: 0, width: 100, height: 30 }, { content: { latex: "E=mc^2" } }),
  ];
  const p = make({ stub: { elements } });
  assert.equal((await p.click({ x: 5, y: 5 })).item.taken.text, "$$E=mc^2$$");
});

test("an image carries no text and keeps its element id", async () => {
  const p = make();
  const t = (await p.click({ x: 200, y: 280 })).item.taken;
  assert.equal(t.text, undefined);
  assert.equal(t.elementId, "img-1");
});

test("an area from a drag is one taken area with no element", async () => {
  const p = make();
  const r = await p.area({ x: 10, y: 20, width: 300, height: 200 });
  assert.equal(r.item.taken.kind, "area");
  assert.deepEqual(r.item.taken.bounds, { x: 10, y: 20, width: 300, height: 200 });
  assert.equal(r.item.taken.elementId, undefined);
});

test("an area over secure content is refused with the lock", async () => {
  const p = make();
  const r = await p.area({ x: 130, y: 510, width: 300, height: 60 });
  assert.equal(r.type, "lock");
});

test("an area counts toward the six", async () => {
  const p = make();
  for (let i = 0; i < 6; i++) assert.equal((await p.area({ x: i, y: 0, width: 50, height: 50 })).type, "taken");
  assert.equal((await p.area({ x: 99, y: 0, width: 50, height: 50 })).reason, "limit");
});

test("drain hands the items over and empties the pick", async () => {
  const p = make();
  await p.click({ x: 200, y: 280 });
  await p.click({ x: 400, y: 280 });
  const taken = p.drain();
  assert.deepEqual(taken.map((t) => t.kind), ["image", "table"]);
  assert.equal(p.items().length, 0);
});

test("a page-level pick on a browser is flagged for the translate offer", async () => {
  const elements = [
    element("pg", "page", { x: 0, y: 0, width: 500, height: 500 }, { text: "Hello", window: { ...WINDOW, browser: true } }),
  ];
  const p = make({ stub: { elements } });
  const t = (await p.click({ x: 5, y: 5 })).item.taken;
  assert.equal(t.kind, "page");
  assert.equal(t.browser, true);
});

test("clicking the same selection twice does not add it twice", async () => {
  const selection = {
    text: "never clicks",
    bounds: { x: 300, y: 170, width: 90, height: 20 },
    lines: [],
  };
  const p = make({ stub: { selection } });
  await p.click({ x: 320, y: 180 });
  await p.click({ x: 330, y: 180 });
  assert.equal(p.items().length, 1);
});
