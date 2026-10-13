import { describe, expect, it } from "vitest";
import { buildPassivePrompt, isGuideQuestion } from "./chat-intent";
import {
  contextPrompt,
  type ProviderRequest,
} from "../bridge/src/provider-request";

describe("page chat intent", () => {
  it.each([
    "Where is the export button?",
    "匯出按鈕在哪裡？",
    "导出按钮在哪里？",
    "エクスポートはどこですか？",
    "내보내기는 어디에 있나요?",
    "Dónde está el botón de exportación?",
    "Où est le bouton exporter?",
    "Wo finde ich Export?",
    "Onde fica o botão exportar?",
  ])("recognizes a page location request: %s", (question) => {
    expect(isGuideQuestion(question)).toBe(true);
  });
  it("keeps ordinary questions in chat", () => {
    expect(isGuideQuestion("Explain this paragraph.")).toBe(false);
    expect(isGuideQuestion("この文章を説明してください。")).toBe(false);
  });
  it("preserves the structured narrator contract through the CLI prompt", () => {
    const question = buildPassivePrompt("Summarize this page.", "日本語");
    const prompt = contextPrompt({
      question,
      kind: "passive",
      context: [],
    } as unknown as ProviderRequest);
    expect(prompt).toContain(`Task: ${question}`);
    expect(prompt).toContain('"points"');
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain("Reply in 日本語");
  });
});
