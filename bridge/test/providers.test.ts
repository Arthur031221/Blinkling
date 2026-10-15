// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  const path = await mkdtemp(join(tmpdir(), "blinkling-provider-test-"));
  temporary.push(path);
  return path;
}

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    image: Buffer.from("PNG fixture"),
    question: "What is shown?",
    model: "sonnet",
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

describe("CLI provider protocol", () => {
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
    expect(JSON.stringify(saved.env)).not.toContain("parent-session-fixture");
    expect(
      (await readdir(root)).filter((name) => name.startsWith("blinkling-")),
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
      (await readdir(root)).filter((name) => name.startsWith("blinkling-")),
    ).toHaveLength(0);
  });
});
