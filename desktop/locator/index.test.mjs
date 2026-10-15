import assert from "node:assert/strict";
import test from "node:test";
import { createLocator } from "./index.mjs";
import { buildElement } from "./element.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A desktop at `scale`: one display of 1000x800 DIP, native px = DIP * scale. */
function desktop(scale = 1, extra = []) {
  const displays = [
    {
      id: "1",
      scaleFactor: scale,
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
    },
    ...extra,
  ];
  return {
    displays: () => displays,
    toDip: (p) => ({ x: p.x / scale, y: p.y / scale }),
    toNative: (p) => ({ x: p.x * scale, y: p.y * scale }),
  };
}

const native = (id, x, y, width, height, over = {}) => ({
  id,
  app: "chrome",
  title: id,
  bounds: { x, y, width, height },
  ...over,
});

/** A source that answers from a table and counts what it was asked. */
function fakeSource(name, make, over = {}) {
  const source = {
    name,
    calls: [],
    handles: () => true,
    async read(request) {
      source.calls.push(request);
      return make(request);
    },
    ...over,
  };
  return source;
}

const el = (window, n, kind, bounds, extra = {}) =>
  buildElement({
    source: "fake",
    windowId: window.id,
    n,
    kind,
    bounds,
    role: kind,
    window,
    display: window.display,
    ...extra,
  });

/** page > section > paragraph, plus a password field. */
function page(window) {
  const root = el(window, 0, "page", window.bounds, { text: "" });
  const section = el(window, 1, "section", {
    x: 50,
    y: 50,
    width: 400,
    height: 300,
  });
  const para = el(
    window,
    2,
    "paragraph",
    { x: 60, y: 60, width: 300, height: 60 },
    {
      text: "First sentence here. Second sentence follows. A third one ends it.",
    },
  );
  const secret = buildElement({
    source: "fake",
    windowId: window.id,
    n: 3,
    bounds: { x: 60, y: 200, width: 200, height: 24 },
    secure: true,
    name: "Password",
    text: "hunter2",
    window,
    display: window.display,
  });
  const elements = [root, section, para, secret];
  return {
    elements,
    parents: new Map([
      [root.id, null],
      [section.id, root.id],
      [para.id, section.id],
      [secret.id, section.id],
    ]),
  };
}

function build({
  scale = 1,
  windows = [native("w1", 0, 0, 1000 * scale, 800 * scale)],
  sources,
  ...rest
} = {}) {
  const sim = desktop(scale, rest.extraDisplays);
  const locator = createLocator({
    list: async () => windows,
    ...sim,
    sources: sources ?? [],
    ttl: 1000,
    ...rest,
  });
  return { locator, windows };
}

test("sources fall through DOM, then accessibility, then pixels, in that order", async () => {
  const order = [];
  const make = (name, answer) =>
    fakeSource(name, (r) => {
      order.push(name);
      return answer?.(r.window) ?? null;
    });
  const dom = make("dom", null);
  const ax = make("ax", null);
  const image = make("image", (w) => ({
    elements: [el(w, 0, "image", { x: 10, y: 10, width: 100, height: 100 })],
    parents: new Map(),
  }));
  const { locator } = build({ sources: [dom, ax, image] });
  const found = await locator.locate({ x: 50, y: 50 });
  assert.deepEqual(order, ["dom", "ax", "image"]);
  assert.equal(found.kind, "image");
});

test("the first source with elements wins and later ones are not asked", async () => {
  const dom = fakeSource("dom", (r) => page(r.window));
  const ax = fakeSource("ax", () => null);
  const image = fakeSource("image", () => null);
  const { locator } = build({ sources: [dom, ax, image] });
  await locator.locate({ x: 70, y: 70 });
  assert.equal(ax.calls.length + image.calls.length, 0);
});

test("a source that does not handle the window or throws is skipped", async () => {
  const dom = fakeSource("dom", () => page({ id: "x" }), {
    handles: () => false,
  });
  const ax = fakeSource("ax", () => {
    throw new Error("helper crashed");
  });
  const image = fakeSource("image", (r) => ({
    elements: [el(r.window, 0, "image", { x: 0, y: 0, width: 80, height: 80 })],
    parents: new Map(),
  }));
  const { locator } = build({ sources: [dom, ax, image] });
  assert.equal((await locator.locate({ x: 10, y: 10 }))?.kind, "image");
  assert.equal(dom.calls.length, 0);
});

