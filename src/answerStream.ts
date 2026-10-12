export type AnswerEntry = {
  id: string;
  at: number;
  question: string;
  answer: string;
  kind: "ask" | "passive" | "summary";
};

export async function readAnswerStream(
  response: Response,
  onText: (text: string) => void,
  onDone: (entry: AnswerEntry) => void,
): Promise<{ text: string; entry: AnswerEntry }> {
  if (!response.body) throw new Error("empty_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  let entry: AnswerEntry | undefined;
  const consume = (block: string) => {
    const type = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: (.+)$/m)?.[1];
    if (!raw) return;
    const data = JSON.parse(raw) as {
      text?: string;
      entry?: AnswerEntry;
      code?: string;
      message?: string;
    };
    if (type === "delta") {
      if (entry || typeof data.text !== "string")
        throw new Error("incomplete_response");
      text += data.text;
      if (text.length > 40_000) throw new Error("answer_too_large");
      onText(text);
    }
    if (type === "done") {
      const value = data.entry;
      if (
        entry ||
        !value ||
        typeof value.id !== "string" ||
        !Number.isFinite(value.at) ||
        typeof value.question !== "string" ||
        typeof value.answer !== "string" ||
        !value.answer.trim() ||
        value.answer.length > 40_000 ||
        !["ask", "passive", "summary"].includes(value.kind)
      )
        throw new Error("incomplete_response");
      entry = data.entry;
    }
    if (type === "error")
      throw new Error(data.code || data.message || "request_failed");
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending = (pending + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        "\n",
      );
      if (pending.length > 128_000) throw new Error("answer_too_large");
      const blocks = pending.split("\n\n");
      pending = blocks.pop() || "";
      blocks.forEach(consume);
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!entry) throw new Error("incomplete_response");
    onDone(entry);
    return { text, entry };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
