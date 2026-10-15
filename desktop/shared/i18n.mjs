/** Language follows the system (N3.10). Every desktop module keeps its own
 * strings.mjs: one table per locale, English as the fallback. */
export const LOCALES = Object.freeze([
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "de",
  "es",
  "fr",
  "pt-BR",
]);

export function pickLocale(preferred = []) {
  for (const raw of [preferred].flat()) {
    const tag = String(raw || "").replace(/_/g, "-");
    const [language = "", region = ""] = tag.split("-");
    const lang = language.toLowerCase();
    if (lang === "zh")
      return ["TW", "HK", "MO", "HANT"].includes(region.toUpperCase())
        ? "zh-TW"
        : "zh-CN";
    if (lang === "pt") return "pt-BR";
    if (LOCALES.includes(lang)) return lang;
  }
  return "en";
}

export function translator(table, locale) {
  const own = table[locale] ?? {};
  const fallback = table.en ?? {};
  return (key, vars = {}) => {
    const text = own[key] ?? fallback[key];
    if (text === undefined) throw new Error(`Missing string: ${key}`);
    return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
  };
}
