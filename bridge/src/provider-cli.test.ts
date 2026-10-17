// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCliProvider } from "./provider-cli.js";
import type { ProviderRequest } from "./provider-request.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "blinkling-cli-scope-"));
  temporary.push(root);
  const capturesName =
    process.platform === "win32"
      ? "captures [private]"
      : "captures [private] *?";
  const captures = join(root, capturesName);
  await mkdir(captures);
  const record = join(root, "record.json");
  const command = join(root, "cli.cjs");
  await writeFile(
    command,
    `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      const prompt = args[args.indexOf('-p') + 1];
      const image = prompt.match(/Read the screenshot at (.+)\\.$/)?.[1];
      fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({
        args, cwd: process.cwd(), image,
        contents: image ? fs.readFileSync(image, 'utf8') : undefined,
        directoryMode: image ? fs.statSync(require('node:path').dirname(image)).mode & 0o777 : undefined,
        imageMode: image ? fs.statSync(image).mode & 0o777 : undefined,
      }));
      fs.writeSync(1, JSON.stringify({ type: 'result', result: 'Viewed.' }) + '\\n');
    `,
  );
  return { root, captures, record, command };
}

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    image: Buffer.from("private screenshot"),
    question: "What is visible?",
    model: "haiku",
    signal: new AbortController().signal,
    onText: () => {},
    ...overrides,
  };
}

describe("CLI screenshot working directory and permissions", () => {
  it("scopes an external screenshot to its own private directory", async () => {
    const { root, captures, record, command } = await fixture();
    await runCliProvider(request(), {
      command: process.execPath,
      argsPrefix: [command],
      tempRoot: captures,
    });
    const saved = JSON.parse(await readFile(record, "utf8"));
    const value = (flag: string) => saved.args[saved.args.indexOf(flag) + 1];
    expect(value("--system-prompt")).toContain("use Markdown");
    expect(value("--system-prompt")).toContain(
      "Preserve requested JSON schemas",
    );
    expect(saved.cwd).toBe(dirname(saved.image));
    expect(value("--add-dir")).toBe(dirname(saved.image));
    expect(
      saved.args.filter((arg: string) => arg === "--add-dir"),
    ).toHaveLength(1);
    expect(value("--tools")).toBe("Read");
    const permissionRoot =
      process.platform === "win32"
        ? root
            .replaceAll("\\", "/")
            .replace(
              /^([a-z]):/i,
              (_: string, drive: string) => `/${drive.toLowerCase()}`,
            )
        : root;
    const permissionDirectory =
      process.platform === "win32"
        ? "captures \\[private\\]"
        : "captures \\[private\\] \\*\\?";
    expect(value("--allowedTools")).toBe(
      `Read(/${permissionRoot}/${permissionDirectory}/${basename(dirname(saved.image))}/capture.png)`,
    );
    expect(saved.args).toContain("--restricted");
    expect(saved.args).toContain("--safe-mode");
    expect(saved.args).toContain("--strict-mcp-config");
    expect(JSON.parse(value("--mcp-config"))).toEqual({ mcpServers: {} });
    expect(saved.args).not.toContain("--dangerously-skip-permissions");
    expect(saved.args).not.toContain("--continue");
    expect(saved.args).toContain("--no-session-persistence");
    expect(saved.contents).toBe("private screenshot");
    if (process.platform !== "win32") {
      expect(saved.directoryMode).toBe(0o700);
      expect(saved.imageMode).toBe(0o600);
    }
    expect(await readdir(captures)).toEqual([]);
    await expect(readFile(saved.image)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses an absolute screenshot directory for a relative tempRoot", async () => {
    const { captures, record, command } = await fixture();
    await runCliProvider(request(), {
      command: process.execPath,
      argsPrefix: [command],
      tempRoot: relative(process.cwd(), captures),
    });
    const saved = JSON.parse(await readFile(record, "utf8"));
    expect(saved.image).toBe(resolve(saved.image));
    expect(saved.cwd).toBe(dirname(saved.image));
    expect(saved.args).toContain("--no-session-persistence");
    expect(await readdir(captures)).toEqual([]);
  });

  it("does not add directories or image permissions for a text-only request", async () => {
    const { captures, record, command } = await fixture();
    await runCliProvider(request({ image: undefined }), {
      command: process.execPath,
      argsPrefix: [command],
      tempRoot: captures,
    });
    const { args, image } = JSON.parse(await readFile(record, "utf8"));
    expect(args).not.toContain("--add-dir");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("");
    expect(args).toContain("--restricted");
    expect(args).toContain("--safe-mode");
    expect(image).toBeUndefined();
    expect(await readdir(captures)).toEqual([]);
  });
});
