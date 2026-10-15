#!/usr/bin/env node
// Fails when the old product name is visible anywhere outside the places that
// are allowed to keep it. The old name is built from parts so that this file
// does not trip itself.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OLD = ["glimp", "selet"].join("");
const OLD_NAME = new RegExp(OLD, "i");

/** Files that may name the old product: the history, and the one module that
 * reads the old switches and moves the old folders. */
export const ALLOWED_FILES = new Set([
  "CHANGELOG.md",
  "plugin/desktop/legacy.mjs",
  "plugin/desktop/legacy.d.mts",
  "plugin/desktop/legacy.test.mjs",
  // GitHub redirects the old repository address, so the launcher accepts it
  // as a release origin and the tests prove it.
  "plugin/desktop/launcher.mjs",
  "plugin/desktop/launcher.test.mjs",
  "plugin/desktop/install.test.mjs",
  // The standalone bundles inline legacy.mjs; it is code, not text a user sees.
  "bin/blinkling.cjs",
  "scripts/check-name.mjs",
  "scripts/check-name.test.mjs",
]);
/** Until the repository is renamed at ship time, its address keeps the old name. */
const REPOSITORY = new RegExp(
  `(?:Arthur031221|arthur031221\\.github\\.io)/${OLD}(?![\\w-])`,
  "gi",
);
const README = /^README(\.[A-Za-z-]+)?\.md$/;
const FORMERLY = new RegExp(`^Formerly ${OLD}\\b`, "i");

/** Lines (1-based) of one file that show the old name. */
export function violations(path, text) {
  const found = [];
  if (OLD_NAME.test(path)) found.push({ path, line: 0, text: "(file name)" });
  if (ALLOWED_FILES.has(path)) return found;
  let formerly = 0;
  text.split("\n").forEach((line, index) => {
    if (README.test(path) && FORMERLY.test(line) && ++formerly === 1) return;
    if (OLD_NAME.test(line.replace(REPOSITORY, "")))
      found.push({ path, line: index + 1, text: line.trim().slice(0, 120) });
  });
  return found;
}

export function scan(files) {
  return files.flatMap(({ path, text }) => violations(path, text));
}

export function trackedFiles(root = process.cwd()) {
  const paths = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString()
    .split("\0")
    .filter(Boolean);
  return paths.map((path) => {
    let buffer;
    try {
      buffer = readFileSync(`${root}/${path}`);
    } catch {
      return { path, text: "" };
    }
    return { path, text: buffer.includes(0) ? "" : buffer.toString("utf8") };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const found = scan(trackedFiles());
  if (found.length) {
    for (const v of found)
      process.stderr.write(`${v.path}:${v.line}: ${v.text}\n`);
    process.stderr.write(
      `\n${found.length} place(s) still show the old product name. Use the new name; ` +
        "only CHANGELOG.md and one README line may keep the old one.\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    "Name guard: the old product name appears nowhere it shouldn't.\n",
  );
}