test("pixels never answer for a window whose DOM or AX read is still running", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const dom = fakeSource("dom", async (r) => {
    await gate;
    return page(r.window);
  });
  const image = fakeSource("image", (r) => ({
    elements: [
      el(r.window, 0, "image", { x: 0, y: 0, width: 900, height: 700 }),
    ],
    parents: new Map(),
  }));
  const { locator } = build({ sources: [dom, image] });
  assert.equal(await locator.locate({ x: 70, y: 70 }), null);
  assert.equal(image.calls.length, 0);
  release();
  await sleep(20);
  assert.equal((await locator.locate({ x: 70, y: 70 }))?.kind, "paragraph");
  assert.equal(image.calls.length, 0);
});

test("locate answers the smallest element under the point", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  assert.equal((await locator.locate({ x: 70, y: 70 })).kind, "paragraph");
  assert.equal((await locator.locate({ x: 400, y: 300 })).kind, "section");
  assert.equal((await locator.locate({ x: 900, y: 700 })).kind, "page");
  assert.equal(await locator.locate({ x: 5000, y: 5000 }), null);
});

test("a hover is answered from memory in well under 50 ms", async () => {
  const dom = fakeSource("dom", (r) => page(r.window));
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  const started = performance.now();
  for (let i = 0; i < 20; i++) await locator.locate({ x: 70 + i, y: 70 });
  assert.ok((performance.now() - started) / 20 < 5);
  assert.equal(dom.calls.length, 1);
});

test("parent walks the page tree, and a sentence answers to its element", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const para = await locator.locate({ x: 70, y: 70 });
  const section = await locator.parent(para);
  assert.equal(section.kind, "section");
  assert.equal((await locator.parent(section)).kind, "page");
  assert.equal(await locator.parent(await locator.parent(section)), null);
  const sentence = await locator.sentenceAt(para, { x: 70, y: 70 });
  assert.equal((await locator.parent(sentence)).id, para.id);
});

test("sentenceAt picks the sentence under the point and returns its lines", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const para = await locator.locate({ x: 70, y: 70 });
  const first = await locator.sentenceAt(para, { x: 61, y: 61 });
  assert.equal(first.kind, "sentence");
  assert.equal(first.text, "First sentence here.");
  const last = await locator.sentenceAt(para, { x: 359, y: 119 });
  assert.equal(last.text, "A third one ends it.");
  assert.ok(first.lines.length >= 1);
  for (const line of first.lines) {
    assert.ok(line.x >= para.bounds.x - 0.01);
    assert.ok(line.x + line.width <= para.bounds.x + para.bounds.width + 0.01);
  }
  const alone = { ...para, text: "Only one sentence." };
  assert.equal(await locator.sentenceAt(alone, { x: 70, y: 70 }), null);
});

test("secure fields come back as a bare marker and are never read out", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const marker = await locator.locate({ x: 100, y: 210 });
  assert.equal(marker.secure, true);
  assert.equal(marker.text, "");
  assert.equal(marker.name, "");
  assert.equal(await locator.sentenceAt(marker, { x: 100, y: 210 }), null);
  assert.equal(
    (await locator.elements(marker.window)).filter((e) =>
      e.text.includes("hunter2"),
    ).length,
    0,
  );
  const text = await locator.textIn({ x: 0, y: 0, width: 1000, height: 800 });
  assert.ok(!text.includes("hunter2"));
  assert.ok(text.includes("First sentence here."));
  assert.equal(
    (await locator.snap({ x: 60, y: 200, width: 200, height: 24 })).element,
    null,
  );
  assert.equal((await locator.focus()).secure, true);
});

test("focus is not secure on a page without secure fields", async () => {
  const dom = fakeSource("dom", (r) => {
    const { elements, parents } = page(r.window);
    return { elements: elements.slice(0, 3), parents };
  });
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const focus = await locator.focus();
  assert.equal(focus.secure, false);
  assert.equal(focus.window.id, "w1");
});

test("focus rejects while the front window is unread, so a caller fails closed", async () => {
  const dom = fakeSource("dom", () => new Promise(() => {}));
  const { locator } = build({ sources: [dom] });
  await assert.rejects(locator.focus());
});

test("focus with no window at all is not secure", async () => {
  const { locator } = build({ windows: [], sources: [] });
  assert.deepEqual(await locator.focus(), { secure: false, window: null });
});

