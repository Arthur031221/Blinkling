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
      "bridgeLost",
      "keyMissing",
      "apiAuth",
      "passwordPage",
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
      "crop_fullscreen_denied",
      "share_ended",
    ])
      keys.add(key);
    const expected = [...keys].sort();
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(Object.keys(bundle).sort(), locale).toEqual(expected);
      for (const [key, value] of Object.entries(bundle))
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
    }
    expect(en.pair).toBe("Connect");
    expect(en.pairCode).toBe("Pairing code");
    expect(en.bridgeUrl).toBe("Connection URL");
    expect(en.visible).toBe("Visible area");
    expect(en.restore).toBe("Restore original text");
    expect(en.float).toBe("Open floating panel");
    expect(en.effort).toBe("Reasoning effort");
    expect(en.blocklist).toMatch(/Sites to ignore/);
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
