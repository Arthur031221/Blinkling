import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

// Build output and the changelog may name what was removed; nothing else may.
const exempt = (file) =>
  file === "CHANGELOG.md" ||
  file === "docs/FEATURES.md" ||
  file === "scripts/features.test.mjs" ||
  // Tests that prove a removed flow is gone have to name it.
  file === "scripts/install-docs.test.mjs" ||
  file === "scripts/readme-install.test.mjs" ||
  file === "scripts/readme-first-screen.test.mjs" ||
  file === "package-lock.json" ||
  file.startsWith("bin/") ||
  file.startsWith("assets/") ||
  file.startsWith("docs/releases/") ||
  /\.(png|jpe?g|gif|webp|ico|zip|woff2?|ttf|otf|mp4|webm|pdf)$/i.test(file);

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file && !exempt(file) && existsSync(join(root, file)));
const texts = new Map(files.map((file) => [file, read(file)]));

function occurrences(needle) {
  return [...texts]
    .filter(([file, text]) => text.includes(needle) || file.includes(needle))
    .map(([file]) => file);
}

/** Symbols of features that docs/FEATURES.md and spec N3 remove. */
const removed = [
  "documentPictureInPicture",
  "parseSuggestions",
  "loadPageAnalysis",
  "selectionPopover",
  "showSelectionPopover",
  "ssh -L",
  "ssh -N -L",
  "pairHint",
  "askAnthropic",
  "apiAuth",
  "keyMissing",
  "errorApiKeyMissing",
  "launch-browser",
  "Try without installing",
  "不安裝",
  "passive summary",
];

describe("removed features stay removed", () => {
  for (const needle of removed)
    it(`${JSON.stringify(needle)} appears only in CHANGELOG.md`, () => {
      assert.deepEqual(occurrences(needle), []);
    });
});

function table() {
  const rows = [];
  for (const line of read("docs/FEATURES.md").split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.lastIndexOf("|"))
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 4 || /^-+$/.test(cells[0].replace(/:/g, ""))) continue;
    if (cells[0] === "Feature") continue;
    rows.push({
      feature: cells[0],
      tier: cells[1],
      entry: cells[2],
      why: cells[3],
    });
  }
  return rows;
}

const ticks = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** `file`, `file::literal`, `command:name` or `tool:name`. */
function entryExists(entry) {
  if (entry.startsWith("command:"))
    return existsSync(join(root, "commands", `${entry.slice(8)}.md`));
  if (entry.startsWith("tool:"))
    return read("bridge/src/server.ts").includes(`"${entry.slice(5)}"`);
  const [file, literal] = entry.split("::");
  if (!existsSync(join(root, file))) return false;
  return literal === undefined || read(file).includes(literal);
}

describe("docs/FEATURES.md", () => {
  const rows = table();

  it("is one table with a tier, an entry point and a one-line reason per feature", () => {
    assert.ok(rows.length >= 20, `only ${rows.length} rows`);
    for (const row of rows) {
      assert.ok(
        ["main", "secondary", "removed"].includes(row.tier),
        `${row.feature}: tier ${row.tier}`,
      );
      assert.ok(row.entry, `${row.feature}: entry point`);
      assert.ok(row.why && !row.why.includes("\n"), `${row.feature}: reason`);
    }
    assert.equal(new Set(rows.map((row) => row.feature)).size, rows.length);
  });

  it("lists every N1 and N2 feature the spec keeps", () => {
    const kept = rows.filter((row) => row.tier !== "removed").length;
    const gone = rows.filter((row) => row.tier === "removed").length;
    assert.ok(kept >= 12, `${kept} kept rows`);
    assert.ok(gone >= 11, `${gone} removed rows`);
  });

  for (const row of rows.filter((row) => row.tier !== "removed"))
    it(`${row.tier} "${row.feature}" has an entry point that exists`, () => {
      const entries = ticks(row.entry);
      assert.ok(entries.length > 0, "entry point in backticks");
      for (const entry of entries)
        assert.ok(entryExists(entry), `missing entry point ${entry}`);
    });

  for (const row of rows.filter((row) => row.tier === "removed"))
    it(`removed "${row.feature}" leaves no symbol behind`, () => {
      const symbols = ticks(row.entry);
      assert.ok(
        symbols.length > 0,
        "removed row names its symbols in backticks",
      );
      for (const symbol of symbols)
        assert.deepEqual(occurrences(symbol), [], `${symbol} still present`);
    });
});

// The menu rows are checked against the real menu definition and the action
// registry, not only against files that happen to exist.
describe("docs/FEATURES.md menu rows", async () => {
  const { menuActions } = await import("../desktop/menu/index.mjs");
  const { featureActions } = await import("../desktop/capture/integration.mjs");
  const menuRows = table().filter((row) =>
    ticks(row.entry).some((entry) =>
      entry.startsWith("desktop/menu/index.mjs"),
    ),
  );
  const ids = menuRows.map((row) => ticks(row.entry)[0].split("::")[1]);
  const shell = read("desktop/main/shell.mjs");

  it("has one row per menu bubble, in the menu's order", () => {
    assert.deepEqual(
      ids,
      menuActions.map((action) => action.id),
    );
  });

  it("keeps every menu row secondary", () => {
    for (const row of menuRows)
      assert.equal(row.tier, "secondary", row.feature);
  });

  for (const { id } of menuActions)
    it(`menu action "${id}" is registered in the action registry`, () => {
      assert.ok(
        featureActions.has(id) || shell.includes(`registerAction("${id}"`),
        `${id} has no handler`,
      );
    });

  it("claims nothing for settings that the settings action does not do", () => {
    const settings = menuRows.find((row) => row.entry.includes("::settings"));
    assert.ok(settings);
    // The settings action only opens the conversation card; hotkey, pick key,
    // welcome replay and About rows are not built, so no row may promise them.
    assert.doesNotMatch(settings.why, /About|replay|pick key|hotkey/i);
    for (const row of table().filter((row) => row.tier !== "removed"))
      assert.doesNotMatch(
        row.feature,
        /\bAbout\b|welcome replay/i,
        row.feature,
      );
  });
});
