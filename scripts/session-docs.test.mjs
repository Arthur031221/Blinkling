// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const design = await readFile(
  new URL("../docs/DESIGN.md", import.meta.url),
  "utf8",
);
const channelSetup = design
  .split("## The running Claude Code conversation")[1]
  ?.split("## Parallel continuation and alternatives")[0];

describe("existing terminal conversation setup", () => {
  it("identifies the existing conversation before the channel resume command", () => {
    expect(channelSetup).toBeDefined();
    expect(channelSetup).toContain("https://code.claude.com/docs/en/sessions");
    const rename = channelSetup.indexOf("/rename blinkling-reading");
    const resume = channelSetup.indexOf(
      'claude --resume "blinkling-reading" --dangerously-load-development-channels plugin:blinkling@blinkling',
    );
    expect(rename).toBeGreaterThanOrEqual(0);
    expect(resume).toBeGreaterThan(rename);
    expect(channelSetup).not.toContain("--resume SESSION_ID");
  });

  it("ends the old terminal owner before resuming on the Claude Code host", () => {
    const exit = channelSetup.indexOf("/exit");
    const resume = channelSetup.indexOf("claude --resume");
    expect(exit).toBeGreaterThanOrEqual(0);
    expect(resume).toBeGreaterThan(exit);
    expect(channelSetup).toMatch(/same (?:computer|host)/i);
    expect(channelSetup).toMatch(/remote host/i);
    expect(channelSetup).toMatch(/two .*?(?:owners|terminals|processes)/i);
    expect(channelSetup).not.toContain("--fork-session");
  });

  it("shows how to retrieve the exact UUID without reading session files", () => {
    const status = channelSetup.indexOf("/status");
    const exit = channelSetup.indexOf("/exit");
    expect(status).toBeGreaterThanOrEqual(0);
    expect(exit).toBeGreaterThan(status);
    expect(channelSetup).toContain("Session ID");
    expect(channelSetup).toMatch(/Esc/);
    expect(channelSetup).toMatch(/UUID.*?quoted name|quoted name.*?UUID/);
  });

  it("offers a documented picker and content preview when the terminal has closed", () => {
    expect(channelSetup).toContain("`claude --resume`");
    expect(channelSetup).toMatch(/Space.*?preview/i);
    expect(channelSetup).toMatch(/(?:Ctrl\+A|Control\+A)/);
    expect(channelSetup).toMatch(/unique name/i);
  });

  it("keeps source-loaded plugins available when the conversation restarts", () => {
    expect(channelSetup).toContain(
      'claude --plugin-dir "/absolute/path/to/Blinkling" --resume "blinkling-reading" --dangerously-load-development-channels server:plugin:blinkling:blinklinglet',
    );
    expect(channelSetup).toMatch(/original conversation.*?project directory/i);
    expect(channelSetup).toMatch(/(?:replace|substitute).*?absolute path/i);
  });

  it("checks the real server and manual approvals before claiming live delivery", () => {
    expect(channelSetup).toContain("`/mcp`");
    expect(channelSetup).toContain("`plugin:blinkling:blinklinglet`");
    expect(channelSetup).toMatch(/connected/i);
    expect(channelSetup).toMatch(
      /(?:MCP|server).*?consent|consent.*?(?:MCP|server)/i,
    );
    expect(channelSetup).toMatch(
      /(?:probe|nonce|readiness).*?(?:approve|permission)|(?:approve|permission).*?(?:probe|nonce|readiness)/i,
    );
    expect(design).not.toContain("Its MCP tools and channel still load.");
  });
});
