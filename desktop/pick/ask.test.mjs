import test from "node:test";
import assert from "node:assert/strict";
import { askModel, detectLanguage, chipLabels } from "./ask.mjs";
// The old product name, built from parts so this file does not name it.
const OLD_NAME = new RegExp(["Glimp", "selet"].join(""));

const long = "This is a longer passage about the history of tea. ".repeat(20);

test("detects the language of a text from its script and common words", () => {
  assert.equal(detectLanguage("今天天氣很好，我們去公園散步。"), "zh");
  assert.equal(
    detectLanguage("今日はいい天気ですね。公園へ行きましょう。"),
    "ja",
  );
  assert.equal(detectLanguage("오늘은 날씨가 좋습니다. 공원에 갑시다."), "ko");
  assert.equal(
    detectLanguage("The weather is nice and we are going to the park."),
    "en",
  );
  assert.equal(
    detectLanguage("Das Wetter ist schön und wir gehen in den Park."),
    "de",
  );
  assert.equal(
    detectLanguage("El tiempo es muy bueno y vamos al parque con ellos."),
    "es",
  );
  assert.equal(
    detectLanguage("Il fait beau et nous allons au parc avec les enfants."),
    "fr",
  );
  assert.equal(
    detectLanguage("O tempo está bom e nós vamos para o parque com eles."),
    "pt",
  );
  assert.equal(detectLanguage("42"), null);
  assert.equal(detectLanguage(""), null);
});

test("the three chips are the spec's words in Traditional Chinese", () => {
  assert.deepEqual(chipLabels("zh-TW"), ["這是什麼", "翻譯", "重點"]);
});

test("an image defaults to what is this, whatever the language", () => {
  const m = askModel({ items: [{ kind: "image" }], locale: "zh-TW" });
  assert.equal(m.defaultId, "what");
  assert.deepEqual(
    m.chips.map((c) => [c.id, c.highlighted]),
    [
      ["what", true],
      ["translate", false],
      ["keypoints", false],
    ],
  );
});

test("text in the user's own language defaults to explain this", () => {
  const m = askModel({
    items: [{ kind: "text", text: "今天天氣很好，我們去公園散步。" }],
    locale: "zh-TW",
  });
  assert.equal(m.defaultId, "what");
  assert.equal(m.chips[0].prompt, "這是什麼");
});

test("text in another language defaults to translate", () => {
  const m = askModel({
    items: [
      {
        kind: "text",
        text: "The weather is nice and we are going to the park.",
      },
    ],
    locale: "zh-TW",
  });
  assert.equal(m.defaultId, "translate");
  assert.equal(m.chips.find((c) => c.highlighted).id, "translate");
});

test("Japanese text is foreign to a Chinese reader and Chinese to a Japanese one", () => {
  assert.equal(
    askModel({
      items: [
        { kind: "text", text: "今日はいい天気ですね。公園へ行きましょう。" },
      ],
      locale: "zh-TW",
    }).defaultId,
    "translate",
  );
  assert.equal(
    askModel({
      items: [{ kind: "text", text: "今天天氣很好，我們去公園散步。" }],
      locale: "ja",
    }).defaultId,
    "translate",
  );
});

test("Traditional and Simplified Chinese count as the user's language", () => {
  assert.equal(
    askModel({
      items: [{ kind: "text", text: "今天天气很好，我们去公园散步。" }],
      locale: "zh-TW",
    }).defaultId,
    "what",
  );
});

test("a long section or page defaults to key points", () => {
  for (const kind of ["section", "page"])
    assert.equal(
      askModel({ items: [{ kind, text: long }], locale: "en" }).defaultId,
      "keypoints",
      kind,
    );
});

test("a long foreign page still defaults to translate", () => {
  assert.equal(
    askModel({ items: [{ kind: "page", text: long }], locale: "de" }).defaultId,
    "translate",
  );
});

test("code, tables, formulas and controls default to what is this", () => {
  for (const kind of [
    "code",
    "table",
    "formula",
    "chart",
    "video",
    "control",
    "window",
    "area",
  ])
    assert.equal(
      askModel({
        items: [{ kind, text: kind === "code" ? "const a = 1;" : "" }],
        locale: "en",
      }).defaultId,
      "what",
      kind,
    );
});

test("with several items the first foreign text decides", () => {
  const m = askModel({
    items: [
      { kind: "image" },
      {
        kind: "text",
        text: "The weather is nice and we are going to the park.",
      },
    ],
    locale: "ja",
  });
  assert.equal(m.defaultId, "translate");
});

test("every chip sends exactly the words it shows, in the user's language, and has no placeholder sentence", () => {
  for (const locale of [
    "en",
    "zh-TW",
    "zh-CN",
    "ja",
    "ko",
    "de",
    "es",
    "fr",
    "pt-BR",
  ]) {
    const m = askModel({ items: [{ kind: "image" }], locale });
    for (const c of m.chips) {
      assert.ok(c.label, `${locale} ${c.id}`);
      assert.equal(c.prompt, c.label);
      assert.doesNotMatch(c.prompt, OLD_NAME);
    }
    assert.equal(m.placeholder, undefined);
  }
});

test("no items means no chips: the mini composer is only a text box", () => {
  const m = askModel({ items: [], locale: "en" });
  assert.deepEqual(m.chips, []);
  assert.equal(m.defaultId, null);
});