test("textIn reads leaf text in reading order, once, capped at 4000", async () => {
  const long = "word ".repeat(1500);
  const dom = fakeSource("dom", (r) => {
    const w = r.window;
    const root = el(w, 0, "page", w.bounds);
    const a = el(
      w,
      1,
      "paragraph",
      { x: 10, y: 10, width: 400, height: 40 },
      { text: "Top line" },
    );
    const link = el(
      w,
      2,
      "link",
      { x: 10, y: 10, width: 60, height: 20 },
      { text: "Top" },
    );
    const b = el(
      w,
      3,
      "paragraph",
      { x: 10, y: 60, width: 400, height: 40 },
      { text: "Below it" },
    );
    const c = el(
      w,
      4,
      "paragraph",
      { x: 10, y: 120, width: 400, height: 40 },
      { text: long },
    );
    return {
      elements: [root, c, b, link, a],
      parents: new Map([
        [link.id, a.id],
        [a.id, root.id],
        [b.id, root.id],
        [c.id, root.id],
      ]),
    };
  });
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const small = await locator.textIn({ x: 0, y: 0, width: 500, height: 110 });
  assert.equal(small, "Top line\nBelow it");
  const all = await locator.textIn({ x: 0, y: 0, width: 500, height: 400 });
  assert.ok(all.length <= 4000);
  assert.ok(all.startsWith("Top line\nBelow it\nword"));
});

test("selectionAt answers the selection only under the point", async () => {
  const dom = fakeSource("dom", (r) => ({
    ...page(r.window),
    selection: el(
      r.window,
      "sel",
      "text",
      { x: 60, y: 60, width: 100, height: 20 },
      { text: "chosen" },
    ),
  }));
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  assert.equal((await locator.selectionAt({ x: 70, y: 70 })).text, "chosen");
  assert.equal(await locator.selectionAt({ x: 700, y: 700 }), null);
});

test("windowAt names the window under the point, front window first", async () => {
  const { locator } = build({
    windows: [native("top", 0, 0, 500, 400), native("back", 0, 0, 1000, 800)],
  });
  assert.equal((await locator.windowAt({ x: 10, y: 10 })).id, "top");
  assert.equal((await locator.windowAt({ x: 700, y: 600 })).id, "back");
  assert.equal(await locator.windowAt({ x: 1500, y: 600 }), null);
});

for (const scale of [1, 1.5, 2]) {
  test(`snap lands on the element at display scale ${scale}`, async () => {
    const { locator } = build({
      scale,
      sources: [fakeSource("dom", (r) => page(r.window))],
    });
    await locator.locate({ x: 1, y: 1 });
    await sleep(10);
    const drawn = { x: 55, y: 66, width: 310, height: 52 };
    const snapped = await locator.snap(drawn, { kinds: ["paragraph"] });
    assert.equal(snapped.element.kind, "paragraph");
    assert.deepEqual(snapped.rect, { x: 60, y: 60, width: 300, height: 60 });
  });
}

test("snap works on a second display at another scale", async () => {
  const second = {
    id: "2",
    scaleFactor: 2,
    bounds: { x: 1000, y: 0, width: 1000, height: 800 },
  };
  // Native pixels: display 1 is scale 1 (0..1000), display 2 scale 2 from native x 1000.
  const toDip = (p) =>
    p.x < 1000 ? p : { x: 1000 + (p.x - 1000) / 2, y: p.y / 2 };
  const dom = fakeSource("dom", (r) => {
    const w = r.window;
    const para = el(
      w,
      1,
      "paragraph",
      { x: 1100, y: 100, width: 300, height: 60 },
      { text: "On the other screen." },
    );
    return {
      elements: [el(w, 0, "page", w.bounds), para],
      parents: new Map([[para.id, null]]),
    };
  });
  const locator = createLocator({
    list: async () => [native("w2", 1000, 0, 2000, 1600)],
    displays: () => [
      {
        id: "1",
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      },
      second,
    ],
    toDip,
    toNative: (p) => p,
    sources: [dom],
  });
  await locator.locate({ x: 1100, y: 100 });
  await sleep(10);
  const found = await locator.locate({ x: 1150, y: 120 });
  assert.equal(found.display.id, "2");
  assert.equal(found.display.scaleFactor, 2);
  const snapped = await locator.snap({
    x: 1095,
    y: 105,
    width: 310,
    height: 52,
  });
  assert.equal(snapped.element.text, "On the other screen.");
});

