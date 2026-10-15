import { translator } from "../shared/i18n.mjs";

/** Words written into a saved guide, and the label of the bubble that offers
 * the save. "Blinkling" and "Blink" are never translated. */
export const guideStrings = {
  en: {
    saveBubble: "Save guide",
    untitled: "Guide",
    steps: "Steps",
    screenAlt: "Screen {n}",
    stepAlt: "Step {n}",
  },
  "zh-TW": {
    saveBubble: "儲存導覽",
    untitled: "導覽",
    steps: "步驟",
    screenAlt: "畫面 {n}",
    stepAlt: "步驟 {n}",
  },
  "zh-CN": {
    saveBubble: "保存导览",
    untitled: "导览",
    steps: "步骤",
    screenAlt: "画面 {n}",
    stepAlt: "步骤 {n}",
  },
  ja: {
    saveBubble: "ガイドを保存",
    untitled: "ガイド",
    steps: "手順",
    screenAlt: "画面 {n}",
    stepAlt: "手順 {n}",
  },
  ko: {
    saveBubble: "가이드 저장",
    untitled: "가이드",
    steps: "단계",
    screenAlt: "화면 {n}",
    stepAlt: "단계 {n}",
  },
  de: {
    saveBubble: "Anleitung speichern",
    untitled: "Anleitung",
    steps: "Schritte",
    screenAlt: "Bildschirm {n}",
    stepAlt: "Schritt {n}",
  },
  es: {
    saveBubble: "Guardar guía",
    untitled: "Guía",
    steps: "Pasos",
    screenAlt: "Pantalla {n}",
    stepAlt: "Paso {n}",
  },
  fr: {
    saveBubble: "Enregistrer le guide",
    untitled: "Guide",
    steps: "Étapes",
    screenAlt: "Écran {n}",
    stepAlt: "Étape {n}",
  },
  "pt-BR": {
    saveBubble: "Salvar guia",
    untitled: "Guia",
    steps: "Passos",
    screenAlt: "Tela {n}",
    stepAlt: "Passo {n}",
  },
};

export const guideText = (locale) => translator(guideStrings, locale);
