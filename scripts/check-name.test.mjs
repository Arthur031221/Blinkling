import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan, violations } from "./check-name.mjs";

const OLD = ["Glimp", "selet"].join("");
const lower = OLD.toLowerCase();

test("a visible old name is found in any casing, with its line", () => {
  const found = violations(
    "src/locales/en.json",
    `{\n  "title": "Hello ${OLD}",\n  "id": "${lower}-x",\n  "env": "${OLD.toUpperCase()}_REMOTE"\n}`,
  );
  assert.deepEqual(
    found.map((v) => v.line),
    [2, 3, 4],
  );
});

test("the new name and the mascot pass", () => {
  assert.deepEqual(violations("README.md", "Blinkling and Blink\n"), []);
});

test("the changelog and the legacy module may keep the old name", () => {
  assert.deepEqual(violations("CHANGELOG.md", `Formerly ${OLD}`), []);
  assert.deepEqual(violations("plugin/desktop/legacy.mjs", `"${OLD}"`), []);
});

test("one README line 'Formerly ...' is allowed, a second is not", () => {
  const line = `Formerly ${OLD}. Switch with /plugin uninstall ${lower}@${lower}`;
  assert.deepEqual(violations("README.md", `# Blinkling\n${line}\n`), []);
  assert.deepEqual(violations("README.ja.md", `${line}\n`), []);
  assert.equal(violations("README.md", `${line}\n${line}\n`).length, 1);
  assert.equal(violations("docs/INSTALL.md", `${line}\n`).length, 1);
  assert.equal(violations("README.md", `See ${OLD} for details\n`).length, 1);
});

test("the repository address keeps its name until it is renamed", () => {
  const url = `https://github.com/Arthur031221/${OLD}/releases`;
  assert.deepEqual(violations("README.md", url), []);
  assert.deepEqual(
    violations(
      "README.md",
      `https://arthur031221.github.io/${OLD}/privacy.html`,
    ),
    [],
  );
  assert.equal(violations("README.md", `${url} and ${OLD}`).length, 1);
  // Only the owner's repository is allowed, not any path that ends in the name.
  assert.equal(violations("README.md", `https://example.com/${OLD}`).length, 1);
  assert.equal(
    violations("README.md", `@arthur031221/${lower}-bridge`).length,
    1,
  );
});

test("a file name that shows the old name is a violation", () => {
  const found = scan([{ path: `assets/${lower}-logo.svg`, text: "" }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, "(file name)");
});

test("the command line exits 1 on a violation and 0 when clean", () => {
  const script = fileURLToPath(new URL("./check-name.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "name-guard-"));
  try {
    const run = () =>
      execFileSync("node", [script], { cwd: dir, stdio: "pipe" }).toString();
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "a.md"), "Blinkling\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    assert.match(run(), /Name guard/);
    writeFileSync(join(dir, "b.md"), `${OLD} is shown\n`);
    execFileSync("git", ["add", "."], { cwd: dir });
    assert.throws(run, (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), /b\.md:1/);
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository itself is clean", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const output = execFileSync("node", [join(root, "scripts/check-name.mjs")], {
    cwd: root,
  }).toString();
  assert.match(output, /Name guard/);
});
