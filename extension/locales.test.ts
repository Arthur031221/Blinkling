import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ptBR from "./locales/pt-BR.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import { formatReaderText, readerLocales } from "./reader-locales";

const locales = {
  en,
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  ja,
  ko,
  es,
  fr,
  de,
  "pt-BR": ptBR,
};
describe("extension locale bundles", () => {
  it("cover every main panel translation lookup with the same non-empty key set", async () => {
    const source = readFileSync("extension/main.tsx", "utf8");
    const keys = new Set(
      [...source.matchAll(/\bt\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
    );
    for (const key of [
      "element",
      "bridgeLost",
      "keyMissing",
      "apiAuth",
      "replyInterrupted",
      "replyLimit",
      "replyServiceError",
      "passwordPage",
      "blockedPage",
      "siteAccess",
      "unsupportedPage",
      "tabChanged",
      "captureCancelled",
      "noActiveTab",
      "questionLimit",
      "timeout",
      "stopped",
      "genericError",
      "capturePermission",
      "captureFailed",
      "crop_fullscreen_denied",
      "share_ended",
      "sessionInitialization",
      "imageFormat",
      "imageLimit",
      "imageDecode",
      "translationIncomplete",
      "guideFailed",
    ])
      keys.add(key);
    const expected = [...keys].sort();
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(Object.keys(bundle).sort(), locale).toEqual(expected);
      for (const [key, value] of Object.entries(bundle))
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      expect(bundle.sessionInitialization, locale).toContain(bundle.newThread);
    }
    expect(zhTW.connected).toBe("已連到你的 Claude Code");
    expect(en.pairHint).toContain("/blinkling:blinkling");
    expect(en.visible).toBe("Visible area");
    expect(en.restore).toBe("Restore original text");
    expect(en.float).toBe("Open floating panel");
    expect(en.effort).toBe("Reasoning effort");
    expect(en.blocklist).toMatch(/Sites to ignore/);
  });

  it("uses a named floating chat action and a current page summary label", () => {
    const oldHistoryLabels = {
      en: "Summarize last ten minutes",
      "zh-TW": "摘要最近十分鐘",
      "zh-CN": "总结最近十分钟",
      ja: "直近10分を要約",
      ko: "최근 10분 요약",
      es: "Resumir los últimos diez minutos",
      fr: "Résumer les dix dernières minutes",
      de: "Letzte zehn Minuten zusammenfassen",
      "pt-BR": "Resumir os últimos dez minutos",
    };
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(bundle.consentAccept, locale).not.toBe(bundle.gotIt);
      expect(bundle.pageSummary, locale).not.toBe(
        oldHistoryLabels[locale as keyof typeof oldHistoryLabels],
      );
    }
  });

  it("names Auto explain in concise consent in all nine languages", () => {
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(bundle.consent1, locale).toContain(bundle.autoExplain);
      expect(bundle.consentText, locale).not.toBe(bundle.consent1);
      for (const removed of ["consent2", "consent3", "consentFoot"])
        expect(Object.hasOwn(bundle, removed), `${locale}.${removed}`).toBe(
          false,
        );
    }
  });

  it("keeps completion feedback independent of an image attachment in every locale", () => {
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(bundle.answerReady, locale).not.toMatch(
        /image|画像|이미지|圖片|图片|imagen|imagem|Bild/i,
      );
    }
  });

  it("names Claude Code and reasoning levels without exposing transport states in every locale", () => {
    const reasoning = {
      en: ["Low", "Medium", "High"],
      "zh-TW": ["低", "中", "高"],
      "zh-CN": ["低", "中", "高"],
      ja: ["低", "中", "高"],
      ko: ["낮음", "보통", "높음"],
      es: ["Bajo", "Medio", "Alto"],
      fr: ["Faible", "Moyen", "Élevé"],
      de: ["Niedrig", "Mittel", "Hoch"],
      "pt-BR": ["Baixo", "Médio", "Alto"],
    };
    for (const [locale, bundle] of Object.entries(locales)) {
      const text: Record<string, string> = bundle;
      expect(text.bridgeMode, locale).toContain("Claude Code");
      expect(
        [text.effortLow, text.effortMedium, text.effortHigh],
        locale,
      ).toEqual(reasoning[locale as keyof typeof reasoning]);
      expect(text.connected, locale).toContain("Claude Code");
      expect(text.ready, locale).toBe(text.connected);
      expect(text.bridgeLost, locale).toContain("/blinkling:blinkling");
      for (const removed of [
        "pairCode",
        "bridgeUrl",
        "connectionLive",
        "connectionDedicated",
        "connectionContinued",
        "replayTour",
      ])
        expect(Object.hasOwn(bundle, removed), `${locale}.${removed}`).toBe(
          false,
        );
    }
  });

  it("separates subscription equivalent usage from a direct API estimate for the past hour", () => {
    const equivalent = {
      en: /Equivalent API usage, past hour/,
      "zh-TW": /過去一小時.*等值/,
      "zh-CN": /过去一小时.*等值/,
      ja: /過去1時間.*換算/,
      ko: /지난 1시간.*환산/,
      es: /equivalente.*última hora/,
      fr: /équivalente.*dernière heure/,
      de: /API-Gegenwert.*letzte Stunde/,
      "pt-BR": /equivalente.*última hora/,
    };
    const noAdditionalCharge = {
      en: /not an additional charge from Blinkling/,
      "zh-TW": /Blinkling 不會.*額外.*收費/,
      "zh-CN": /Blinkling 不会.*额外.*收费/,
      ja: /Blinkling.*追加料金.*請求しません/,
      ko: /Blinkling.*추가 요금.*청구하지 않습니다/,
      es: /Blinkling no.*cargo adicional/,
      fr: /Blinkling ne.*frais supplémentaires/,
      de: /Blinkling berechnet.*keine zusätzlichen Gebühren/,
      "pt-BR": /Blinkling não.*cobrança adicional/,
    };
    for (const [locale, bundle] of Object.entries(locales)) {
      const text: Record<string, string> = bundle;
      expect(text.cliUsageEstimate, locale).toMatch(
        equivalent[locale as keyof typeof equivalent],
      );
      expect(text.cliUsageHint, locale).toMatch(
        noAdditionalCharge[locale as keyof typeof noAdditionalCharge],
      );
      expect(text.cliUsageEstimate, locale).not.toBe(text.costEstimate);
      expect(text.apiUsageHint?.trim(), locale).toBeTruthy();
      expect(text.apiUsageHint, locale).not.toBe(text.cliUsageHint);
      if (locale !== "en")
        expect(text.apiUsageHint, locale).not.toBe(en.apiUsageHint);
    }
  });

  it("localizes selected-passage prompts with exact text and the chosen response language", () => {
    const selected = 'トラベルタンブラー 350ml\n"tea" <measure> {language}';
    for (const [locale, bundle] of Object.entries(locales)) {
      const text: Record<string, string> = bundle;
      for (const key of [
        "selectionTranslatePrompt",
        "selectionExplainPrompt",
      ]) {
        const template = text[key];
        expect(template, `${locale}.${key}`).toBeDefined();
        expect(
          template.match(/\{language\}/g),
          `${locale}.${key}`,
        ).toHaveLength(1);
        expect(template.match(/\{text\}/g), `${locale}.${key}`).toHaveLength(1);
        const prompt = template
          .replace("{language}", "繁體中文")
          .replace("{text}", selected);
        expect(prompt, `${locale}.${key}`).toContain("繁體中文");
        expect(prompt.endsWith(selected), `${locale}.${key}`).toBe(true);
        if (locale !== "en")
          expect(template, `${locale}.${key}`).not.toBe(
            (en as Record<string, string>)[key],
          );
      }
      expect(text.selectedPassage?.trim(), locale).toBeTruthy();
      expect(text.selectedPassage, locale).not.toMatch(/untrusted/i);
      expect(text.selectionTranslate?.trim(), locale).toBeTruthy();
      expect(text.selectionTranslate, locale).not.toBe(text.actionTranslate);
      expect(text.selectionTranslate, locale).not.toBe(text.translatePage);
      expect(text.selectionPractice?.trim(), locale).toBeTruthy();
      expect(text.selectionPractice, locale).not.toBe(text.replayTour);
      expect(text.suggestionPractice?.trim(), locale).toBeTruthy();
      expect(text.suggestionPractice, locale).not.toBe(text.replayTour);
      expect(text.floatPracticeReady?.trim(), locale).toBeTruthy();
      expect(text.floatPracticeReady, locale).not.toBe(text.float);
      if (locale !== "en")
        for (const key of [
          "selectedPassage",
          "selectionTranslate",
          "selectionPractice",
          "suggestionPractice",
          "floatPracticeReady",
        ])
          expect(text[key], `${locale}.${key}`).not.toBe(
            (en as Record<string, string>)[key],
          );
      for (const key of [
        "selectedSummaryPrompt",
        "readerSummaryPrompt",
        "selectionAskPrompt",
      ]) {
        expect(text[key]?.trim(), `${locale}.${key}`).toBeTruthy();
        expect(text[key], `${locale}.${key}`).not.toMatch(/untrusted/i);
        if (locale !== "en")
          expect(text[key], `${locale}.${key}`).not.toBe(
            (en as Record<string, string>)[key],
          );
      }
      expect(text.selectedSummaryPrompt, locale).not.toBe(
        text.readerSummaryPrompt,
      );
    }
    expect(en.actionTranslate).toBe("Translate this");
    expect(en.translatePage).toBe("Translate page");
    expect(zhTW.actionTranslate).toBe("翻譯畫面");
    expect(zhTW.translatePage).toBe("翻譯整頁");
  });

  it("keeps page translation actions distinct from selected-text translation", () => {
    const pageActions = {
      en: ["Translate this", "Translate page"],
      "zh-TW": ["翻譯畫面", "翻譯整頁"],
      "zh-CN": ["翻译画面", "翻译整页"],
      ja: ["翻訳する", "ページを翻訳"],
      ko: ["번역하기", "페이지 번역"],
      es: ["Traducir", "Traducir la página"],
      fr: ["Traduire", "Traduire la page"],
      de: ["Übersetzen", "Seite übersetzen"],
      "pt-BR": ["Traduzir", "Traduzir página"],
    };
    for (const [locale, bundle] of Object.entries(locales))
      expect([bundle.actionTranslate, bundle.translatePage], locale).toEqual(
        pageActions[locale as keyof typeof pageActions],
      );
  });

  it("translates every reader label and formats status placeholders", () => {
    const expected = Object.keys(readerLocales.en).sort();
    for (const [locale, bundle] of Object.entries(readerLocales)) {
      expect(Object.keys(bundle).sort(), locale).toEqual(expected);
      for (const [key, value] of Object.entries(bundle)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
        if (locale !== "en")
          expect(
            value,
            `${locale}.${key} must not fall back to English`,
          ).not.toBe(readerLocales.en[key as keyof typeof readerLocales.en]);
      }
    }
    expect(
      formatReaderText(readerLocales.en.pageLabel, { page: 3, total: 8 }),
    ).toBe("Page 3 of 8");
    expect(formatReaderText(readerLocales.en.ready, { count: 8 })).toContain(
      "8 pages",
    );
  });
});
