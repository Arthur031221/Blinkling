import test from "node:test";
import assert from "node:assert/strict";
import { createLocator } from "./index.mjs";

const display = {
  id: 1,
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};
const chrome = {
  id: "w1",
  app: "chrome",
  title: "Doc - Google Chrome",
  bounds: { x: 0, y: 0, width: 1000, height: 800 },
};
const pdf = {
  id: "w2",
  app: "evince",
  title: "doc.pdf",
  bounds: { x: 1000, y: 0, width: 600, height: 800 },
};

const raw = (key, parent, kind, b, over = {}) => ({
  key,
  parent,
  kind,
  bounds: { x: b[0], y: b[1], width: b[2], height: b[3] },
  role: "",
  name: "",
  text: "",
  secure: false,
  ...over,
});

// A source that answers from a fixed list and counts its loads.
function fake(name, elements, { delay = 0, fail = false, extra = {} } = {}) {
  const source = {
    name,
    loads: 0,
    applies: async () => true,
    async load() {
      source.loads++;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (fail) throw new Error(`${name} failed`);
      return elements
        ? { elements: typeof elements === "function" ? elements() : elements }
        : null;
    },
    ...extra,
  };
  return source;
}

// A companion host whose page export is one element per entry, in viewport px.
function fakeHost(elements, { incognito = false } = {}) {
  const host = {
    calls: 0,
    async elements() {
      host.calls++;
      return {
        page: { url: "https://x.test/", title: "x", tabId: 1, incognito },
        frame: { screenX: 0, screenY: 0, devicePixelRatio: 1, zoom: 1 },
        elements: elements.map((e, i) => ({
          id: String(i),
          tag: "p",
          role: "",
          name: "",
          text: "",
          parentId: null,
          secure: false,
          ...e,
          rect: {
            x: e.rect[0],
            y: e.rect[1],
            width: e.rect[2],
            height: e.rect[3],
          },
        })),
      };
    },
  };
  return host;
}

function make({
  windows = [chrome, pdf],
  displays = [display],
  connected = true,
  host,
  ax,
  image,
  now,
} = {}) {
  const state = { windows, displays };
  const capture = {
    windows: async () => state.windows,
    displays: () => state.displays,
  };
  const locator = createLocator({
    companion: () => connected,
    platform: "linux",
    capture,
    host,
    ax,
    image,
    now,
  });
  return { locator, state };
}

const idle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the DOM answers first for a browser window while the companion is connected", async () => {
  const host = fakeHost([
    { kind: "paragraph", tag: "p", rect: [100, 100, 300, 60], text: "Hello." },
  ]);
  const ax = fake("ax", [raw("0", null, "window", [0, 0, 1000, 800])]);
  const { locator } = make({ host, ax });
  const el = await locator.locate({ x: 150, y: 120 });
  assert.match(el.id, /^dom:w1:\d+$/);
  assert.equal(el.kind, "paragraph");
  assert.equal(el.text, "Hello.");
  assert.equal(el.window.id, "w1");
  assert.equal(el.display.id, 1);
  assert.equal(ax.loads, 0);
});

test("sources fall through DOM, then accessibility, then image", async () => {
  const host = fakeHost([{ tag: "p", rect: [0, 0, 50, 50] }]);
  const ax = fake("ax", [
    raw("0", null, "button", [200, 200, 80, 30], { name: "Go" }),
  ]);
  const image = fake("image", [raw("0", null, "image", [300, 300, 100, 100])]);
  const { locator } = make({ host, ax, image });

  const viaAx = await locator.locate({ x: 210, y: 210 });
  assert.match(viaAx.id, /^ax:w1:/);
  assert.equal(viaAx.name, "Go");

  const viaImage = await locator.locate({ x: 350, y: 350 });
  assert.match(viaImage.id, /^image:w1:/);

  assert.equal(await locator.locate({ x: 900, y: 700 }), null);
});

