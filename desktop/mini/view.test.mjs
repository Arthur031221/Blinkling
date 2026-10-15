import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountMini } from "./view.mjs";
import { t } from "./strings.mjs";
import { t as tp } from "../pick/strings.mjs";
import { strings as composerStrings } from "../composer/strings.mjs";
import { translator } from "../shared/i18n.mjs";

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
    tc: translator(composerStrings, locale),
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

const selection = { model: "haiku", effort: "low", permissionMode: "default" };

test("the toolbar has the add button, the model, effort and permission lists, all named in the viewer's language", () => {
  const { mini, doc } = setup("zh-TW");
  mini.update(view({ selection }));
  assert.equal(
    doc.querySelector(".mini-add").getAttribute("aria-label"),
    "加入附件",
  );
  const lists = [...doc.querySelectorAll(".mini-toolbar .gl-picker-menu")];
  assert.deepEqual(
    lists.map((m) => m.getAttribute("aria-label")),
    ["模型", "思考程度", "權限模式"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".mini-toolbar .gl-picker-value")].map(
      (n) => n.textContent,
    ),
    ["Haiku", "低", "先詢問"],
  );
});

test("the lists stay shut until the session has a selection, and while one is being applied", () => {
  const { mini } = setup();
  mini.update(view({ selection: null }));
  assert.ok(mini.pickers.all.every((p) => p.trigger.disabled));
  mini.update(view({ selection }));
  assert.ok(mini.pickers.all.every((p) => !p.trigger.disabled));
  mini.update(view({ selection, selecting: true }));
  assert.ok(mini.pickers.all.every((p) => p.trigger.disabled));
});

test("a pick sends the whole selection and keeps the other lists", () => {
  const { mini, calls, doc } = setup();
  mini.update(view({ selection }));
  doc.querySelectorAll(".mini-toolbar .gl-picker-trigger")[2].click();
  doc.querySelector('[data-value="plan"]').click();
  assert.deepEqual(
    calls.find(([n]) => n === "select"),
    ["select", { model: "haiku", effort: "low", permissionMode: "plan" }],
  );
});

test("the add button opens the file chooser and each chosen file is handed over", async () => {
  const { mini, calls, doc } = setup();
  let clicked = 0;
  mini.file.addEventListener("click", () => clicked++);
  mini.add.click();
  assert.equal(clicked, 1);
  const file = { name: "a.png" };
  Object.defineProperty(mini.file, "files", { value: [file] });
  mini.file.dispatchEvent(new doc.defaultView.Event("change"));
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(
    calls.find(([n]) => n === "attach"),
    ["attach", file],
  );
});

test("a file added with + shows its name, and a notice reads in the viewer's language", () => {
  const { mini, doc } = setup("en");
  mini.update(
    view({
      selection,
      entries: [{ id: "f1", type: "file", kind: "file", name: "notes.pdf" }],
      notice: "too-many-files",
    }),
  );
  assert.equal(
    doc.querySelector(".mini-entry-file .mini-entry-label").textContent,
    "notes.pdf",
  );
  const notice = doc.querySelector(".mini-notice");
  assert.equal(notice.hidden, false);
  assert.equal(notice.textContent, "You can add up to 8 attachments");
  mini.update(view({ selection, notice: "" }));
  assert.equal(notice.hidden, true);
});

test("an open list makes room below the toolbar and gives it back when it closes", () => {
  const { mini, doc } = setup();
  mini.update(view({ selection }));
  const menu = doc.querySelector(".mini-toolbar .gl-picker-menu");
  Object.defineProperty(menu, "offsetHeight", { value: 90 });
  const toolbar = doc.querySelector(".mini-toolbar");
  mini.pickers.model.trigger.click();
  mini.fitList();
  assert.equal(toolbar.style.marginBottom, "94px");
  mini.pickers.model.dismiss();
  mini.fitList();
  assert.equal(toolbar.style.marginBottom, "");
});

test("a thumbnail is a button that opens the whole picture", () => {
  const { mini, doc, calls } = setup();
  mini.update(
    view({ entries: [{ ...image, thumb: "data:image/png;base64,AA" }] }),
  );
  const button = doc.querySelector("button.mini-open");
  assert.ok(button.querySelector("img.mini-thumb"));
  assert.equal(
    button.getAttribute("aria-label"),
    t("zh-TW")("mini.open-image"),
  );
  button.click();
  assert.deepEqual(calls.at(-1), ["openImage", "i1"]);
});

test("text typed before more picks joined the box is put back, and typing is never overwritten", () => {
  const { mini, doc } = setup();
  mini.update(view());
  mini.update(view({ text: "what is this" }));
  assert.equal(
    doc.querySelector("textarea, input.mini-input, .mini-input").value,
    "what is this",
  );
  const input = doc.querySelector(".mini-input");
  input.value = "what is this, and that";
  mini.update(view({ text: "what is this" }));
  assert.equal(input.value, "what is this, and that");
});
