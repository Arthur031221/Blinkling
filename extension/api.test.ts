import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundFollowups,
  buildGuidePrompt,
  estimateCost,
  parseGuideSteps,
  parseJsonAnswer,
  parsePassiveAnswer,
  parseSuggestions,
  parseTranslationNodes,
  askAnthropic,
  validateAsk,
  type AskInput,
  type PageContext,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

function anthropicStream(chunks: string[], status = 200) {
  let index = 0;
  const reader = {
    read: vi.fn(async () =>
      index < chunks.length
        ? { value: new TextEncoder().encode(chunks[index++]), done: false }
        : { value: undefined, done: true },
    ),
    cancel: vi.fn(async () => {}),
    releaseLock: vi.fn(),
  };
  const fetchMock = vi.fn(async () => new Response(null, { status }));
  const response = {
    ok: status >= 200 && status < 300,
    status,
    body: { getReader: () => reader },
    text: async () => "",
  };
  fetchMock.mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return { reader };
}

const event = (type: string, fields: Record<string, unknown> = {}) =>
  `data: ${JSON.stringify({ type, ...fields })}\n\n`;

async function runAnthropic(signal = new AbortController().signal) {
  const deltas: string[] = [];
  const result = await askAnthropic(
    ask,
    "test-key",
    (text) => deltas.push(text),
    signal,
  );
  return { result, deltas };
}

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

describe("direct Anthropic event stream", () => {
  it("parses split multiline SSE records with CRLF and flushes a final unterminated record", async () => {
    const { reader } = anthropicStream([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\r',
      '\n\r\ndata: {"type":"content_block_delta",\r\ndata: "delta":{"type":"text_delta","text":"Hello"}}\r\n\r\n',
      'data: {"type":"message_delta","usage":{"output_tokens":3},"delta":{"stop_reason":"end_turn"}}\n\n',
      'data: {"type":"message_stop"}',
    ]);
    const { result, deltas } = await runAnthropic();
    expect(result).toEqual({
      answer: "Hello",
      usage: { inputTokens: 12, outputTokens: 3, costUsd: 0.000054 },
    });
    expect(deltas).toEqual(["Hello"]);
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("rejects explicit error events and invalid JSON, releasing the stream reader", async () => {
    const explicit = anthropicStream([
      event("error", { error: { type: "overloaded_error" } }),
    ]);
    await expect(runAnthropic()).rejects.toThrow("anthropic_stream_error");
    expect(explicit.reader.cancel).toHaveBeenCalledOnce();
    expect(explicit.reader.releaseLock).toHaveBeenCalledOnce();

    const invalid = anthropicStream(["data: {broken}\n\n"]);
    await expect(runAnthropic()).rejects.toThrow("anthropic_protocol");
    expect(invalid.reader.cancel).toHaveBeenCalledOnce();
    expect(invalid.reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("rejects max_tokens and EOF before message_stop", async () => {
    anthropicStream([
      event("content_block_delta", {
        delta: { type: "text_delta", text: "partial" },
      }),
      event("message_delta", { delta: { stop_reason: "max_tokens" } }),
    ]);
    await expect(runAnthropic()).rejects.toThrow("answer_limit");

    const unfinished = anthropicStream([
      event("content_block_delta", {
        delta: { type: "text_delta", text: "partial" },
      }),
    ]);
    await expect(runAnthropic()).rejects.toThrow("anthropic_incomplete");
    expect(unfinished.reader.cancel).toHaveBeenCalledOnce();
    expect(unfinished.reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("bounds streamed bytes and answer length, and cancels on abort", async () => {
    const oversizedStream = anthropicStream(["x".repeat(2 * 1024 * 1024 + 1)]);
    await expect(runAnthropic()).rejects.toThrow("anthropic_protocol");
    expect(oversizedStream.reader.cancel).toHaveBeenCalled();
    expect(oversizedStream.reader.releaseLock).toHaveBeenCalledOnce();

    anthropicStream([
      event("content_block_delta", {
        delta: { type: "text_delta", text: "x".repeat(40_001) },
      }),
    ]);
    await expect(runAnthropic()).rejects.toThrow("answer_limit");

    const controller = new AbortController();
    const aborted = anthropicStream([event("message_stop")]);
    aborted.reader.read.mockImplementationOnce(async () => {
      controller.abort();
      return {
        value: new TextEncoder().encode(event("message_stop")),
        done: false,
      };
    });
    await expect(runAnthropic(controller.signal)).rejects.toThrow("cancelled");
    expect(aborted.reader.cancel).toHaveBeenCalled();
    expect(aborted.reader.releaseLock).toHaveBeenCalledOnce();
  });
});
