import locale0 from "./locales/en.json";
import locale1 from "./locales/zh-TW.json";
import locale2 from "./locales/zh-CN.json";
import locale3 from "./locales/ja.json";
import locale4 from "./locales/ko.json";
import locale5 from "./locales/es.json";
import locale6 from "./locales/fr.json";
import locale7 from "./locales/de.json";
import locale8 from "./locales/pt-BR.json";

export type Locale =
  | "en"
  | "zh-TW"
  | "zh-CN"
  | "ja"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "pt-BR";
export const messages = {
  en: locale0,
  "zh-TW": locale1,
  "zh-CN": locale2,
  ja: locale3,
  ko: locale4,
  es: locale5,
  fr: locale6,
  de: locale7,
  "pt-BR": locale8,
} satisfies Record<Locale, typeof locale0>;
