import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflows = join(process.cwd(), ".github/workflows");
const read = (name) => readFileSync(join(workflows, name), "utf8");
const names = readdirSync(workflows).filter((f) => f.endsWith(".yml"));

describe("Remote Control stays out of automated runs", () => {
  it.each(names)(
    "%s turns the Remote Control request off for every job",
    (name) => {
      // A top-level env block applies to every job in the file.
      expect(read(name)).toMatch(
        /^env:\n(?: {2}.*\n)*? {2}BLINKLING_REMOTE: "0"$/m,
      );
    },
  );

  it("no workflow switches it back on", () => {
    for (const name of names)
      expect(read(name)).not.toMatch(/BLINKLING_REMOTE:\s*"?(1|test)"?/);
  });
});

describe("the release workflow", () => {
  const release = read("release.yml");

  it("can be dry-run and only publishes when it is not", () => {
    expect(release).toMatch(/dry_run:/);
    expect(release).toMatch(
      /publish:\n(?: {4}.*\n)*? {4}if: \$\{\{ !inputs\.dry_run \}\}/,
    );
  });

  it("builds and installs on Ubuntu 24.04, both Macs and Windows", () => {
    for (const runner of [
      "ubuntu-24.04",
      "macos-14",
      "macos-15-intel",
      "windows-latest",
    ])
      expect(release).toContain(runner);
    expect(release).toMatch(/install-smoke\.mjs/g);
    expect(release.match(/install-smoke\.mjs/g).length).toBe(2);
  });

  it("publishes the four desktop assets, the checksums and the extension zips", () => {
    for (const asset of [
      "mac-arm64.zip",
      "mac-x64.zip",
      "win-x64.exe",
      "linux-x64.AppImage",
      "SHA256SUMS",
      "blinkling-extension.zip",
    ])
      expect(release).toContain(asset);
  });

  it("pins the manifest before tagging so the tag carries it", () => {
    const pin = release.indexOf("Commit the pinned manifest");
    const upload = release.indexOf("target_commitish: sha");
    expect(pin).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(pin);
  });

  it("rebuilds bin/blinkling.cjs after the pin and commits it with the manifest", () => {
    const step = release.slice(release.indexOf("Commit the pinned manifest"));
    const copy = step.indexOf(
      "cp release/desktop-assets/manifest.json plugin/desktop/manifest.json",
    );
    const build = step.indexOf("npm run build:plugin");
    const add = step.indexOf("git add plugin/desktop/manifest.json bin");
    const commit = step.indexOf("git commit");
    expect(copy).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(copy);
    expect(add).toBeGreaterThan(build);
    expect(commit).toBeGreaterThan(add);
  });

  it("checks the bundle against the manifest in the release check and in the dry run", () => {
    expect(read("check-release.py")).toContain(
      "desktop/distribution/bundle-manifest.mjs",
    );
    const dry = release.slice(
      release.indexOf("Dry-run the pin"),
      release.indexOf("publish:"),
    );
    expect(dry).toContain("npm run build:plugin");
    expect(dry).toContain("--resolve linux/x64");
  });

  it("takes the release notes from docs/releases", () => {
    expect(release).toContain("docs/releases/${tag}.md");
  });
});