test("the DOM is skipped for apps that are not browsers and while the companion is away", async () => {
  const host = fakeHost([{ rect: [0, 0, 600, 800] }]);
  const ax = fake("ax", [raw("0", null, "page", [0, 0, 1600, 800])]);
  const first = make({ host, ax });
  assert.match((await first.locator.locate({ x: 1100, y: 100 })).id, /^ax:w2:/);
  assert.equal(host.calls, 0);

  const away = make({ host, ax, connected: false });
  assert.match((await away.locator.locate({ x: 100, y: 100 })).id, /^ax:w1:/);
  assert.equal(host.calls, 0);
});

test("a source that throws falls through and locate never throws", async () => {
  const ax = fake("ax", null, { fail: true });
  const image = fake("image", [raw("0", null, "image", [0, 0, 400, 400])]);
  const { locator } = make({ ax, image, connected: false });
  assert.match((await locator.locate({ x: 10, y: 10 })).id, /^image:/);

  const broken = createLocator({
    companion: () => false,
    platform: "linux",
    ax: null,
    capture: {
      windows: async () => {
        throw new Error("no window list");
      },
      displays: () => [display],
    },
  });
  assert.equal(await broken.locate({ x: 1, y: 1 }), null);
  assert.deepEqual(await broken.elements(chrome), []);
  assert.equal(await broken.textIn({ x: 0, y: 0, width: 10, height: 10 }), "");
  assert.equal(await broken.windowAt({ x: 1, y: 1 }), null);
  assert.deepEqual(await broken.snap({ x: 1, y: 1, width: 10, height: 10 }), {
    rect: { x: 1, y: 1, width: 10, height: 10 },
    element: null,
  });
});

test("the smallest element under the point wins", async () => {
  const ax = fake("ax", [
    raw("0", null, "window", [0, 0, 1000, 800]),
    raw("1", "0", "section", [50, 50, 500, 400]),
    raw("2", "1", "paragraph", [60, 60, 300, 40], { text: "inner" }),
    raw("3", "1", "button", [400, 60, 40, 20], { name: "ok" }),
  ]);
  const { locator } = make({ ax, connected: false });
  assert.equal((await locator.locate({ x: 70, y: 70 })).text, "inner");
  assert.equal((await locator.locate({ x: 410, y: 70 })).name, "ok");
  assert.equal((await locator.locate({ x: 500, y: 300 })).kind, "section");
  assert.equal((await locator.locate({ x: 10, y: 700 })).kind, "window");
});

test("a pointer on a comma or a space between links lands on the paragraph, not on the mark", async () => {
  const ax = fake("ax", [
    raw("0", null, "window", [0, 0, 1000, 800]),
    raw("1", "0", "paragraph", [60, 60, 300, 40], {
      text: "See the chart, the table and more.",
    }),
    raw("2", "1", "text", [200, 60, 11, 18], { text: "، " }),
    raw("3", "1", "text", [220, 60, 60, 18], { text: "table" }),
  ]);
  const { locator } = make({ ax, connected: false });
  const mark = await locator.locate({ x: 205, y: 70 });
  assert.equal(mark.kind, "paragraph");
  assert.match(mark.text, /chart/);
  assert.equal((await locator.locate({ x: 230, y: 70 })).text, "table");
});

test("secure fields are never returned, nor their text", async () => {
  const ax = fake("ax", [
    raw("0", null, "window", [0, 0, 1000, 800]),
    raw("1", "0", "input", [100, 100, 200, 30], {
      secure: true,
      name: "Password",
      text: "hunter2",
    }),
    raw("2", "0", "paragraph", [100, 200, 200, 30], { text: "public" }),
  ]);
  const { locator } = make({ ax, connected: false });
  const hit = await locator.locate({ x: 150, y: 110 });
  assert.equal(hit.kind, "window");
  assert.ok(!JSON.stringify(hit).includes("hunter2"));
  const all = await locator.elements(chrome);
  assert.ok(!JSON.stringify(all).includes("hunter2"));
  const text = await locator.textIn({ x: 0, y: 0, width: 1000, height: 800 });
  assert.equal(text, "public");
});

