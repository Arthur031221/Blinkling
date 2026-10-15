import { describe, expect, it } from "vitest";
import { pickLocale, popupLocales, popupText } from "./strings";

describe("popup strings", () => {
  it("cover nine locales with the same keys, none empty", () => {
    expect(Object.keys(popupLocales).sort()).toEqual(
      ["de", "en", "es", "fr", "ja", "ko", "pt-BR", "zh-CN", "zh-TW"].sort(),
    );
    const keys = Object.keys(popupLocales.en!).sort();
    for (const [name, text] of Object.entries(popupLocales)) {
      expect(Object.keys(text).sort(), name).toEqual(keys);
      for (const value of Object.values(text))
        expect(value.trim()).not.toBe("");
    }
  });

  it("follow the browser language", () => {
    expect(pickLocale("fr-CA")).toBe("fr");
    expect(pickLocale("zh-Hant")).toBe("zh-TW");
    expect(pickLocale("zh-HK")).toBe("zh-TW");
    expect(pickLocale("zh-CN")).toBe("zh-CN");
    expect(pickLocale("pt-PT")).toBe("pt-BR");
    expect(pickLocale("sv")).toBe("en");
    expect(pickLocale(undefined)).toBe("en");
    expect(popupText("de").wake).toBe("Blink wecken");
  });

  it("keep the product names untranslated", () => {
    for (const [name, text] of Object.entries(popupLocales))
      for (const key of ["wake", "blinkRunning"] as const)
        expect(text[key], name).toContain("Blink");
  });
});
