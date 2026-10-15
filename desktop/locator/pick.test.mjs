import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPicker } from "../pick/picker.mjs";
import { forPicker, parseTable } from "./pick.mjs";

const DISPLAY = {
  id: "1",
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
};
const WINDOW = {
  id: "w1",
  title: "Notes",
  app: "chromium",
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  private: false,
  passwordManager: false,
};
const el = (id, kind, bounds, extra = {}) => ({
  id,
  kind,
  bounds,
  role: kind,
  name: "",
  text: "",
  window: WINDOW,
  display: DISPLAY,
  ...extra,
});
const at = (x, y) => ({ x, y });

/** A locator over a fixed list, answering like the real one. */
function fake(elements, extra = {}) {
  const inside = (r, p) =>
    p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
  const calls = [];
  return {
    calls,
    async locate(p) {
      return (
        elements
          .filter((e) => inside(e.bounds, p))
          .sort(
            (a, b) =>
              a.bounds.width * a.bounds.height -
              b.bounds.width * b.bounds.height,
          )[0] ?? null
      );
    },
    async parent(e) {
      const up = e.id.startsWith("kid") ? "page" : null;
      return elements.find((x) => x.id === up) ?? null;
    },
    async elements() {
      return elements;
    },
    async sentenceAt() {
      return null;
    },
    async selectionAt() {
      return null;
    },
    async textIn() {
      return "inside";
    },
    async focus() {
      return { secure: false, window: WINDOW };
    },
    async windowAt(p) {
      return inside(WINDOW.bounds, p) ? WINDOW : null;
    },
    async snap(rect) {
      return { rect, element: null };
    },
    async refresh(point) {
      calls.push(["refresh", point]);
      return { ok: true, window: WINDOW };
    },
    ...extra,
  };
}

const page = el("page", "page", { x: 0, y: 0, width: 800, height: 600 });
const guard = { allowed: () => true };
const pick = (elements, extra) => {
  const locator = fake(elements, extra);
  return {
    locator,
    picker: createPicker({
      locator: forPicker(locator),
      guard,
      display: DISPLAY,
    }),
  };
};

