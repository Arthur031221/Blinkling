import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function readConnectionGuide() {
  const install = await readFile(
    join(process.cwd(), "docs/INSTALL.md"),
    "utf8",
  );
  return install
    .split("## Connect the browser and host\n")[1]
    .split("\n## ")[0];
}

describe("installation connection guidance", () => {
  it("keeps an SSH-paired remote Claude Code login usable without a local CLI or API key", async () => {
    const guide = await readConnectionGuide();
    const remoteLogin = guide
      .split("\n\n")
      .find((paragraph) => /remote Claude Code login/i.test(paragraph));

    expect(remoteLogin).toBeDefined();
    expect(remoteLogin).toMatch(/SSH/i);
    expect(remoteLogin).toMatch(/no local Claude Code installation/i);
    expect(remoteLogin).toMatch(/browser computer/i);
    expect(remoteLogin).toMatch(/no API key/i);
    expect(guide).toContain("ssh -N -L 37115:127.0.0.1:37115 user@remote-host");
  });

  it("offers direct API mode for no usable host or an explicit choice", async () => {
    const guide = await readConnectionGuide();
    const directApi = guide
      .split("\n\n")
      .find((paragraph) => /direct API mode/i.test(paragraph));

    expect(directApi).toMatch(/no usable Claude Code host/i);
    expect(directApi).toMatch(/choose it explicitly/i);
    expect(guide).not.toContain(
      "When the browser computer has no local CLI, choose direct API mode",
    );
  });
});

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
      'claude --resume "glimpselet-reading" --dangerously-load-development-channels',
    );
    expect(channelCommand).toBeGreaterThan(0);
    const discovery = setup.slice(0, channelCommand);

    expect(discovery).toContain("/status");
    expect(discovery).toMatch(/Session ID.*UUID/s);
    expect(discovery).toContain("/exit");
    expect(discovery).toContain("/rename glimpselet-reading");
    expect(setup).toContain(
      'claude --resume "glimpselet-reading" --dangerously-load-development-channels plugin:glimpselet@glimpselet',
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
      "node -p \"require('./dist-extension/manifest.json').version\"",
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
