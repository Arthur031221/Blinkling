import { describe, expect, it } from "vitest";
import { messages, type Locale } from "./locales";

const locales: Locale[] = [
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt-BR",
];

describe("panel translations", () => {
  it("provides every English UI message in all nine locales", () => {
    for (const locale of locales) {
      for (const key of Object.keys(
        messages.en,
      ) as (keyof typeof messages.en)[]) {
        expect(messages[locale][key], `${locale}.${key}`).toEqual(
          expect.any(String),
        );
        expect(messages[locale][key].trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("translates all lifecycle and processing status messages", () => {
    const keys: (keyof typeof messages.en)[] = [
      "statusScreenEnded",
      "statusLiveReady",
      "statusNoticing",
      "statusThinking",
      "statusPassiveAdded",
      "statusAnswerReady",
      "statusShareFirst",
      "statusPopupBlocked",
      "statusFixtureAnswer",
      "reopenAction",
      "passivePrompt",
      "summaryPrompt",
      "answerStateStreaming",
      "answerStateComplete",
      "answerStateCancelled",
      "answerStateIncomplete",
      "answerCancelExplanation",
    ];
    for (const locale of locales.filter((value) => value !== "en")) {
      for (const key of keys)
        expect(messages[locale][key], `${locale}.${key}`).not.toBe(
          messages.en[key],
        );
    }
  });
});
