import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { MAX_UPLOAD_MESSAGE_BYTES } from "./config.js";
import { cancelled, PanelError } from "./errors.js";
import {
  contextPrompt,
  SYSTEM_PROMPT,
  type ProviderRequest,
  type ProviderResult,
} from "./provider-request.js";

type CliOptions = {
  command?: string;
  argsPrefix?: string[];
  tempRoot?: string;
};

export async function runCliProvider(
  request: ProviderRequest,
  options: CliOptions = {},
): Promise<ProviderResult> {
  if (request.signal.aborted) throw cancelled();
  const directory = await mkdtemp(
    join(options.tempRoot ?? tmpdir(), "glimpselet-"),
  );
  try {
    const imagePath = join(directory, "capture.png");
    if (request.image)
      await writeFile(imagePath, request.image, { mode: 0o600 });
    if (request.signal.aborted) throw cancelled();
    const env = {
      ...process.env,
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };
    delete (env as Record<string, string | undefined>).CLAUDECODE;
    const args = [
      ...(options.argsPrefix ?? []),
      "-p",
      request.image
        ? `${contextPrompt(request)}\nRead the screenshot at ${imagePath}.`
        : contextPrompt(request),
      "--model",
      request.model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--no-session-persistence",
      "--restricted",
      "--safe-mode",
      "--system-prompt",
      SYSTEM_PROMPT,
      "--tools",
      request.image ? "Read" : "",
      "--allowedTools",
      request.image ? `Read(${imagePath})` : "",
      "--strict-mcp-config",
      "--mcp-config",
      JSON.stringify({ mcpServers: {} }),
    ];
    return await new Promise<ProviderResult>((resolve, reject) => {
      const child = spawn(options.command ?? "claude", args, {
        cwd: directory,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      let forceTimer: NodeJS.Timeout | undefined;
      let failure: Error | undefined;
      let buffer = "";
      let answer = "";
      let received = 0;
      let result: Record<string, unknown> | undefined;
      const decoder = new StringDecoder("utf8");
      const kill = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          if (process.platform !== "win32") process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          // The child may have exited between the abort and the signal.
        }
      };
      const stop = () => {
        kill("SIGTERM");
        forceTimer ??= setTimeout(() => kill("SIGKILL"), 1500);
        forceTimer.unref();
      };
      const fail = (error: Error) => {
        failure ??= error;
        stop();
      };
      const consume = (line: string) => {
        if (!line.trim() || failure || request.signal.aborted) return;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          fail(
            new PanelError(
              "provider_protocol",
              "The coding assistant returned an invalid stream.",
              502,
            ),
          );
          return;
        }
        const delta =
          message?.type === "stream_event" ? message.event?.delta : undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          if (answer.length + delta.text.length > 40_000) {
            fail(
              new PanelError(
                "answer_limit",
                "The answer exceeded the text limit.",
                502,
              ),
            );
            return;
          }
          answer += delta.text;
          try {
            request.onText(delta.text);
          } catch {
            fail(
              new PanelError(
                "client_disconnected",
                "The panel stopped receiving the answer.",
                409,
              ),
            );
          }
        }
        if (message?.type === "result") {
          result = message;
          if (message.is_error)
            fail(
              new PanelError(
                "provider_error",
                "The coding assistant could not complete the answer.",
                502,
              ),
            );
          else if (!answer && typeof message.result === "string") {
            if (message.result.length > 40_000) {
              fail(
                new PanelError(
                  "answer_limit",
                  "The answer exceeded the text limit.",
                  502,
                ),
              );
              return;
            }
            answer = message.result;
            try {
              request.onText(answer);
            } catch {
              fail(
                new PanelError(
                  "client_disconnected",
                  "The panel stopped receiving the answer.",
                  409,
                ),
              );
            }
          }
        }
      };
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) stop();
      child.stdout.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > 32 * 1024 * 1024) {
          fail(
            new PanelError(
              "provider_protocol",
              "The coding assistant stream exceeded its size limit.",
              502,
            ),
          );
          return;
        }
        buffer += decoder.write(chunk);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.length > MAX_UPLOAD_MESSAGE_BYTES + 256_000) {
            fail(
              new PanelError(
                "provider_protocol",
                "The coding assistant stream exceeded its line limit.",
                502,
              ),
            );
            break;
          }
          consume(line);
        }
        if (buffer.length > MAX_UPLOAD_MESSAGE_BYTES + 256_000)
          fail(
            new PanelError(
              "provider_protocol",
              "The coding assistant stream exceeded its line limit.",
              502,
            ),
          );
      });
      child.stderr.resume();
      child.once("error", () => {
        failure = new PanelError(
          "cli_missing",
          "Could not start the coding assistant. Check that version 2.1.296 or newer is on PATH.",
          502,
        );
      });
      child.once("close", (code) => {
        request.signal.removeEventListener("abort", stop);
        if (forceTimer) clearTimeout(forceTimer);
        buffer += decoder.end();
        if (buffer.trim()) consume(buffer);
        if (request.signal.aborted) return reject(cancelled());
        if (failure) return reject(failure);
        if (code !== 0 || !result || !answer.trim())
          return reject(
            new PanelError(
              "provider_error",
              "The coding assistant did not return a completed answer. Check its login and available quota.",
              502,
            ),
          );
        const usage = result.usage as Record<string, unknown> | undefined;
        const finite = (value: unknown) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0
            ? value
            : undefined;
        resolve({
          answer,
          usage: {
            inputTokens: finite(usage?.input_tokens),
            outputTokens: finite(usage?.output_tokens),
            costUsd: finite(result.total_cost_usd),
          },
        });
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
