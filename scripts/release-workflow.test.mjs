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
        /^env:\n(?:  .*\n)*?  BLINKLING_REMOTE: "0"$/m,
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
      /publish:\n(?:    .*\n)*?    if: \$\{\{ !inputs\.dry_run \}\}/,
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

  it("takes the release notes from docs/releases", () => {
    expect(release).toContain("docs/releases/${tag}.md");
  });
});