test("snap falls back to the drawn rectangle when nothing matches", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  await locator.locate({ x: 1, y: 1 });
  await sleep(10);
  const drawn = { x: 700, y: 600, width: 20, height: 20 };
  assert.deepEqual(await locator.snap(drawn, { kinds: ["table"] }), {
    rect: drawn,
    element: null,
  });
  const off = { x: 5000, y: 5000, width: 20, height: 20 };
  assert.deepEqual(await locator.snap(off), { rect: off, element: null });
});

test("a cached snapshot is reused until something invalidates it", async () => {
  const dom = fakeSource("dom", (r) => page(r.window));
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  await locator.locate({ x: 71, y: 70 });
  await locator.parent(await locator.locate({ x: 70, y: 70 }));
  assert.equal(dom.calls.length, 1);

  locator.invalidate("scroll");
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  assert.equal(dom.calls.length, 2);
});

test("zoom, scroll, mutation and a raised window each drop the snapshot", async () => {
  for (const reason of ["zoom", "scroll", "mutation", "raise"]) {
    const dom = fakeSource("dom", (r) => page(r.window));
    const { locator } = build({ sources: [dom] });
    await locator.locate({ x: 70, y: 70 });
    await sleep(10);
    assert.equal(locator.invalidate(reason), true, reason);
    await locator.locate({ x: 70, y: 70 });
    await sleep(10);
    assert.equal(dom.calls.length, 2, reason);
  }
});

test("only content-moving keys drop the snapshot", async () => {
  const dom = fakeSource("dom", (r) => page(r.window));
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  assert.equal(locator.invalidate("key:a"), false);
  assert.equal(locator.invalidate("key:Shift"), false);
  await locator.locate({ x: 70, y: 70 });
  assert.equal(dom.calls.length, 1);
  assert.equal(locator.invalidate("key:PageDown"), true);
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  assert.equal(dom.calls.length, 2);
});

test("raising another window reads that window afresh", async () => {
  let windows = [native("a", 0, 0, 1000, 800), native("b", 0, 0, 500, 400)];
  const dom = fakeSource("dom", (r) => page(r.window));
  const sim = desktop(1);
  const locator = createLocator({
    list: async () => windows,
    ...sim,
    sources: [dom],
    ttl: 1000,
  });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  const before = dom.calls.length;
  windows = [windows[1], windows[0]];
  locator.invalidate("raise");
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  assert.ok(dom.calls.length > before);
});

test("a window that moves is read again", async () => {
  let windows = [native("a", 0, 0, 1000, 800)];
  const dom = fakeSource("dom", (r) => page(r.window));
  const locator = createLocator({
    list: async () => windows,
    ...desktop(1),
    sources: [dom],
    ttl: 1000,
  });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  windows = [native("a", 20, 10, 1000, 780)];
  locator.invalidate("move");
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  assert.equal(dom.calls.length, 2);
  assert.deepEqual(dom.calls[1].window.bounds, {
    x: 20,
    y: 10,
    width: 1000,
    height: 780,
  });
});

test("a click reads fresh and never answers with the old snapshot", async () => {
  let generation = 0;
  const dom = fakeSource("dom", (r) => {
    generation++;
    const p = page(r.window);
    p.elements[2] = { ...p.elements[2], text: `Read number ${generation}.` };
    return p;
  });
  const { locator } = build({ sources: [dom] });
  await locator.locate({ x: 70, y: 70 });
  await sleep(10);
  const result = await locator.refresh({ x: 70, y: 70 });
  assert.equal(result.ok, true);
  assert.equal(dom.calls.at(-1).fresh, true);
  assert.equal((await locator.locate({ x: 70, y: 70 })).text, "Read number 2.");
});

test("a click that cannot finish reading says so, so the pick locks", async () => {
  const dom = fakeSource("dom", () => new Promise(() => {}));
  const { locator } = build({ sources: [dom], clickTimeout: 30 });
  const started = Date.now();
  const result = await locator.refresh({ x: 70, y: 70 });
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started < 1500);
});

test("a click outside every window has nothing to read", async () => {
  const { locator } = build({
    sources: [fakeSource("dom", (r) => page(r.window))],
  });
  assert.deepEqual(await locator.refresh({ x: 5000, y: 5000 }), {
    ok: true,
    window: null,
  });
});

test("createLocator needs to know the displays", () => {
  assert.throws(() => createLocator({ sources: [] }), TypeError);
});