test("private windows, password managers and incognito pages answer nothing", async () => {
  const ax = fake("ax", [
    raw("0", null, "window", [0, 0, 1000, 800], { text: "secret" }),
  ]);
  for (const flagged of [
    { ...chrome, private: true },
    { ...chrome, passwordManager: true },
    { ...chrome, app: "1Password" },
    { ...chrome, title: "News - Google Chrome (Incognito)" },
  ]) {
    const { locator } = make({ windows: [flagged], ax, connected: false });
    assert.equal(await locator.locate({ x: 10, y: 10 }), null);
    assert.deepEqual(await locator.elements(flagged), []);
    assert.equal(
      await locator.textIn({ x: 0, y: 0, width: 100, height: 100 }),
      "",
    );
    assert.equal(
      (await locator.snap({ x: 0, y: 0, width: 100, height: 100 })).element,
      null,
    );
  }
  assert.equal(ax.loads, 0);

  const host = fakeHost([{ rect: [0, 0, 500, 500], text: "tab" }], {
    incognito: true,
  });
  const { locator } = make({ host, ax: null });
  assert.deepEqual(await locator.elements(chrome), []);
  assert.equal(await locator.locate({ x: 10, y: 10 }), null);
  assert.equal(
    await locator.textIn({ x: 0, y: 0, width: 100, height: 100 }),
    "",
  );
  assert.equal((await locator.focus()).window.private, true);
});

test("lists are cached, and reload when the window moves, on invalidate, or after it left", async () => {
  const ax = fake("ax", [raw("0", null, "window", [0, 0, 1000, 800])]);
  const { locator, state } = make({ ax, connected: false });
  await locator.locate({ x: 5, y: 5 });
  await locator.locate({ x: 6, y: 6 });
  assert.equal(ax.loads, 1);

  state.windows = [{ ...chrome, bounds: { ...chrome.bounds, x: 40 } }, pdf];
  await locator.windowAt({ x: 1, y: 1 }); // a fresh window list is read
  await locator.locate({ x: 45, y: 5 });
  await locator.locate({ x: 46, y: 5 });
  await idle(10);
  assert.equal(ax.loads, 2);

  locator.invalidate();
  await locator.locate({ x: 45, y: 5 });
  await idle(10);
  assert.equal(ax.loads, 3);

  state.windows = [pdf];
  await locator.elements(pdf);
  state.windows = [
    state.windows[0],
    { ...chrome, bounds: { ...chrome.bounds, x: 40 } },
  ];
  await locator.elements({ ...chrome, bounds: { ...chrome.bounds, x: 40 } });
  assert.equal(ax.loads, 5);
});

test("helpers are started once, shortly after the first hover and not on close", async () => {
  let warmed = 0;
  const ax = fake("ax", null, { extra: { warm: () => warmed++ } });
  const { locator } = make({ ax, connected: false });
  await locator.locate({ x: 5, y: 5 });
  assert.equal(warmed, 0, "not during the hover");
  await idle(300);
  assert.equal(warmed, 1);
  await locator.locate({ x: 6, y: 6 });
  await idle(300);
  assert.equal(warmed, 1, "only once");

  const never = fake("ax", null, { extra: { warm: () => warmed++ } });
  const { locator: closing } = make({ ax: never, connected: false });
  await closing.locate({ x: 5, y: 5 });
  await closing.close();
  await idle(300);
  assert.equal(warmed, 1, "a closed locator starts nothing");
});

