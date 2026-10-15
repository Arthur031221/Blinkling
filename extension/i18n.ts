import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ptBR from "./locales/pt-BR.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

export const bundles = {
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
export type Locale = keyof typeof bundles;
export type Strings = typeof en;

/** The bundled locale that best matches the browser's language list. */
export function chooseLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.replace("_", "-");
    const exact = (Object.keys(bundles) as Locale[]).find(
      (key) => key.toLowerCase() === tag.toLowerCase(),
    );
    if (exact) return exact;
    const base = tag.split("-")[0]!.toLowerCase();
    if (base === "zh") return /-(tw|hk|mo|hant)/i.test(tag) ? "zh-TW" : "zh-CN";
    if (base === "pt") return "pt-BR";
    const match = (Object.keys(bundles) as Locale[]).find(
      (key) => key.toLowerCase() === base,
    );
    if (match) return match;
  }
  return "en";
}

export const stringsFor = (languages: readonly string[]): Strings =>
  bundles[chooseLocale(languages)];

/** Fills {name} slots in a string. */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
