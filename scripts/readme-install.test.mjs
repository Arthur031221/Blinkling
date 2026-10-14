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
