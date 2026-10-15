import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountMini } from "./view.mjs";
import { t } from "./strings.mjs";
import { t as tp } from "../pick/strings.mjs";

function setup(locale = "zh-TW") {
  const dom = new JSDOM(`<!doctype html><body><div id="root"></div></body>`);
  const calls = [];
  const on = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) =>
          calls.push([name, ...args]),
    },
  );
  const mini = mountMini(dom.window.document.getElementById("root"), {
    t: t(locale),
    tp: tp(locale),
    on,
  });
  return { dom, mini, calls, doc: dom.window.document };
}
const image = { id: "i1", type: "image", kind: "image", tag: null };
const chips = [
  { id: "what", label: "這是什麼", highlighted: true },
  { id: "translate", label: "翻譯", highlighted: false },
  { id: "keypoints", label: "重點", highlighted: false },
];
const view = (extra = {}) => ({
  entries: [image],
  chips,
  defaultId: "what",
  text: "",
  pause: false,
  offers: [],
  ...extra,
});

test("the default chip is highlighted and the input has no placeholder", () => {
  const { mini, doc } = setup();
  mini.update(view());
  const buttons = [...doc.querySelectorAll(".mini-chip")];
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ["這是什麼", "翻譯", "重點"],
  );
  assert.deepEqual(
    buttons.map((b) => b.classList.contains("is-default")),
    [true, false, false],
  );
  assert.equal(
    doc.querySelector(".mini-input").getAttribute("placeholder"),
    null,
  );
});

test("a text chip shows its first words and its length, and has a remove button", () => {
  const { mini, doc, calls } = setup();
  mini.update(
    view({
      entries: [
        {
          id: "t1",
          type: "text",
          kind: "text",
          preview: "Blink looks at…",
          length: 68,
        },
      ],
    }),
  );
  const chip = doc.querySelector(".mini-entry-text");
  assert.match(chip.textContent, /Blink looks at…/);
  assert.match(chip.textContent, /68 個字/);
  doc.querySelector(".mini-remove").click();
  assert.deepEqual(calls.at(-1), ["remove", "t1"]);
});

test("a video chip carries the this-frame tag", () => {
  const { mini, doc } = setup();
  mini.update(view({ entries: [{ ...image, kind: "video", tag: "frame" }] }));
  assert.equal(doc.querySelector(".mini-tag").textContent, "目前畫面");
});

test("Enter sends, Shift+Enter does not, and Enter during IME composition does not", () => {
  const { mini, doc, calls } = setup();
  mini.update(view());
  const input = doc.querySelector(".mini-input");
  const press = (init) =>
    input.dispatchEvent(
      new doc.defaultView.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  press({ key: "Enter", shiftKey: true });
  press({ key: "Enter", isComposing: true });
  assert.deepEqual(
    calls.filter((c) => c[0] === "submit"),
    [],
  );
  press({ key: "Enter" });
  assert.deepEqual(calls.filter((c) => c[0] === "submit").length, 1);
});

test("Escape in the box or anywhere else asks to close", () => {
  const { mini, doc, calls } = setup();
  mini.update(view());
  doc.querySelector(".mini-input").dispatchEvent(
    new doc.defaultView.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    }),
  );
  doc.body.dispatchEvent(
    new doc.defaultView.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    }),
  );
  assert.equal(calls.filter((c) => c[0] === "escape").length, 2);
});

test("typing is reported, and redrawing keeps what was typed", () => {
  const { mini, doc, calls } = setup();
  mini.update(view());
  const input = doc.querySelector(".mini-input");
  input.value = "hello";
  input.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  assert.deepEqual(calls.at(-1), ["input", "hello"]);
  mini.update(view({ text: "hello" }));
  assert.equal(input.value, "hello");
  assert.equal(doc.querySelector(".mini-input"), input, "the same element");
});

test("the pause line shows only when auto explain is paused", () => {
  const { mini, doc } = setup();
  mini.update(view({ pause: true }));
  const line = doc.querySelector(".mini-pause");
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, "暫停自動解說");
  mini.update(view({ pause: false }));
  assert.equal(line.hidden, true);
});

test("the translate-page pill is clickable and sends no chip", () => {
  const { mini, doc, calls } = setup();
  mini.update(view({ offers: [{ id: "translate-page", entryId: "p" }] }));
  const pill = doc.querySelector(".mini-offer");
  assert.equal(pill.textContent, "翻譯整頁");
  pill.click();
  assert.deepEqual(calls.at(-1), ["offer", "translate-page"]);
});

test("with no entries there are no quick asks", () => {
  const { mini, doc } = setup();
  mini.update(view({ entries: [], chips: [] }));
  assert.equal(doc.querySelector(".mini-quick").hidden, true);
});

test("an image whose pixels have not come yet shows a placeholder where the thumbnail goes", () => {
  const { mini, doc } = setup();
  mini.update(view({ entries: [{ ...image, pending: true }] }));
  assert.ok(doc.querySelector(".mini-thumb-pending"));
  mini.update(
    view({ entries: [{ ...image, thumb: "data:image/png;base64,AA" }] }),
  );
  assert.equal(doc.querySelector(".mini-thumb-pending"), null);
  assert.ok(doc.querySelector("img.mini-thumb"));
});
