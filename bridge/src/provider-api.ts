import { cancelled, PanelError } from "./errors.js";
import {
  contextPrompt,
  SYSTEM_PROMPT,
  type ProviderRequest,
  type ProviderResult,
} from "./provider-request.js";

export const API_MODELS = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  haiku: "claude-haiku-5-5",
} as const;

export async function runApiProvider(
  request: ProviderRequest,
  fetcher: typeof fetch = fetch,
): Promise<ProviderResult> {
  if (request.signal.aborted) throw cancelled();
  if (!request.key)
    throw new PanelError(
      "api_key_missing",
      "Add an API key or switch to the installed CLI.",
    );
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: request.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": request.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: API_MODELS[request.model],
      max_tokens:
        request.kind === "guide"
          ? 12_000
          : request.kind === "passive"
            ? 2048
            : 4096,
      stream: true,
      ...(request.effort ? { output_config: { effort: request.effort } } : {}),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...(request.image
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: request.image.toString("base64"),
                    },
                  },
                ]
              : []),
            { type: "text", text: contextPrompt(request) },
          ],
        },
      ],
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new PanelError(
      response.status === 401 || response.status === 403
        ? "api_auth"
        : "provider_error",
      response.status === 401 || response.status === 403
        ? "The API key was not accepted."
        : `The API returned status ${response.status}.`,
      502,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    answer = "",
    completed = false,
    bytes = 0;
  let inputTokens: number | undefined, outputTokens: number | undefined;
  const consume = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new PanelError(
        "provider_protocol",
        "The API returned an invalid stream.",
        502,
      );
    }
    if (event.type === "error")
      throw new PanelError(
        "provider_error",
        "The API could not complete the answer.",
        502,
      );
    if (event.type === "message_start")
      inputTokens = event.message?.usage?.input_tokens;
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      typeof event.delta.text === "string"
    ) {
      if (answer.length + event.delta.text.length > 40_000)
        throw new PanelError(
          "answer_limit",
          "The answer exceeded the text limit.",
          502,
        );
      answer += event.delta.text;
      request.onText(event.delta.text);
    }
    if (event.type === "message_delta") {
      outputTokens = event.usage?.output_tokens;
      if (event.delta?.stop_reason === "max_tokens")
        throw new PanelError(
          "answer_limit",
          "The API reached its output limit. Ask a shorter question.",
          502,
        );
    }
    if (event.type === "message_stop") completed = true;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      bytes += value?.length ?? 0;
      if (bytes > 2 * 1024 * 1024)
        throw new PanelError(
          "provider_protocol",
          "The API stream exceeded its size limit.",
          502,
        );
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (request.signal.aborted) throw cancelled();
    if (!completed || !answer.trim())
      throw new PanelError(
        "provider_protocol",
        "The API stream ended before the answer completed.",
        502,
      );
    return { answer, usage: { inputTokens, outputTokens } };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
