import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const { version: releaseVersion } = JSON.parse(
  await readFile("package.json", "utf8"),
);
const install = await readFile("docs/INSTALL.md", "utf8");
const section = (title) =>
  install.split(`## ${title}\n`)[1]?.split("\n## ")[0] ?? "";

describe("installation guidance", () => {
  it("provides a checkout build, version check, and session-local plugin launch", () => {
    const source = section("Advanced: run a source checkout");
    expect(source).not.toBe("");
    const shell = [...source.matchAll(/```sh\n([\s\S]*?)\n```/g)]
      .map((match) => match[1])
      .join("\n");
    for (const command of [
      "npm ci",
      "npm run build:plugin",
      "claude plugin validate .",
      'claude --plugin-dir "$PWD" plugin list',
      "node -p \"require('./dist-extension/manifest.json').version\"",
      'claude --plugin-dir "$PWD"',
    ]) {
      expect(shell.split("\n")).toContain(command);
    }
    expect(source).toContain("blinkling@inline");
    expect(source).toContain(releaseVersion);
    expect(source).toContain("/blinkling:blinkling");
    expect(source).toContain("dist-extension");
    expect(source).toMatch(/session/i);
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
