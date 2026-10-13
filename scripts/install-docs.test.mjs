import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const install = await readFile("docs/INSTALL.md", "utf8");
const connection = install
  .split("## Connect the browser and host\n")[1]
  ?.split("\n## ")[0];

describe("installation guidance", () => {
  it("provides a checkout build, version check, and session-local plugin launch", () => {
    const source = install
      .split("## Advanced: run a source checkout\n")[1]
      ?.split("\n## ")[0];
    expect(source).toBeDefined();
    const shell = [...source.matchAll(/```sh\n([\s\S]*?)\n```/g)]
      .map((match) => match[1])
      .join("\n");
    for (const command of [
      "npm ci",
      "npm run build:plugin",
      "claude plugin validate .",
      'claude --plugin-dir "$PWD" plugin list',
      "node -p 'require(\"./dist-extension/manifest.json\").version'",
      'claude --plugin-dir "$PWD"',
    ]) {
      expect(shell.split("\n")).toContain(command);
    }
    expect(source).toContain("glimpselet@inline");
    expect(source).toContain("2.0.0");
    expect(source).toContain("/glimpselet:glimpse");
    expect(source).toContain("dist-extension");
    expect(source).toMatch(/session/i);
  });

  it("lets a browser use the paired remote Claude Code login without a local CLI or API key", () => {
    expect(connection).toBeDefined();
    expect(connection).toMatch(/remote Claude Code login.*SSH tunnel/i);
    expect(connection).toMatch(
      /do not need to install Claude Code on the browser computer/i,
    );
    expect(connection).toMatch(/do not need an Anthropic API key/i);
    expect(connection).not.toMatch(
      /When the browser computer has no local CLI, choose direct API mode/i,
    );
  });

  it("offers API mode only when a Claude Code host is unavailable or the user chooses it", () => {
    const apiAdvice = connection
      ?.split("\n\n")
      .find((paragraph) => paragraph.includes("direct API mode"));
    expect(apiAdvice).toMatch(/no usable Claude Code host/i);
    expect(apiAdvice).toMatch(/choose/i);
    expect(apiAdvice).toContain("chrome.storage.session");
  });
});