describe("parseTable", () => {
  it("reads a Markdown table back into rows", () => {
    assert.deepEqual(parseTable("| a | b |\n| --- | --- |\n| 1 | 2 |"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("keeps an escaped pipe inside its cell", () => {
    assert.deepEqual(parseTable("| a \\| b | c |\n| --- | --- |\n| 1 | 2 |"), [
      ["a | b", "c"],
      ["1", "2"],
    ]);
  });
  it("is empty for no table", () => {
    assert.deepEqual(parseTable(""), []);
    assert.deepEqual(parseTable(undefined), []);
  });
});

describe("forPicker: element kinds the picker understands", () => {
  const taken = async (element) => {
    const { picker } = pick([page, element]);
    const r = await picker.click(at(20, 20));
    assert.equal(r.type, "taken");
    return r.item.taken;
  };
  const box = { x: 10, y: 10, width: 200, height: 100 };

  for (const kind of [
    "paragraph",
    "heading",
    "sentence",
    "cell",
    "link",
    "text",
  ]) {
    it(`takes a ${kind} as text`, async () => {
      const t = await taken(el("kid-1", kind, box, { text: "Hello there." }));
      assert.equal(t.kind, "text");
      assert.equal(t.text, "Hello there.");
    });
  }

  it("takes a table as Markdown", async () => {
    const t = await taken(
      el("kid-1", "table", box, {
        content: { markdown: "| a | b |\n| --- | --- |\n| 1 | 2 |" },
      }),
    );
    assert.equal(t.kind, "table");
    assert.equal(t.text, "| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("takes code in a fenced block with its language", async () => {
    const t = await taken(
      el("kid-1", "code", box, {
        text: "x = 1",
        content: { code: "x = 1", language: "python" },
      }),
    );
    assert.equal(t.kind, "code");
    assert.equal(t.text, "```python\nx = 1\n```");
  });

  it("takes a formula as LaTeX", async () => {
    const t = await taken(
      el("kid-1", "formula", box, { content: { latex: "a^2" } }),
    );
    assert.equal(t.text, "$$a^2$$");
  });

  for (const [kind, as] of [
    ["figure", "image"],
    ["canvas", "image"],
    ["image", "image"],
    ["chart", "chart"],
    ["video", "video"],
    ["button", "control"],
    ["control", "control"],
    ["input", "control"],
  ]) {
    it(`takes a ${kind} as ${as}`, async () => {
      const t = await taken(el("kid-1", kind, box));
      assert.equal(t.kind, as);
    });
  }

  it("takes a window element as the whole window", async () => {
    const t = await taken(el("kid-1", "window", box));
    assert.equal(t.kind, "window");
    assert.deepEqual(t.bounds, WINDOW.bounds);
  });

  it("takes a section with the text under it", async () => {
    const t = await taken(el("kid-1", "section", box));
    assert.equal(t.kind, "section");
    assert.equal(t.text, "inside");
  });

  it("does not change what the locator returned", async () => {
    const original = el("kid-1", "paragraph", box, { text: "Hi." });
    const { locator } = pick([page, original]);
    await forPicker(locator).locate(at(20, 20));
    assert.equal(original.kind, "paragraph");
  });
});

describe("forPicker: windows", () => {
  it("marks a browser window", async () => {
    const { picker } = pick([
      page,
      el(
        "kid-1",
        "paragraph",
        { x: 10, y: 10, width: 100, height: 50 },
        { text: "Hi." },
      ),
    ]);
    const r = await picker.click(at(20, 20));
    assert.equal(r.item.taken.browser, true);
    assert.equal(r.item.taken.window.pdf, undefined);
  });

  it("marks a PDF window", async () => {
    const pdf = { ...WINDOW, title: "paper.pdf — Evince", app: "evince" };
    const e = el(
      "kid-1",
      "paragraph",
      { x: 10, y: 10, width: 100, height: 50 },
      { text: "Hi.", window: pdf },
    );
    const { picker } = pick([page, e], { windowAt: async () => pdf });
    const r = await picker.click(at(20, 20));
    assert.equal(r.item.taken.window.pdf, true);
    assert.equal(r.item.taken.browser, undefined);
  });

  it("falls back to the window when nothing is under the point", async () => {
    const { picker } = pick([]);
    const r = await picker.click(at(20, 20));
    assert.equal(r.item.taken.kind, "window");
    assert.equal(r.item.taken.browser, true);
  });
});

describe("forPicker: secure fields", () => {
  const secure = el(
    "kid-1",
    "input",
    { x: 10, y: 10, width: 100, height: 30 },
    { secure: true },
  );

  it("still locks on a secure marker", async () => {
    const { picker } = pick([page, secure]);
    assert.equal((await picker.click(at(20, 20))).type, "lock");
    assert.equal((await picker.hover(at(20, 20))).lock, true);
  });

  it("locks an area holding one", async () => {
    const { picker } = pick([page, secure]);
    const r = await picker.area({ x: 0, y: 0, width: 200, height: 100 });
    assert.equal(r.type, "lock");
  });
});

describe("forPicker: a click waits for a fresh read", () => {
  const para = el(
    "kid-1",
    "paragraph",
    { x: 10, y: 10, width: 100, height: 50 },
    { text: "Hi." },
  );

  it("refreshes at the clicked point before it takes anything", async () => {
    const { picker, locator } = pick([page, para]);
    await picker.click(at(20, 20));
    assert.deepEqual(locator.calls, [["refresh", at(20, 20)]]);
  });

  it("does not refresh for a hover", async () => {
    const { picker, locator } = pick([page, para]);
    await picker.hover(at(20, 20));
    assert.deepEqual(locator.calls, []);
  });

  it("locks when the read could not finish", async () => {
    const { picker } = pick([page, para], {
      refresh: async () => ({ ok: false, window: WINDOW }),
    });
    const r = await picker.click(at(20, 20));
    assert.equal(r.type, "lock");
    assert.deepEqual(picker.items(), []);
  });

  it("locks when the read throws", async () => {
    const { picker } = pick([page, para], {
      refresh: async () => {
        throw new Error("gone");
      },
    });
    assert.equal((await picker.click(at(20, 20))).type, "lock");
  });
});

describe("forPicker: the rest of the locator", () => {
  it("passes snap and invalidate through", async () => {
    const seen = [];
    const locator = fake([], { invalidate: (reason) => seen.push(reason) });
    const adapted = forPicker(locator);
    adapted.invalidate("raise");
    assert.deepEqual(seen, ["raise"]);
    assert.deepEqual(await adapted.snap({ x: 1, y: 2, width: 3, height: 4 }), {
      rect: { x: 1, y: 2, width: 3, height: 4 },
      element: null,
    });
  });
});
