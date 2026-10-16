import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXT } from "../site/install/strings.mjs";

const flag = JSON.parse(readFileSync("config/flag.json", "utf8"));
const read = (path) => readFileSync(path, "utf8");
// Every spelling of the command in a file, once the markup is out of the way.
const plain = (text) =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const commandsIn = (text) =>
  plain(text).match(/claude\s+--[\w-]*channels[^\s]*\s+[\w:@./-]+/g) ?? [];
const READMES = {
  "README.md": "en",
  "README.zh-TW.md": "zh-TW",
  "README.zh-CN.md": "zh-CN",
  "README.ja.md": "ja",
  "README.ko.md": "ko",
  "README.de.md": "de",
  "README.es.md": "es",
  "README.fr.md": "fr",
  "README.pt-BR.md": "pt-BR",
};
const section = (text) => {
  const start = text.search(/^## /m);
  return text.slice(start, text.indexOf("\n## ", start + 3));
};

describe("the start command", () => {
  it("is the development channel flag, the one this Claude Code accepts for the plugin", () => {
    expect(flag.command).toBe(
      "claude --dangerously-load-development-channels plugin:blinkling@blinkling",
    );
  });

  it("has its one plain line in all nine languages", () => {
    expect(Object.keys(flag.line).sort()).toEqual(
      Object.keys(READMES)
        .map((n) => READMES[n])
        .sort(),
    );
  });
});

describe("every README starts Claude Code with the flag, then runs the plugin command", () => {
  for (const [name, locale] of Object.entries(READMES))
    it(name, () => {
      const install = section(read(name));
      const at = install.indexOf(flag.command);
      expect(at, "the command").toBeGreaterThan(-1);
      expect(install.indexOf("/blinkling:blinkling")).toBeGreaterThan(at);
      expect(install).toContain(flag.line[locale]);
      expect(commandsIn(install).every((c) => c === flag.command)).toBe(true);
    });
});

describe("the install guide on the Pages site", () => {
  const html = read("site/install/index.html");
  it("shows the same command, on every system", () => {
    const panels = html.split(/data-panel="/).slice(1);
    expect(panels).toHaveLength(3);
    for (const panel of panels) {
      expect(plain(panel)).toContain(flag.command);
      expect(commandsIn(panel).every((c) => c === flag.command)).toBe(true);
    }
  });
  it("says the one line in all nine languages", () => {
    for (const [name, locale] of Object.entries(READMES)) {
      expect(TEXT[locale].flagLine, name).toBe(flag.line[locale]);
    }
    expect(html).toContain(`data-i18n="flagLine"`);
  });
});

describe("the other places that tell a person how to start", () => {
  const files = [
    "docs/INSTALL.md",
    "docs/USAGE.md",
    "demo/index.html",
    "install.sh",
    "install.ps1",
    "docs/releases/v3.2.1.md",
  ];
  for (const path of files)
    it(path, () => {
      const text = plain(read(path));
      expect(text).toContain(flag.command);
      expect(text).toContain(flag.line.en.split(". ")[1]);
      expect(commandsIn(text).every((c) => c === flag.command)).toBe(true);
    });

  it("never offers the plain channels flag, which Claude Code refuses for this plugin", () => {
    const all = [
      ...Object.keys(READMES),
      ...files,
      "site/install/index.html",
      "site/install/strings.mjs",
    ];
    for (const path of all)
      expect(read(path), path).not.toMatch(/claude\s+--channels/);
  });
});
