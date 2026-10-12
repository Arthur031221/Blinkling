import { describe, expect, it } from "vitest";
import {
  boundFollowups,
  buildGuidePrompt,
  estimateCost,
  parseGuideSteps,
  parseJsonAnswer,
  parsePassiveAnswer,
  parseSuggestions,
  parseTranslationNodes,
  validateAsk,
  type AskInput,
  type PageContext,
} from "./api";

const ask: AskInput = {
  id: "a",
  question: "What is this?",
  kind: "ask",
  model: "sonnet",
  effort: "medium",
};

describe("extension bridge payloads", () => {
  it("accepts bounded plain questions and page context", () => {
    expect(() =>
      validateAsk({
        ...ask,
        page: {
          url: "https://example.test",
          title: "Example",
          text: "Hello",
          elements: [],
          hasPassword: false,
        },
      }),
    ).not.toThrow();
  });
  it("rejects empty, oversized, or non-PNG image payloads", () => {
    expect(() => validateAsk({ ...ask, question: "  " })).toThrow(
      "question_limit",
    );
    expect(() =>
      validateAsk({ ...ask, image: "data:image/jpeg;base64,a" }),
    ).toThrow("image_limit");
    expect(() => validateAsk({ ...ask, question: "x".repeat(8_001) })).toThrow(
      "question_limit",
    );
  });
  it("rejects an oversized page context before it reaches the bridge", () => {
    expect(() =>
      validateAsk({
        ...ask,
        page: {
          url: "https://example.test",
          title: "",
          text: "x".repeat(24_001),
          elements: [],
          hasPassword: false,
        },
      }),
    ).toThrow("page_limit");
  });
  it("parses fenced JSON without evaluating model output", () => {
    expect(
      parseJsonAnswer('```json\n{"steps":[{"elementId":"g1"}]}\n```'),
    ).toEqual({ steps: [{ elementId: "g1" }] });
    expect(() => parseJsonAnswer('(()=>{throw new Error("bad")})()')).toThrow();
  });
  it("bounds API followup history by count and message size", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `${index}:` + "x".repeat(5000),
    }));
    const bounded = boundFollowups(history);
    expect(bounded).toHaveLength(8);
    expect(bounded[0].content).toHaveLength(4000);
    expect(bounded[0].content.startsWith("4:")).toBe(true);
    expect(boundFollowups(history, "passive")).toEqual([]);
    expect(boundFollowups(history, "suggest")).toEqual([]);
  });
  it("builds guide instructions from existing page IDs and validates returned IDs", () => {
    const page: PageContext = {
      url: "https://example.test",
      title: "Test",
      text: "untrusted",
      hasPassword: false,
      elements: [
        { id: "g7", role: "button", text: "Save", rect: [0, 0, 20, 20] },
      ],
    };
    expect(buildGuidePrompt("find Save", page)).toContain('"g7"');
    expect(
      parseGuideSteps(
        '{"steps":[{"elementId":"g7","note":"Click it","action":"click"},{"elementId":"bad","note":"No"}]}',
        page,
      ),
    ).toEqual([{ elementId: "g7", note: "Click it", action: "click" }]);
    expect(parseGuideSteps("not json", page)).toEqual([]);
  });
  it("safely parses bounded suggestion, passive, and translation structures", () => {
    expect(parseSuggestions('{"questions":["  Why? ",1,"How?"]}')).toEqual([
      "Why?",
      "How?",
    ]);
    expect(
      parsePassiveAnswer(
        '{"what":"Change","points":["One",1,"Two"],"questions":["Next?"]}',
      ),
    ).toEqual({ what: "Change", points: ["One", "Two"], questions: ["Next?"] });
    expect(
      parseTranslationNodes(
        '{"nodes":[{"id":"n1","text":"Hola"},{"id":"n2","text":1}]}',
      ),
    ).toEqual([{ id: "n1", text: "Hola" }]);
    expect(parseTranslationNodes("bad json")).toEqual([]);
  });
  it("estimates price from token usage and clamps invalid negative counts", () => {
    expect(estimateCost("sonnet", 1000, 1000)).toBeCloseTo(0.012);
    expect(estimateCost("opus", -20, 1000)).toBeCloseTo(0.02);
  });
});
