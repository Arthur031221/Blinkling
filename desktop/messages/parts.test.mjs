import test from "node:test";
import assert from "node:assert/strict";
import { bubbleParts } from "./parts.mjs";

const texts = (source, complete = true) =>
  bubbleParts(source, complete).map((p) => p.markdown);

test("zh-TW and ja text yields one sentence per bubble", () => {
  assert.deepEqual(
    texts(
      "這是一個 GitHub 專案頁面。它顯示了程式碼與問題，你可以在左側看到檔案。右邊是簡介！需要我解說嗎？",
    ),
    [
      "這是一個 GitHub 專案頁面。",
      "它顯示了程式碼與問題，你可以在左側看到檔案。",
      "右邊是簡介！",
      "需要我解說嗎？",
    ],
  );
  assert.deepEqual(
    texts(
      "これはGitHubのプロジェクトページです。コードが表示されています。質問はありますか？",
    ),
    [
      "これはGitHubのプロジェクトページです。",
      "コードが表示されています。",
      "質問はありますか？",
    ],
  );
  assert.deepEqual(texts("He said 「終わり。」次へ。"), [
    "He said 「終わり。」",
    "次へ。",
  ]);
});

test("English text splits on . ! ? but not inside abbreviations, URLs or versions", () => {
  assert.deepEqual(
    texts(
      "This is a project page. See Dr. Smith (e.g. the author) at https://x.com/a?b=c and v1.2.3 notes. Is it good? Yes!",
    ),
    [
      "This is a project page.",
      "See Dr. Smith (e.g. the author) at https://x.com/a?b=c and v1.2.3 notes.",
      "Is it good?",
      "Yes!",
    ],
  );
  assert.deepEqual(texts('He said "Stop." Then he left.'), [
    'He said "Stop."',
    "Then he left.",
  ]);
  assert.deepEqual(texts("Wait… what is this? Fine."), [
    "Wait… what is this?",
    "Fine.",
  ]);
});

test("German abbreviations do not end a sentence", () => {
  assert.deepEqual(
    texts(
      "Sie zeigt z. B. Code und Issues, d. h. Dateien. Rechts steht die Beschreibung. Ist das klar? Ja.",
    ),
    [
      "Sie zeigt z. B. Code und Issues, d. h. Dateien.",
      "Rechts steht die Beschreibung.",
      "Ist das klar?",
      "Ja.",
    ],
  );
});

test("line breaks and paragraphs start new bubbles", () => {
  assert.deepEqual(texts("First line.\nSecond line.\n\nThird. Fourth."), [
    "First line.",
    "Second line.",
    "Third.",
    "Fourth.",
  ]);
});

test("block quotes split per sentence and keep their quote marker", () => {
  assert.deepEqual(texts("> one. two."), ["> one.", "> two."]);
});

test("code blocks and headings stay whole, list items split by sentence", () => {
  const parts = bubbleParts(
    "# Title. More.\n\n- a. b.\n- c. d.\n\n```js\nlet a = 1. 2;\n```",
    true,
  );
  assert.deepEqual(
    parts.map((p) => [p.kind, p.markdown]),
    [
      ["heading", "# Title. More."],
      ["point", "a."],
      ["point", "b."],
      ["point", "c."],
      ["point", "d."],
      ["code", "```js\nlet a = 1. 2;\n```"],
    ],
  );
});

test("an unfinished trailing sentence is not complete until the stream ends", () => {
  assert.deepEqual(
    bubbleParts("One. Two", false).map((p) => p.complete),
    [true, false],
  );
  assert.deepEqual(
    bubbleParts("One. Two", true).map((p) => p.complete),
    [true, true],
  );
});

test("a reference marker with punctuation inside stays in its sentence", () => {
  assert.deepEqual(
    texts(
      "Press Buy [[1:e42|Buy. Now]] first. Then wait [[2:box:1.5,2,3,4|here]].",
    ),
    [
      "Press Buy [[1:e42|Buy. Now]] first.",
      "Then wait [[2:box:1.5,2,3,4|here]].",
    ],
  );
});

const sentencesOf = (source) =>
  bubbleParts(source, true).map((p) => p.markdown);

test("a list item with several sentences becomes one bubble per sentence", () => {
  assert.deepEqual(
    sentencesOf("- First point here. It has two sentences.\n- Second point."),
    ["First point here.", "It has two sentences.", "Second point."],
  );
  assert.deepEqual(
    sentencesOf("1. 第一點很重要。它有兩句。\n2. 第二點！還有嗎？"),
    ["第一點很重要。", "它有兩句。", "第二點！", "還有嗎？"],
  );
  assert.deepEqual(sentencesOf("- 一つ目です。二つ目です。"), [
    "一つ目です。",
    "二つ目です。",
  ]);
});

test("only the first sentence of a list item carries its marker", () => {
  const parts = bubbleParts("1. One. Two.\n2. Three.", true);
  assert.deepEqual(
    parts.map((p) => [p.kind, p.marker]),
    [
      ["point", "1."],
      ["point", ""],
      ["point", "2."],
    ],
  );
});

test("nested list items are bubbles of their own, one sentence each", () => {
  assert.deepEqual(
    sentencesOf("- Outer one. Outer two.\n  - Inner one. Inner two."),
    ["Outer one.", "Outer two.", "Inner one.", "Inner two."],
  );
});

test("code spans, abbreviations and versions never split a sentence", () => {
  assert.deepEqual(
    sentencesOf(
      "- Run `npm test. now` first. Then ship v1.2 to Dr. Smith, e.g. today.",
    ),
    ["Run `npm test. now` first.", "Then ship v1.2 to Dr. Smith, e.g. today."],
  );
  assert.deepEqual(
    sentencesOf("請執行 `a。b` 指令。接著重新整理 example.com。"),
    ["請執行 `a。b` 指令。", "接著重新整理 example.com。"],
  );
});

test("a full stop inside Japanese brackets does not end the sentence", () => {
  assert.deepEqual(
    sentencesOf("詳細は「ドキュメント。」を参照してください！次へ進みます。"),
    ["詳細は「ドキュメント。」を参照してください！", "次へ進みます。"],
  );
  assert.deepEqual(sentencesOf("彼は『終わり！』と言った。それから去った。"), [
    "彼は『終わり！』と言った。",
    "それから去った。",
  ]);
});
