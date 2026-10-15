import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { version: releaseVersion } = JSON.parse(
  await readFile(join(process.cwd(), "package.json"), "utf8"),
);

describe("existing terminal conversation setup", () => {
  it("discovers and closes the exact conversation before enabling its channel", async () => {
    const design = await readFile(
      join(process.cwd(), "docs/DESIGN.md"),
      "utf8",
    );
    const setup = design
      .split("## The running Claude Code conversation\n")[1]
      .split("\n## ")[0];
    const channelCommand = setup.indexOf(
      'claude --resume "blinkling-reading" --dangerously-load-development-channels',
    );
    expect(channelCommand).toBeGreaterThan(0);
    const discovery = setup.slice(0, channelCommand);

    expect(discovery).toContain("/status");
    expect(discovery).toMatch(/Session ID.*UUID/s);
    expect(discovery).toContain("/exit");
    expect(discovery).toContain("/rename blinkling-reading");
    expect(setup).toContain(
      'claude --resume "blinkling-reading" --dangerously-load-development-channels plugin:blinkling@blinkling',
    );
    expect(setup).toMatch(/same project directory/);
    expect(setup).toMatch(/Do not keep two interactive terminals/);
    expect(discovery).toContain("`/stop`");
    expect(discovery).not.toContain("claude stop SESSION_ID");
    expect(setup).toContain("https://code.claude.com/docs/en/sessions");
    expect(setup).toContain("https://code.claude.com/docs/en/commands");
  });
});

const install = await readFile("docs/INSTALL.md", "utf8");

describe("installation guidance", () => {
  it("provides a checkout build, version check, and session-local plugin launch", () => {
    const source = install
      .split("## Run a source checkout\n")[1]
      ?.split("\n## ")[0];
    expect(source).toBeDefined();
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
    const linux = install.split("## Linux\n")[1]?.split("\n## ")[0];
    expect(linux).toMatch(/user namespaces/i);
    expect(linux).toMatch(
      /without the sandbox only when no working one exists/,
    );
  });

  it("no longer describes the removed v2 install flows", () => {
    for (const gone of [
      "SSH",
      "ssh -L",
      "Developer mode",
      "Load unpacked",
      "Zero-install",
      "API key",
      "pairing code",
      "2.1.0",
    ])
      expect(install).not.toContain(gone);
  });
});
