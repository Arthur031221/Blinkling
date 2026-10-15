import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "vitest";

const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file && existsSync(file));
const text = (file) => readFileSync(file, "utf8");
const readable = tracked.filter(
  (file) =>
    !/\.(png|jpe?g|gif|webp|ico|zip|woff2?|ttf|otf|mp4|webm|pdf)$/i.test(
      file,
    ) &&
    file !== "package-lock.json" &&
    file !== "CHANGELOG.md" &&
    file !== "scripts/store-assets.test.mjs" &&
    !file.startsWith("bin/") &&
    !file.startsWith("docs/releases/"),
);

// The v2 screenshots and recordings show the floating chat panel. Blink has no
// panel, so they are deleted, not kept as stale art (spec N3).
const v2 = [
  "assets/screenshots/",
  "assets/store/floating.png",
  "assets/store/guide.png",
  "assets/store/crop.png",
  "assets/store/translation.png",
  "assets/demo.gif",
  "assets/arxiv.gif",
  "assets/crop.gif",
  "assets/guide.gif",
];

describe("v2 screenshots and recordings", () => {
  for (const path of v2)
    it(`${path} is deleted`, () => {
      assert.deepEqual(
        tracked.filter((file) => file.startsWith(path)),
        [],
      );
    });

  for (const path of v2)
    it(`nothing references ${path}`, () => {
      const needle = path.replace(/^assets\//, "");
      const hits = readable.filter((file) => {
        const body = text(file);
        return (
          body.includes(path) ||
          (needle !== path &&
            body.includes(needle) &&
            /screenshots\/|store\/(floating|guide|crop|translation)|\.gif/.test(
              needle,
            ))
        );
      });
      assert.deepEqual(hits, []);
    });
});

describe("real recordings and store images", () => {
  const shipped = JSON.parse(text("assets/recordings.json"));

  it("lists only files that exist, made from the desktop app", () => {
    assert.ok(shipped.recordings.length > 0);
    for (const item of [...shipped.recordings, ...(shipped.stills ?? [])])
      assert.ok(tracked.includes(item.asset), item.asset);
    assert.deepEqual(shipped.recordings.map((item) => item.asset).sort(), [
      "assets/ask.gif",
      "assets/pick.gif",
    ]);
  });

  it("ships the store images docs/STORE.md describes", () => {
    const store = text("docs/STORE.md");
    for (const name of ["pick", "answer", "ask", "area"]) {
      assert.ok(tracked.includes(`assets/store/${name}.png`), name);
      assert.ok(store.includes(`\`${name}\``), name);
    }
    assert.ok(tracked.includes("assets/store/promo.png"));
  });

  it("does not claim the previous images are shipped", () => {
    assert.doesNotMatch(text("docs/STORE.md"), /previous floating chat/i);
  });
});

describe("release checks", () => {
  it("do not require the deleted v2 files", () => {
    for (const file of [
      ".github/workflows/check-release.py",
      "scripts/package-stores.py",
    ]) {
      const body = text(file);
      assert.doesNotMatch(body, /demo\.gif|arxiv\.gif|floating/, file);
    }
  });
});
