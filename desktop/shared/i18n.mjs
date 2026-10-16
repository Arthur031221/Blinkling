/** Language follows the system (N3.10). Every desktop module keeps its own
 * strings.mjs: one table per locale, English as the fallback. This file is the
 * only place that asks the system which language that is: main resolves it once
 * with systemLocale() and hands the answer to every window. */
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

/** Each language in its own words, for a picker. Never translated. */
export const LANGUAGE_NAMES = Object.freeze({
  en: "English",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  "pt-BR": "Português (Brasil)",
});

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

let resolved;

/** The one language every surface speaks, a locale this app ships (a BCP47
 * tag). Main resolves it once: BLINKLING_LOCALE, then the language the user
 * chose in settings (`chosen`), then an explicit --lang (a launch override;
 * Chromium's locale is that switch), then the user's ordered language list,
 * then Chromium's own locale. Later calls get the same answer. */
export function systemLocale({ app, env = process.env, chosen } = {}) {
  if (resolved) return resolved;
  const forced = env.BLINKLING_LOCALE || (LOCALES.includes(chosen) && chosen);
  const switched = app?.commandLine?.hasSwitch?.("lang");
  const languages = forced
    ? [forced]
    : switched
      ? [app.getLocale?.()]
      : [...(app?.getPreferredSystemLanguages?.() ?? []), app?.getLocale?.()];
  resolved = pickLocale(languages);
  return resolved;
}

/** The language the user picked in settings takes effect now: resolve again
 * (`chosen` is a locale or "system") and keep the answer for every later call. */
export function changeSystemLocale(options = {}) {
  resolved = undefined;
  return systemLocale(options);
}

/** A setting a module reads on each use may be given as a function, so a
 * later language choice is seen without rebuilding the module. */
export const live = (value) => (typeof value === "function" ? value() : value);

/** Forget the resolved locale. For tests; the app resolves once per run. */
export function resetSystemLocale() {
  resolved = undefined;
}

/** A renderer keeps the locale main sent it on its root element. Not `lang`:
 * the HTML files declare their own. */
export function setDocumentLocale(doc, locale) {
  if (doc?.documentElement && LOCALES.includes(locale))
    doc.documentElement.dataset.locale = locale;
}

/** The locale of a window: what main sent, else the window's own languages. */
export function documentLocale(doc) {
  const sent = doc?.documentElement?.dataset?.locale;
  if (LOCALES.includes(sent)) return sent;
  return pickLocale(doc?.defaultView?.navigator?.languages ?? []);
}