test("a slow window listing never costs a hover once a list is known", async () => {
  const ax = fake("ax", [raw("0", null, "window", [0, 0, 1000, 800])]);
  let calls = 0;
  let slow = false;
  const windows = [chrome, pdf];
  const locator = createLocator({
    companion: () => false,
    platform: "linux",
    capture: {
      windows: async () => {
        calls++;
        if (slow) await idle(300);
        return windows;
      },
      displays: () => [display],
    },
    ax,
  });
  assert.ok(await locator.locate({ x: 5, y: 5 }));
  assert.equal(calls, 1);

  slow = true;
  await idle(250); // older than a fresh list, younger than a usable one
  const started = performance.now();
  const el = await locator.locate({ x: 6, y: 6 });
  assert.ok(el, "answered from the list it already had");
  assert.ok(performance.now() - started < 40, "did not wait for the listing");
  assert.equal(calls, 2, "a new listing was started behind the hover");
  await locator.locate({ x: 7, y: 7 });
  assert.equal(calls, 2, "only one listing runs at a time");
  await idle(350);
  assert.ok(await locator.locate({ x: 8, y: 8 }));
});

test("a cold load past the budget answers null in time, and the next hover hits", async () => {
  const ax = fake("ax", [raw("0", null, "paragraph", [0, 0, 1000, 800])], {
    delay: 200,
  });
  const { locator } = make({ ax, connected: false });
  await locator.windowAt({ x: 1, y: 1 });
  const started = performance.now();
  const first = await locator.locate({ x: 5, y: 5 });
  const took = performance.now() - started;
  assert.equal(first, null);
  assert.ok(took < 70, `cold hover took ${took.toFixed(1)} ms`);
  await idle(260);
  assert.equal((await locator.locate({ x: 5, y: 5 })).kind, "paragraph");
});

