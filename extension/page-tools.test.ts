import { describe, expect, it } from "vitest";
import { validateGuideSteps, validateTranslationNodes } from "./page-tools";

describe("page tool model output", () => {
  it("accepts only known guide targets and bounds tour copy", () => {
    const steps = validateGuideSteps(
      {
        steps: [
          { elementId: "a", note: "  Start here  ", action: "Click" },
          { elementId: "outside", note: "Invented target" },
          { elementId: "a", note: "Duplicate target" },
          { elementId: "b", note: "n".repeat(500) },
        ],
      },
      new Set(["a", "b"]),
    );
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({
      elementId: "a",
      note: "Start here",
      action: "Click",
    });
    expect(steps[1].note).toHaveLength(360);
  });

  it("rejects malformed guide responses without executing or interpreting markup", () => {
    expect(validateGuideSteps("window.alert(1)", new Set(["a"]))).toEqual([]);
    const [step] = validateGuideSteps(
      { steps: [{ elementId: "a", note: "<img src=x onerror=alert(1)>" }] },
      new Set(["a"]),
    );
    expect(step.note).toContain("<img"); // Rendering uses textContent, never HTML.
  });

  it.each(["", " \n\t", "\u00a0\u3000"])(
    "rejects blank replies without erasing nonempty source text: %j",
    (blank) => {
      expect(
        validateTranslationNodes(
          { nodes: [{ id: "n1", text: blank }] },
          new Map([["n1", "Original paragraph"]]),
        ),
      ).toEqual([]);
    },
  );

  it("accepts translations only for supplied ids, once, and within size limits", () => {
    const result = validateTranslationNodes(
      {
        nodes: [
          { id: "n1", text: "bonjour" },
          { id: "other", text: "unrequested" },
          { id: "n1", text: "duplicate" },
          { id: "n2", text: "x".repeat(12_001) },
          { id: "n2", text: "salut" },
        ],
      },
      new Map([
        ["n1", "hello"],
        ["n2", "hi"],
      ]),
    );
    expect(result).toEqual([
      { id: "n1", text: "bonjour" },
      { id: "n2", text: "salut" },
    ]);
  });
});
