// The kit comparison runs kit.py, which needs fonttools, uharfbuzz and
// cairosvg (pip install fonttools uharfbuzz cairosvg), so it runs under
// `npm run check:brand` and in CI rather than in the plain unit run.
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkKit } from "./check-brand.mjs";

function copyOfKit() {
  const root = mkdtempSync(join(tmpdir(), "blinkling-kit-test-"));
  cpSync("assets/brand", join(root, "assets/brand"), { recursive: true });
  return root;
}

test("the committed kit is what kit.py makes", () => {
  assert.deepEqual(checkKit({ root: "." }), []);
});

test("an edited SVG, parts file or missing file is reported", () => {
  const root = copyOfKit();
  try {
    const svg = join(root, "assets/brand/wordmark-light.svg");
    writeFileSync(svg, readFileSync(svg, "utf8").replace("#0c0e0d", "#000000"));
    const parts = join(root, "assets/brand/wordmark-parts.json");
    writeFileSync(parts, readFileSync(parts, "utf8").replace("5.5", "6.5"));
    rmSync(join(root, "assets/brand/wordmark-dark-static.svg"));
    const problems = checkKit({ root });
    assert.ok(
      problems.some((p) =>
        p.startsWith("assets/brand/wordmark-light.svg: differs"),
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.startsWith("assets/brand/wordmark-parts.json: differs"),
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.includes(
          "wordmark-dark-static.svg: kit.py makes it but it is missing",
        ),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an edited PNG is reported and a file kit.py does not make is too", () => {
  const root = copyOfKit();
  try {
    const png = join(root, "assets/brand/wordmark-dark.png");
    const bytes = readFileSync(png);
    writeFileSync(
      png,
      readFileSync(join(root, "assets/brand/wordmark-light.png")),
    );
    writeFileSync(join(root, "assets/brand/wordmark-light-static.png"), bytes);
    const problems = checkKit({ root });
    assert.ok(
      problems.some((p) =>
        p.startsWith("assets/brand/wordmark-dark.png: differs"),
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.includes("wordmark-light-static.png: kit.py does not make"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing toolchain is explained, not a stack trace", () => {
  const problems = checkKit({
    root: ".",
    python: "python3-that-does-not-exist",
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /pip install fonttools uharfbuzz cairosvg/);
});
