import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { badgeFor } from "./badge.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const shipped = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(mjs|css|html)$/.test(e.name))
    .filter((e) => !e.name.endsWith(".test.mjs"))
    .map((e) => join(dir, e.name));

/** N3.1: Shift is not a capture key. The pick layer and its strings carry no Shift capture code, badge or wording. The only Shift left is
 * Shift+Enter in the composer text box (a new line) and the scancodes the key gate
 * is tested with as "some other key". */
test("no Shift capture code, badge or strings are left in pick", () => {
  const allowed = [
    /^\s*shift(Left|Right): \d+,$/, // scancodes for the key gate's "other key"
    /shiftKey/, // Shift+Enter in the composer's text box
    /Shift is not a mode/, // the doc comment saying so
    /submit\(\{ shift = false \}/, // the composer's own Shift+Enter send
    /^\s*if \(shift\) \{$/,
  ];
  const found = [];
  for (const file of shipped(here))
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/shift/i.test(line) && !allowed.some((a) => a.test(line)))
          found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  assert.deepEqual(found, []);
});

test("the badge never offers a Shift mode", () => {
  for (const raised of [true, false])
    for (const dragging of [true, false])
      assert.doesNotMatch(String(badgeFor({ raised, dragging })), /shift/i);
});
