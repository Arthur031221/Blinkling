import { pickLocale, translator } from "../shared/i18n.mjs";
/** Text the character window itself shows, one table per locale. */
export const strings = {
  en: {
    permission: "Blink needs your OK",
  },
  "zh-TW": {
    permission: "需要你的允許",
  },
  "zh-CN": {
    permission: "需要你的允许",
  },
  ja: {
    permission: "許可が必要です",
  },
  ko: {
    permission: "허락이 필요해요",
  },
  de: {
    permission: "Blink braucht dein OK",
  },
  es: {
    permission: "Blink necesita tu permiso",
  },
  fr: {
    permission: "Blink a besoin de ton accord",
  },
  "pt-BR": {
    permission: "Blink precisa da sua permissão",
  },
};
const system = () => [
  ...(globalThis.navigator?.languages ?? []),
  globalThis.navigator?.language,
];
export const windowText = (locale = pickLocale(system())) =>
  translator(strings, locale);
/** Fill every [data-label] / [data-text] from the table. */
export function applyText(root, text = windowText()) {
  for (const el of root.querySelectorAll("[data-label]"))
    el.setAttribute("aria-label", text(el.dataset.label));
  for (const el of root.querySelectorAll("[data-text]"))
    el.textContent = text(el.dataset.text);
}
