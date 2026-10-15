import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strings } from "../desktop/shared/safety.mjs";

const files = {
  en: "README.md",
  "zh-TW": "README.zh-TW.md",
  "zh-CN": "README.zh-CN.md",
  ja: "README.ja.md",
  ko: "README.ko.md",
  de: "README.de.md",
  es: "README.es.md",
  fr: "README.fr.md",
  "pt-BR": "README.pt-BR.md",
};
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
/** Everything above the first section heading ("## Install" and its
 * translations). */
const firstScreen = (text) => text.split(/^## /m)[0];

// Features N3 removed. Language-neutral names first, then the words each
// translation uses for the select popover and the suggested questions.
const removed = [
  /picture[- ]in[- ]picture/i,
  /\bPiP\b/,
  /\bshift\b/i,
  /\bssh\b/i,
  /\bAPI\b/,
  /zero[- ]install/i,
  /pairing/i,
  /popover/i,
  /suggested questions/i,
  /floating chat/i,
  /不安裝|不安装|インストール不要|설치 없이|ohne installation|sin instalar|sans installer|sem instalar/i,
  /浮動聊天|悬浮聊天|フローティングチャット|플로팅 채팅|schwebendes|flotante|flottant|flutuante/i,
  /建議問題|建议问题|推奨の質問|추천 질문|vorgeschlagene fragen|preguntas sugeridas|questions suggérées|perguntas sugeridas/i,
];

describe("the README first screen", () => {
  it("covers all nine languages", () => {
    expect(Object.keys(files).sort()).toEqual(Object.keys(strings).sort());
  });

  describe.each(Object.entries(files))("%s", (locale, file) => {
    const top = firstScreen(read(file));

    it("states the safety line in its own language, with Blinkling untranslated", () => {
      const line = strings[locale].safety;
      expect(line).toContain("Blinkling");
      expect(top).toContain(line);
    });

    it("keeps the safety line after the header and before any install step", () => {
      const at = top.indexOf(strings[locale].safety);
      expect(at).toBeGreaterThan(top.indexOf("</h1>"));
      expect(top.slice(at)).not.toMatch(/\/plugin install/);
    });

    it("draws the wordmark through a light and dark <picture>", () => {
      const picture = top.match(/<picture>.*?<\/picture>/s)?.[0] ?? "";
      expect(picture).toMatch(
        /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/brand\/wordmark-dark\.svg"/,
      );
      expect(picture).toMatch(
        /<img src="assets\/brand\/wordmark-light\.svg"[^>]*alt="Blinkling"/,
      );
    });

    it("teaches only the main way: Blink in the corner, Ctrl and click", () => {
      expect(top).toContain("Ctrl");
      expect(top).toContain("Blink");
    });

    it("names no removed feature", () => {
      for (const pattern of removed) expect(top).not.toMatch(pattern);
    });

    it("shows no image of the removed v2 chat and no missing image", () => {
      const images = [...top.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
        (m) => m[1],
      );
      for (const src of images) {
        expect(src).not.toMatch(/assets\/(demo|guide|crop|arxiv)\.gif/);
        expect(existsSync(join(process.cwd(), src))).toBe(true);
      }
    });
  });
});