test("a cached hover is fast: p95 well under 50 ms", async () => {
  const many = Array.from({ length: 600 }, (_, i) =>
    raw(
      String(i),
      i ? "0" : null,
      "paragraph",
      [(i % 20) * 45, Math.floor(i / 20) * 25, 40, 20],
      { text: `t${i}` },
    ),
  );
  const { locator } = make({ ax: fake("ax", many), connected: false });
  await locator.elements(chrome);
  const times = [];
  for (let i = 0; i < 300; i++) {
    const t = performance.now();
    await locator.locate({ x: (i * 37) % 900, y: (i * 53) % 700 });
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  assert.ok(
    times[Math.floor(times.length * 0.95)] < 10,
    `p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms`,
  );
});

test("elements() waits for a slow source and numbers ids per source and window", async () => {
  const ax = fake(
    "ax",
    [
      raw("a", null, "window", [0, 0, 1000, 800]),
      raw("b", "a", "button", [10, 10, 50, 20]),
    ],
    { delay: 150 },
  );
  const { locator } = make({ ax, connected: false });
  const list = await locator.elements(chrome);
  assert.deepEqual(
    list.map((e) => e.id),
    ["ax:w1:0", "ax:w1:1"],
  );
  assert.ok(list.every((e) => e.window.id === "w1" && e.display.id === 1));
});

test("parent() climbs the tree, also for a copy that crossed a process boundary", async () => {
  const ax = fake("ax", [
    raw("a", null, "window", [0, 0, 1000, 800]),
    raw("b", "a", "section", [10, 10, 500, 500]),
    raw("c", "b", "text", [20, 20, 100, 20], { text: "x" }),
  ]);
  const { locator } = make({ ax, connected: false });
  const leaf = await locator.locate({ x: 30, y: 25 });
  const section = await locator.parent(leaf);
  assert.equal(section.kind, "section");
  const copy = JSON.parse(JSON.stringify(section));
  assert.equal((await locator.parent(copy)).kind, "window");
  assert.equal(await locator.parent(await locator.parent(section)), null);
  assert.equal(await locator.parent({ id: "ax:w9:3" }), null);
});

test("textIn reads in order, once, never more than 4000 characters", async () => {
  const ax = fake("ax", [
    raw("0", null, "section", [0, 0, 1000, 800], { text: "everything" }),
    raw("1", "0", "paragraph", [10, 100, 300, 20], { text: "second" }),
    raw("2", "0", "paragraph", [10, 10, 300, 20], { text: "first" }),
    raw("3", "0", "paragraph", [400, 10, 100, 20], { text: "beside" }),
    raw("4", "0", "paragraph", [900, 700, 50, 20], { text: "outside" }),
  ]);
  const { locator } = make({ ax, connected: false });
  assert.equal(
    await locator.textIn({ x: 0, y: 0, width: 600, height: 200 }),
    "first\nbeside\nsecond",
  );

  const long = fake("ax", [
    raw("0", null, "paragraph", [0, 0, 1000, 800], { text: "a".repeat(9000) }),
  ]);
  const big = make({ ax: long, connected: false });
  assert.equal(
    (await big.locator.textIn({ x: 0, y: 0, width: 50, height: 50 })).length,
    4000,
  );
  assert.equal((await big.locator.locate({ x: 5, y: 5 })).text.length, 4000);
});

test("windowAt and focus report windows with their privacy flags", async () => {
  const ax = fake("ax", null, {
    extra: { focus: async () => ({ secure: true, app: "chrome", title: "" }) },
  });
  const manager = {
    id: "w3",
    app: "Bitwarden",
    title: "vault",
    bounds: { x: 1700, y: 0, width: 200, height: 300 },
  };
  const { locator, state } = make({
    ax,
    connected: false,
    windows: [chrome, pdf, manager],
  });
  assert.deepEqual(await locator.windowAt({ x: 10, y: 10 }), {
    id: "w1",
    title: chrome.title,
    app: "chrome",
    bounds: chrome.bounds,
    private: false,
    passwordManager: false,
  });
  assert.equal(
    (await locator.windowAt({ x: 1750, y: 10 })).passwordManager,
    true,
  );
  assert.equal(await locator.windowAt({ x: 1900, y: 900 }), null);

  const focus = await locator.focus();
  assert.equal(focus.secure, true);
  assert.equal(focus.window.id, "w1");

  state.windows = [];
  assert.deepEqual(await locator.focus(), { secure: true, window: null });
});

test("focus without an accessibility answer is not secure", async () => {
  const none = make({
    ax: fake("ax", null, {
      extra: {
        focus: async () => {
          throw new Error("x");
        },
      },
    }),
    connected: false,
  });
  assert.equal((await none.locator.focus()).secure, false);
  const bare = make({ ax: fake("ax", null), connected: false });
  assert.equal((await bare.locator.focus()).secure, false);
});

test("selectionAt returns the selected text where the pointer is", async () => {
  const ax = fake("ax", null, {
    extra: {
      selection: async () => ({
        text: "picked words",
        bounds: { x: 1020, y: 100, width: 200, height: 20 },
      }),
    },
  });
  const { locator } = make({ ax, connected: false });
  const hit = await locator.selectionAt({ x: 1100, y: 110 });
  assert.equal(hit.text, "picked words");
  assert.equal(hit.kind, "text");
  assert.deepEqual(hit.bounds, { x: 1020, y: 100, width: 200, height: 20 });
  assert.equal(hit.window.id, "w2");
  assert.equal(await locator.selectionAt({ x: 1100, y: 400 }), null);
  assert.equal(await locator.selectionAt({ x: 5000, y: 5 }), null);
});

test("sentenceAt picks the sentence under the pointer", async () => {
  const text =
    "First sentence here. Second sentence follows it. Third one ends the paragraph.";
  const ax = fake("ax", [
    raw("0", null, "paragraph", [100, 100, 400, 66], { text }),
  ]);
  const { locator } = make({ ax, connected: false });
  const paragraph = await locator.locate({ x: 110, y: 110 });
  const first = await locator.sentenceAt(paragraph, { x: 110, y: 105 });
  assert.equal(first.kind, "sentence");
  assert.equal(first.text, "First sentence here.");
  assert.equal(first.id, `${paragraph.id}#s0`);
  const last = await locator.sentenceAt(paragraph, { x: 480, y: 160 });
  assert.equal(last.text, "Third one ends the paragraph.");
  for (const s of [first, last]) {
    assert.ok(s.bounds.x >= 100 && s.bounds.y >= 100);
    assert.ok(
      s.bounds.x + s.bounds.width <= 500.001 &&
        s.bounds.y + s.bounds.height <= 166.001,
    );
  }
  assert.equal((await locator.parent(first)).id, paragraph.id);
  const alone = await locator.sentenceAt(
    { ...paragraph, text: "Only one." },
    { x: 110, y: 110 },
  );
  assert.equal(alone.text, "Only one.");
  assert.deepEqual(alone.bounds, paragraph.bounds);
  assert.equal(
    await locator.sentenceAt({ ...paragraph, text: "" }, { x: 110, y: 110 }),
    null,
  );
});

for (const scale of [1, 1.5, 2]) {
  test(`snap aligns to the device pixel grid at scale ${scale}`, async () => {
    const scaled = {
      id: 1,
      scaleFactor: scale,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    };
    const ax = fake("ax", [
      raw("0", null, "paragraph", [100.2, 100.2, 300.3, 60.1], { text: "p" }),
    ]);
    const { locator } = make({ ax, connected: false, displays: [scaled] });
    const out = await locator.snap({ x: 102, y: 101, width: 296, height: 58 });
    assert.equal(out.element.kind, "paragraph");
    for (const v of [
      out.rect.x,
      out.rect.y,
      out.rect.x + out.rect.width,
      out.rect.y + out.rect.height,
    ]) {
      const device = v * scale;
      assert.ok(
        Math.abs(device - Math.round(device)) < 1e-6,
        `${v} is not on a device pixel at ${scale}`,
      );
    }
    assert.ok(
      out.rect.x <= 100.2 && out.rect.x + out.rect.width >= 400.5 - 1e-6,
    );
  });
}

test("snap on the second display uses that display's scale", async () => {
  const left = {
    id: 1,
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const right = {
    id: 2,
    scaleFactor: 2,
    bounds: { x: 1000, y: 0, width: 1000, height: 800 },
  };
  const win = {
    id: "w5",
    app: "evince",
    title: "d",
    bounds: { x: 1000, y: 0, width: 1000, height: 800 },
  };
  const ax = fake("ax", [
    raw("0", null, "paragraph", [1100.3, 100.3, 200.2, 50.2]),
  ]);
  const { locator } = make({
    ax,
    connected: false,
    windows: [win],
    displays: [left, right],
  });
  const out = await locator.snap({ x: 1101, y: 101, width: 198, height: 48 });
  assert.equal(out.element.display.id, 2);
  assert.ok(Math.abs(out.rect.x * 2 - Math.round(out.rect.x * 2)) < 1e-6);
  assert.ok(out.rect.x <= 1100.3);
});

test("snap without an element falls back to the aligned mark, and honours kinds", async () => {
  const ax = fake("ax", [
    raw("0", null, "window", [0, 0, 1000, 800]),
    raw("1", "0", "paragraph", [100, 100, 300, 60]),
    raw("2", "0", "image", [100, 100, 300, 60]),
  ]);
  const { locator } = make({ ax, connected: false });
  assert.equal(
    (
      await locator.snap(
        { x: 100, y: 100, width: 300, height: 60 },
        { kinds: ["image"] },
      )
    ).element.kind,
    "image",
  );
  const empty = await locator.snap({ x: 700, y: 500, width: 30, height: 30 });
  assert.equal(empty.element, null);
  assert.deepEqual(empty.rect, { x: 700, y: 500, width: 30, height: 30 });
  const nowhere = await locator.snap({
    x: 5000,
    y: 5000,
    width: 30,
    height: 30,
  });
  assert.equal(nowhere.element, null);
});

test("close stops the helpers", async () => {
  let closed = 0;
  const ax = fake("ax", null, { extra: { close: () => closed++ } });
  const { locator } = make({ ax, connected: false });
  await locator.close();
  assert.equal(closed, 1);
  assert.equal(await locator.locate({ x: 1, y: 1 }), null);
});
