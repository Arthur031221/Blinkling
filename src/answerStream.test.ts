import { describe, expect, it } from "vitest";
import { readAnswerStream } from "./answerStream";

describe("answer stream", () => {
  it("assembles streamed deltas and returns the final entry", async () => {
    const entry = {
      id: "a",
      at: 1,
      question: "q",
      answer: "hello",
      kind: "ask" as const,
    };
    const chunks = [
      'event: delta\ndata: {"text":"hel',
      'lo"}\n\nevent: done\ndata: {"entry":' + JSON.stringify(entry) + "}\n\n",
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    const updates: string[] = [];
    let completed = false;
    const result = await readAnswerStream(
      new Response(stream),
      (text) => updates.push(text),
      () => {
        completed = true;
      },
    );
    expect(result).toEqual({ text: "hello", entry });
    expect(updates).toEqual(["hello"]);
    expect(completed).toBe(true);
  });

  it("surfaces streamed provider errors", async () => {
    const response = new Response(
      'event: error\ndata: {"code":"provider_error"}\n\n',
    );
    await expect(
      readAnswerStream(
        response,
        () => {},
        () => {},
      ),
    ).rejects.toThrow("provider_error");
  });

  it("rejects a disconnected stream rather than treating partial text as an answer", async () => {
    let completed = false;
    await expect(
      readAnswerStream(
        new Response('event: delta\ndata: {"text":"partial"}\n\n'),
        () => {},
        () => {
          completed = true;
        },
      ),
    ).rejects.toThrow("incomplete_response");
    expect(completed).toBe(false);
  });

  it("handles UTF-8 and CRLF boundaries split across individual bytes", async () => {
    const entry = {
      id: "a",
      at: 1,
      question: "q",
      answer: "看到了",
      kind: "ask" as const,
    };
    const bytes = new TextEncoder().encode(
      `event: delta\r\ndata: ${JSON.stringify({ text: entry.answer })}\r\n\r\nevent: done\r\ndata: ${JSON.stringify({ entry })}\r\n\r\n`,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    await expect(
      readAnswerStream(
        new Response(stream),
        () => {},
        () => {},
      ),
    ).resolves.toEqual({ text: entry.answer, entry });
  });

  it("requires a complete final entry", async () => {
    await expect(
      readAnswerStream(
        new Response(
          'event: done\ndata: {"entry":{"id":"a","answer":"wrong"}}\n\n',
        ),
        () => {},
        () => {},
      ),
    ).rejects.toThrow("incomplete_response");
  });
});
