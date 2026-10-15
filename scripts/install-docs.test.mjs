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

  it("upgrades the marketplace and the plugin, then reloads", () => {
    const upgrade = section(`Upgrade to ${releaseVersion}`);
    for (const command of [
      "claude plugin marketplace update blinkling",
      "claude plugin update blinkling@blinkling",
      "claude plugin list",
    ])
      expect(upgrade).toContain(command);
    expect(upgrade).toContain("/reload-plugins");
  });

  it("loads the helper from the stable folder and says it is optional", () => {
    const load = section("Load the browser helper");
    expect(load).toContain("~/Blinkling-extension");
    expect(load).toContain("chrome://extensions");
    expect(install).toMatch(/optional/i);
  });

  it("explains that the helper connects by itself, with no code to type", () => {
    const connect = section("How the helper connects");
    expect(connect).toMatch(/Nobody sees or types a code/);
    expect(connect).toContain("Wake Blink");
    expect(connect).toContain("`127.0.0.1`");
  });
});
