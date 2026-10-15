import { describe, expect, it } from "vitest";
import { bundles, chooseLocale, fill, stringsFor } from "./i18n";

describe("extension locales", () => {
  const keys = Object.keys(bundles.en).sort();
  it("ships the nine locales", () => {
    expect(Object.keys(bundles).sort()).toEqual(
      ["de", "en", "es", "fr", "ja", "ko", "pt-BR", "zh-CN", "zh-TW"].sort(),
    );
  });
  it.each(Object.entries(bundles))(
    "%s has every key, filled in",
    (_, strings) => {
      expect(Object.keys(strings).sort()).toEqual(keys);
      for (const value of Object.values(strings))
        expect(value.trim()).not.toBe("");
    },
  );
  it.each(Object.entries(bundles))(
    "%s keeps the page slot and the product names",
    (name, strings) => {
      expect(strings.readerPage).toContain("{n}");
      if (name !== "en") expect(strings.wake).toContain("Blink");
      expect(strings.linkOff).toContain("/blinkling:install");
    },
  );
  it("follows the browser language list", () => {
    expect(chooseLocale(["zh-TW", "en"])).toBe("zh-TW");
    expect(chooseLocale(["zh-HK"])).toBe("zh-TW");
    expect(chooseLocale(["zh"])).toBe("zh-CN");
    expect(chooseLocale(["pt-PT"])).toBe("pt-BR");
    expect(chooseLocale(["fr-CA", "en"])).toBe("fr");
    expect(chooseLocale(["ja_JP"])).toBe("ja");
    expect(chooseLocale(["sv", "de"])).toBe("de");
    expect(chooseLocale(["sv"])).toBe("en");
    expect(chooseLocale([])).toBe("en");
    expect(stringsFor(["ko"]).wake).toBe(bundles.ko.wake);
  });
  it("fills slots", () => {
    expect(fill("Page {n} of {total}", { n: 2, total: 9 })).toBe("Page 2 of 9");
  });
});
