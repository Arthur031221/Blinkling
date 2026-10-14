import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { selectBuild, verifyArchive } from "./launcher.mjs";
test("launcher refuses replaced archives and release origins", () => {
  const bytes = Buffer.from("archive");
  const b = {
    platform: "linux",
    arch: "x64",
    url: "https://github.com/Arthur031221/Glimpselet/releases/download/v3.0.0/linux.zip",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  assert.equal(selectBuild({ builds: [b] }, "linux", "x64"), b);
  verifyArchive(bytes, b);
  assert.throws(() => verifyArchive(Buffer.from("tampered"), b), /checksum/);
  assert.throws(
    () =>
      selectBuild(
        { builds: [{ ...b, url: "https://example.com/app" }] },
        "linux",
        "x64",
      ),
    /origin/,
  );
  assert.throws(
    () => selectBuild({ builds: [b] }, "win32", "arm64"),
    /Unsupported/,
  );
});
