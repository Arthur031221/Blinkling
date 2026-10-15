import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { version: releaseVersion } = JSON.parse(
  await readFile(join(process.cwd(), "package.json"), "utf8"),
);
const install = await readFile("docs/INSTALL.md", "utf8");
const section = (title) =>
  install.split(`## ${title}\n`)[1]?.split("\n## ")[0] ?? "";

describe("installation guidance", () => {
  it("provides a checkout build, version check, and session-local plugin launch", () => {
    const source = section("Run a source checkout");
    expect(source).not.toBe("");
    const shell = [...source.matchAll(/```sh\n([\s\S]*?)\n```/g)]
      .map((match) => match[1])
      .join("\n");
    for (const command of [
      "npm ci",
      "npm run build:plugin",
      "claude plugin validate .",
      "node -p \"require('./.claude-plugin/plugin.json').version\"",
      'claude --plugin-dir "$PWD"',
    ]) {
      expect(shell.split("\n")).toContain(command);
    }
    expect(source).toContain(releaseVersion);
    expect(source).toContain("/blinkling:blinkling");
    expect(source).toMatch(/session/i);
  });

  it("states the Linux sandbox fallback in one line", () => {
    const linux = section("Linux");
    expect(linux).toMatch(/user namespaces/i);
    expect(linux).toMatch(
      /without the sandbox only when no working one exists/,
    );
  });

  it("no longer describes the removed v2 install flows", () => {
    for (const gone of [
      "SSH",
      "ssh -L",
      "Zero-install",
      "API key",
      "pairing code",
      "2.1.0",
    ])
      expect(install).not.toContain(gone);
  });

  it("describes the helper as optional and connected without a code", () => {
    expect(install).toMatch(/optional/i);
    expect(install).toContain("/blinkling:install");
    const connection = section("Connect the browser and host");
    expect(connection).toMatch(/Nobody types or sees a code or a port/);
    expect(connection).toContain("Wake Blink");
    expect(connection).toMatch(/same computer/);
  });

  it("names the stable folder the browser loads", () => {
    expect(section("Load the unpacked extension")).toContain(
      "~/Blinkling-extension",
    );
  });
});
