// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runApiProvider } from "../src/provider-api.js";
import { runCliProvider } from "../src/provider-cli.js";
import type { ProviderRequest } from "../src/provider-request.js";

const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temp() {
  const path = await mkdtemp(join(tmpdir(), "glimpselet-provider-test-"));
  temporary.push(path);
  return path;
}

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    image: Buffer.from("PNG fixture"),
    question: "What is shown?",
    model: "sonnet",
    backend: "cli",
    kind: "ask",
    context: [],
    signal: new AbortController().signal,
    onText: () => {},
    ...overrides,
  };
}

async function script(root: string, body: string) {
  const path = join(root, "provider.cjs");
  await writeFile(path, body);
  return path;
}

const cliLine = (value: unknown) => `${JSON.stringify(value)}\n`;
const sse = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;

describe("CLI provider protocol", () => {
  it("summarizes saved passive text without enabling CLI image tools or files", async () => {
    const root = await temp();
    const record = join(root, "summary.json");
    const child = await script(
      root,
      `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify(args));
      process.stdout.write(${JSON.stringify(cliLine({ type: "result", result: "A saved note summary." }))});
    `,
    );
    const result = await runCliProvider(
      request({
        image: undefined,
        kind: "summary",
        question: "Summarize saved notes",
        context: [
          {
            id: "passive-1",
            at: 1_700_000_000_000,
            question: "What changed?",
            answer: "A blue panel appeared.",
            kind: "passive",
          },
          {
            id: "ask-1",
            at: 1_700_000_000_100,
            question: "What is this app?",
            answer: "A dashboard.",
            kind: "ask",
          },
        ],
      }),
      { command: process.execPath, argsPrefix: [child], tempRoot: root },
    );
    const args = JSON.parse(await readFile(record, "utf8")) as string[];
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(result.answer).toBe("A saved note summary.");
    expect(prompt).toContain("A blue panel appeared.");
    expect(prompt).not.toContain("A dashboard.");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("");
    expect(prompt).not.toContain("capture.png");
    expect(
      (await readdir(root)).filter((name) => name.startsWith("glimpselet-")),
    ).toHaveLength(0);
  });

  it("reassembles split UTF-8 output, requires result completion, captures usage, and uses restricted read-only arguments", async () => {
    const root = await temp();
    const child = await script(
      root,
      `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(join(root, "record.json"))}, JSON.stringify({ args: process.argv.slice(2), env: process.env }));
      const first = Buffer.from(${JSON.stringify(cliLine({ type: "stream_event", event: { delta: { type: "text_delta", text: "Résumé " } } }))});
      const second = Buffer.from(${JSON.stringify(cliLine({ type: "stream_event", event: { delta: { type: "text_delta", text: "🧭" } } }) + cliLine({ type: "result", result: "", usage: { input_tokens: 7, output_tokens: 3 }, total_cost_usd: 0.012 }))});
      const joined = Buffer.concat([first, second]);
      const split = joined.indexOf(Buffer.from('🧭')) + 2;
      process.stdout.write(joined.subarray(0, split));
      setTimeout(() => { process.stdout.write(joined.subarray(split)); }, 5);
    `,
    );
    for (const key of [
      "CLAUDECODE",
      "CLAUDE_CODE_CHILD_SESSION",
      "CLAUDE_CODE_SESSION_ID",
      "CLAUDE_CODE_BRIDGE_SESSION_ID",
    ])
      vi.stubEnv(key, "parent-session-fixture");
    const record = join(root, "record.json");
    const chunks: string[] = [];
    const result = await runCliProvider(
      request({
        onText: (value) => chunks.push(value),
        key: "must-not-forward-this-key",
      }),
      {
        command: process.execPath,
        argsPrefix: [child],
        tempRoot: root,
      },
    );
    const saved = JSON.parse(await readFile(record, "utf8")) as {
      args: string[];
      env: Record<string, string>;
    };
    expect(result).toEqual({
      answer: "Résumé 🧭",
      usage: { inputTokens: 7, outputTokens: 3, costUsd: 0.012 },
    });
    expect(chunks.join("")).toBe("Résumé 🧭");
    expect(saved.args).toContain("--restricted");
    expect(saved.args).toContain("--safe-mode");
    expect(saved.args).toContain("--tools");
    expect(saved.args).toContain("Read");
    expect(saved.args.join(" ")).toContain("--allowedTools Read(");
    expect(JSON.stringify(saved)).not.toContain("must-not-forward-this-key");
    expect(JSON.stringify(saved.env)).not.toContain("parent-session-fixture");
    expect(
      (await readdir(root)).filter((name) => name.startsWith("glimpselet-")),
    ).toHaveLength(0);
  });

  it("rejects protocol errors and streams without a successful result", async () => {
    const root = await temp();
    const malformed = await script(
      root,
      "process.stdout.write('not json\\n');",
    );
    await expect(
      runCliProvider(request(), {
        command: process.execPath,
        argsPrefix: [malformed],
        tempRoot: root,
      }),
    ).rejects.toMatchObject({ code: "provider_protocol" });
    const incomplete = await script(
      root,
      `process.stdout.write(${JSON.stringify(cliLine({ type: "stream_event", event: { delta: { type: "text_delta", text: "partial" } } }))});`,
    );
    await expect(
      runCliProvider(request(), {
        command: process.execPath,
        argsPrefix: [incomplete],
        tempRoot: root,
      }),
    ).rejects.toMatchObject({ code: "provider_error" });
    const errored = await script(
      root,
      `process.stdout.write(${JSON.stringify(cliLine({ type: "result", is_error: true }))});`,
    );
    await expect(
      runCliProvider(request(), {
        command: process.execPath,
        argsPrefix: [errored],
        tempRoot: root,
      }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("terminates an aborted child and removes its temporary screenshot directory", async () => {
    const root = await temp();
    const marker = join(root, "image-path.txt");
    const child = await script(
      root,
      `
      const fs = require('node:fs');
      const prompt = process.argv[process.argv.indexOf('-p') + 1];
      fs.writeFileSync(${JSON.stringify(marker)}, prompt.match(/Read the screenshot at (.+)\\.$/)[1]);
      setInterval(() => {}, 1000);
    `,
    );
    const controller = new AbortController();
    const running = runCliProvider(request({ signal: controller.signal }), {
      command: process.execPath,
      argsPrefix: [child],
      tempRoot: root,
    });
    for (
      let tries = 0;
      tries < 100 && !(await readFile(marker).catch(() => undefined));
      tries++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    const imagePath = await readFile(marker, "utf8");
    expect(await readFile(imagePath)).toEqual(Buffer.from("PNG fixture"));
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    await expect(readFile(imagePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await readdir(root)).filter((name) => name.startsWith("glimpselet-")),
    ).toHaveLength(0);
  });
});

describe("API provider SSE protocol", () => {
  it("forwards every provided effort level for each model alias", async () => {
    const modelIds = {
      sonnet: "claude-sonnet-5-5",
      opus: "claude-opus-5-5",
      haiku: "claude-haiku-5-5",
    } as const;
    const events = [
      sse({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "ok" },
      }),
      sse({ type: "message_stop" }),
    ].join("");
    for (const model of ["sonnet", "opus", "haiku"] as const) {
      for (const effort of ["low", "medium", "high"] as const) {
        let sentBody = "";
        await runApiProvider(
          request({ backend: "api", key: "api-test-key", model, effort }),
          async (_url, init) => {
            sentBody = String(init?.body);
            return new Response(events, {
              headers: { "content-type": "text/event-stream" },
            });
          },
        );
        expect(JSON.parse(sentBody)).toMatchObject({
          model: modelIds[model],
          output_config: { effort },
        });
      }
    }
  });

  it("leaves output_config omitted when legacy requests omit effort", async () => {
    let sentBody = "";
    await runApiProvider(
      request({ backend: "api", key: "api-test-key" }),
      async (_url, init) => {
        sentBody = String(init?.body);
        return new Response(
          [
            sse({
              type: "content_block_delta",
              delta: { type: "text_delta", text: "ok" },
            }),
            sse({ type: "message_stop" }),
          ].join(""),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    );
    expect(JSON.parse(sentBody)).not.toHaveProperty("output_config");
  });

  it("sends summary text and saved passive notes without an image block", async () => {
    let sentBody = "";
    const body = [
      sse({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Saved notes summary." },
      }),
      sse({
        type: "message_delta",
        usage: { output_tokens: 3 },
        delta: { stop_reason: "end_turn" },
      }),
      sse({ type: "message_stop" }),
    ].join("");
    const result = await runApiProvider(
      request({
        image: undefined,
        backend: "api",
        key: "api-test-key",
        kind: "summary",
        question: "Summarize saved notes",
        context: [
          {
            id: "passive-1",
            at: 1_700_000_000_000,
            question: "What changed?",
            answer: "A blue panel appeared.",
            kind: "passive",
          },
          {
            id: "ask-1",
            at: 1_700_000_000_100,
            question: "What is this app?",
            answer: "A dashboard.",
            kind: "ask",
          },
        ],
      }),
      async (_url, init) => {
        sentBody = String(init?.body);
        return new Response(body, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    );
    const payload = JSON.parse(sentBody) as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    expect(result.answer).toBe("Saved notes summary.");
    expect(payload.messages[0]!.content.map((block) => block.type)).toEqual([
      "text",
    ]);
    expect(payload.messages[0]!.content[0]!.text).toContain(
      "A blue panel appeared.",
    );
    expect(payload.messages[0]!.content[0]!.text).not.toContain("A dashboard.");
  });

  it("parses multi-chunk CRLF SSE across a split UTF-8 character and returns usage", async () => {
    let sentUrl = "";
    let sentInit: RequestInit | undefined;
    const events = [
      sse({ type: "message_start", message: { usage: { input_tokens: 12 } } }),
      sse({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "你好 " },
      }),
      sse({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "🌤️" },
      }),
      sse({
        type: "message_delta",
        usage: { output_tokens: 4 },
        delta: { stop_reason: "end_turn" },
      }),
      sse({ type: "message_stop" }),
    ].join("");
    const bytes = new TextEncoder().encode(events);
    const split =
      events.indexOf("🌤️") >= 0
        ? new TextEncoder().encode(events.slice(0, events.indexOf("🌤️")))
            .length + 2
        : 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split, split + 3));
        controller.enqueue(bytes.slice(split + 3));
        controller.close();
      },
    });
    const text: string[] = [];
    const result = await runApiProvider(
      request({
        backend: "api",
        key: "api-test-key",
        onText: (value) => text.push(value),
      }),
      async (url, init) => {
        sentUrl = String(url);
        sentInit = init;
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    );
    expect(sentUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(sentInit!.headers).get("x-api-key")).toBe(
      "api-test-key",
    );
    expect(JSON.parse(String(sentInit!.body)).stream).toBe(true);
    expect(result).toEqual({
      answer: "你好 🌤️",
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    expect(text.join("")).toBe(result.answer);
  });

  it("rejects HTTP errors, error events, malformed data, and incomplete streams", async () => {
    const fetcher =
      (body: string, status = 200) =>
      async () =>
        new Response(body, {
          status,
          headers: { "content-type": "text/event-stream" },
        });
    await expect(
      runApiProvider(
        request({ backend: "api", key: "k" }),
        fetcher("", 200) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "provider_protocol" });
    await expect(
      runApiProvider(
        request({ backend: "api", key: "k" }),
        fetcher("", 401) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "api_auth" });
    await expect(
      runApiProvider(
        request({ backend: "api", key: "k" }),
        fetcher(sse({ type: "error" })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "provider_error" });
    await expect(
      runApiProvider(
        request({ backend: "api", key: "k" }),
        fetcher("data: nope\r\n\r\n") as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "provider_protocol" });
    await expect(
      runApiProvider(
        request({ backend: "api", key: "k" }),
        fetcher(
          sse({
            type: "content_block_delta",
            delta: { type: "text_delta", text: "partial" },
          }),
        ) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "provider_protocol" });
  });
});
