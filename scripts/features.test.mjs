import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// docs/FEATURES.md is the one table of every feature. This test keeps it
// honest: every main and secondary entry point must exist in the code, and
// everything a removed row names (and everything N3 removed) must be gone.

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
// bin/ is build output the release rebuilds. The CHANGELOG is history, and the
// table names removed symbols on purpose.
const scanned = tracked.filter(
  (file) =>
    existsSync(file) &&
    file !== "CHANGELOG.md" &&
    file !== "docs/FEATURES.md" &&
    file !== "scripts/features.test.mjs" &&
    !file.startsWith("bin/") &&
    !/\.(png|jpe?g|gif|webp|ico|icns|pdf|zip|ttf|woff2?|bcmap|mp4|webm)$/i.test(
      file,
    ),
);
const text = new Map(scanned.map((file) => [file, readFileSync(file, "utf8")]));
const where = (pattern) =>
  [...text]
    .filter(([, content]) => pattern.test(content))
    .map(([file]) => file);

const removed = {
  "the Document Picture-in-Picture chat": /documentPictureInPicture/,
  "per-page suggested questions (parseSuggestions)": /parseSuggestions/,
  "per-page suggested questions (loadPageAnalysis)": /loadPageAnalysis/,
  "the select-to-ask popover": /selectionPopover|SelectionPopover/,
  "the SSH tunnel": /ssh -L/,
  "pairing-code screens": /pairing code|pair code|pairingCode|pairing-code/i,
  "API key mode":
    /apiKey|apiMode|api_key|x-api-key|Anthropic API key|\bAPI keys?\b/,
  "the zero-install browser window": /launch-browser/,
  "the zero-install welcome (English)": /Try without installing/,
  "the zero-install welcome (Chinese)": /不安裝/,
  "the passive summary card": /passive summary/i,
};
for (const [name, pattern] of Object.entries(removed))
  test(`${name} is gone from every tracked file but the CHANGELOG`, () => {
    assert.deepEqual(where(pattern), []);
  });

const table = existsSync("docs/FEATURES.md")
  ? readFileSync("docs/FEATURES.md", "utf8")
      .split("\n")
      .filter((line) => /^\|/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      .filter(
        (cells) =>
          cells.length >= 4 && !/^-+$/.test(cells[0]) && cells[1] !== "Tier",
      )
  : [];

test("docs/FEATURES.md is one table with tier, entry point and reason", () => {
  assert.ok(table.length >= 10, "the table lists every feature");
  for (const [feature, tier, entry, reason] of table) {
    assert.ok(feature && reason, `${feature}: name and a one-line reason`);
    assert.ok(
      ["main", "secondary", "removed"].includes(tier),
      `${feature}: tier ${tier}`,
    );
    assert.ok(entry, `${feature}: entry point`);
    assert.ok(
      !reason.includes("\n") && reason.length <= 160,
      `${feature}: one line`,
    );
  }
});

const tokens = (cell) =>
  [...cell.matchAll(/`([a-z]+):([^`]+)`/g)].map((m) => [m[1], m[2]]);
// Entry points are written as `kind:value`: file, menu, command, tool, setting
// (a key in a file as path#key), symbol (path#Name) or gone (a removed symbol).
function exists(kind, value) {
  const [path, name] = value.split("#");
  switch (kind) {
    case "file":
      return existsSync(path);
    case "command":
      return existsSync(`commands/${value}.md`);
    case "tool":
      return (
        /\bserver\.tool\(\s*"/.test(text.get("bridge/src/server.ts") ?? "") &&
        new RegExp(`"${value}"`).test(text.get("bridge/src/server.ts") ?? "")
      );
    case "menu":
      return new RegExp(`"${value}"`).test(
        text.get("desktop/menu/index.mjs") ?? "",
      );
    case "setting":
    case "symbol":
      return (
        existsSync(path) &&
        new RegExp(`\\b${name}\\b`).test(readFileSync(path, "utf8"))
      );
    default:
      return false;
  }
}

for (const [feature, tier, entry] of table) {
  if (tier === "removed") {
    test(`removed: ${feature} leaves no symbol behind`, () => {
      const gone = tokens(entry).filter(([kind]) => kind === "gone");
      assert.ok(
        gone.length,
        `${feature}: a removed row names at least one symbol`,
      );
      for (const [, symbol] of gone)
        assert.deepEqual(
          where(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
          [],
          `${feature}: ${symbol}`,
        );
    });
  } else {
    test(`${tier}: ${feature} has a real entry point`, () => {
      const list = tokens(entry);
      assert.ok(
        list.length,
        `${feature}: entry points are written as kind:value`,
      );
      for (const [kind, value] of list)
        assert.ok(
          exists(kind, value),
          `${feature}: ${kind}:${value} does not exist`,
        );
    });
  }
}
