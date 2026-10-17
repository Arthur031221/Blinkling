import { describe, expect, it } from "vitest";
import { SHORT_ANSWER_FORMAT } from "../src/answer-format.js";
import { SYSTEM_PROMPT } from "../src/provider-request.js";

// What a chip or a question sends is answered as it is asked: no prompt in
// the provider path may put a length on the answer.
describe("the provider prompt sets no length", () => {
  it.each([
    ["the answer format", SHORT_ANSWER_FORMAT],
    ["the system prompt", SYSTEM_PROMPT],
  ])("%s has no length words", (_name, text) => {
    expect(text).not.toMatch(/\b\d+\s+words?\b/i);
    expect(text).not.toMatch(
      /\b(under|within|at most|no more than|up to)\s+(\w+\s+){0,2}(words?|sentences?|bullets?|bullet points?|lines?)\b/i,
    );
    expect(text).not.toMatch(/\b(one|single) short answer\b/i);
    expect(text).not.toMatch(/\bkeep (it|the answer|the default answer)\b/i);
    expect(text).not.toMatch(/\b(concise|briefly|brief)\b/i);
  });
});
