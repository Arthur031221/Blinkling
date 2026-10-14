import type { Locale } from "./locales";

export type Model = "sonnet" | "opus" | "haiku";
export type Backend = "cli" | "api";
export type Settings = {
  locale: Locale;
  theme: "light" | "dark";
  model: Model;
  backend: Backend;
  rateCap: number;
  size: "compact" | "expanded";
};
export const defaults: Settings = {
  locale: "en",
  theme: "light",
  model: "sonnet",
  backend: "cli",
  rateCap: 6,
  size: "expanded",
};
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

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(
      sessionStorage.getItem("blinkling-settings") || "null",
    );
    if (!raw || typeof raw !== "object") return defaults;
    return {
      locale: locales.includes(raw.locale) ? raw.locale : defaults.locale,
      theme: raw.theme === "dark" ? "dark" : "light",
      model: ["sonnet", "opus", "haiku"].includes(raw.model)
        ? raw.model
        : defaults.model,
      backend: raw.backend === "api" ? "api" : "cli",
      rateCap:
        Number.isInteger(raw.rateCap) && raw.rateCap >= 1 && raw.rateCap <= 6
          ? raw.rateCap
          : defaults.rateCap,
      size: raw.size === "compact" ? "compact" : "expanded",
    };
  } catch {
    return defaults;
  }
}
