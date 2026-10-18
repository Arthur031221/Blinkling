import { expect, it as test } from "vitest";
import { readFileSync } from "node:fs";
import { readsAsEnglish } from "../assets/record/language.mjs";

test("an English answer passes, with a few Arabic words quoted", () => {
  expect(
    readsAsEnglish(
      "The passage explains that artificial intelligence (الذكاء الاصطناعي) is the ability of machines to perform tasks that normally need human thought.",
    ),
  ).toBe(true);
});

test("a Traditional Chinese answer, or one in Arabic, fails", () => {
  expect(
    readsAsEnglish(
      "這段文字說明人工智慧是讓機器完成通常需要人類思考的工作的能力，並且舉出了幾個例子。",
    ),
  ).toBe(false);
  expect(
    readsAsEnglish(
      "الذكاء الاصطناعي هو قدرة الآلات على أداء مهام تتطلب عادة ذكاء بشريا وهو فرع من علوم الحاسوب. AI",
    ),
  ).toBe(false);
  expect(readsAsEnglish(undefined)).toBe(false);
});

test("the recorded translate answer is English, the language its caption says", () => {
  const events = JSON.parse(
    readFileSync("assets/record/events/translate.events.json", "utf8"),
  );
  const answer = events.find((event) => event.name === "answer");
  expect(typeof answer?.text, "the answer text is recorded").toBe("string");
  expect(readsAsEnglish(answer.text), answer.text.slice(0, 80)).toBe(true);
});
