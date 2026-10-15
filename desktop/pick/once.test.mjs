import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOnce, fileStore } from "./once.mjs";

test("a hint shows once, then never again", () => {
  const data = {};
  const once = createOnce({ get: (k) => data[k], set: (k, v) => (data[k] = v) });
  assert.equal(once.take("ctrlHint"), true);
  assert.equal(once.take("ctrlHint"), false);
  assert.equal(once.take("pdfReaderOffer"), true);
});

test("peek does not use the hint up", () => {
  const data = {};
  const once = createOnce({ get: (k) => data[k], set: (k, v) => (data[k] = v) });
  assert.equal(once.seen("ctrlHint"), false);
  once.take("ctrlHint");
  assert.equal(once.seen("ctrlHint"), true);
});

test("the file store persists across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "once-"));
  try {
    const file = join(dir, "pick-once.json");
    assert.equal(createOnce(fileStore(file)).take("ctrlHint"), true);
    assert.equal(createOnce(fileStore(file)).take("ctrlHint"), false);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { ctrlHint: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupt or missing file counts as nothing shown yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "once-"));
  try {
    const file = join(dir, "x.json");
    writeFileSync(file, "{nope");
    assert.equal(createOnce(fileStore(file)).take("a"), true);
    assert.equal(createOnce(fileStore(join(dir, "missing", "y.json"))).take("a"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
