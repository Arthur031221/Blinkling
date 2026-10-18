import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { installCommand } from "./install-command.mjs";

const config = JSON.parse(readFileSync("config/install.json", "utf8"));
const oldName = ["Glimp", "selet"].join("");
const GUIDE = "https://arthur031221.github.io/Blinkling/install/";
const READMES = readdirSync(".").filter((name) => /^README.*\.md$/.test(name));
// The first level-two heading of each README is its install section.
const section = (text) => {
  const start = text.search(/^## /m);
  const end = text.indexOf("\n## ", start + 3);
  return text.slice(start, end);
};
// What a reader must do: a numbered step is one action.
const actions = (text) => text.match(/^\d+\. /gm) ?? [];

describe("the install section of every README", () => {
  it("covers all nine languages", () => {
    expect(READMES).toHaveLength(9);
  });

  for (const name of READMES) {
    const install = section(readFileSync(name, "utf8"));

    describe(name, () => {
      it("asks for at most three actions", () => {
        expect(actions(install).length).toBeGreaterThan(0);
        expect(actions(install).length).toBeLessThanOrEqual(3);
      });

      it("has the one pasted line, the plugin command and the guide link", () => {
        expect(install.split(installCommand(config))).toHaveLength(2);
        expect(install.split("/blinkling:blinkling")).toHaveLength(2);
        expect(install).toContain(GUIDE);
        expect(install).toContain("docs/INSTALL.md");
      });

      it("keeps the removed v2 flow out", () => {
        for (const gone of [
          "2.1.0",
          "SSH",
          "Developer mode",
          "Load unpacked",
          "Try without installing",
          "chrome://extensions",
          "git clone",
          oldName,
        ])
          expect(install).not.toContain(gone);
        expect(install).not.toMatch(/\/plugin (install|marketplace)/);
      });
    });
  }
});

describe("the Windows Node.js requirement", () => {
  it("is a prerequisite before step 1 in every README", () => {
    for (const name of READMES) {
      const text = section(readFileSync(name, "utf8"));
      const first = text.search(/^1\. /m);
      const before = text.slice(0, first);
      expect(before, name).toMatch(/nodejs\.org/);
      expect(before, name).toMatch(/22/);
    }
  });

  it("is what the open command says when the MCP server is down on Windows", () => {
    const command = readFileSync("commands/blinkling.md", "utf8");
    expect(command).toMatch(
      /On Windows[^.]*Node\.js 22 or newer from nodejs\.org/,
    );
    expect(command).toMatch(/On macOS and Linux[^.]*private copy/);
  });

  it("is not described as unproven in the release notes", () => {
    const notes = readFileSync("docs/releases/v3.2.6.md", "utf8");
    expect(notes).not.toMatch(/not yet proven/i);
    expect(notes).toMatch(/Claude Code 2\.1\.302 on Windows/);
  });
});
