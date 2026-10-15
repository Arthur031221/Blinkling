import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const json = (path) =>
  JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));

describe("one version for everything a user installs", () => {
  const version = json("desktop/package.json").version;

  it("is a plain release version", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is reported by the plugin, the root package and the desktop package", () => {
    expect(json(".claude-plugin/plugin.json").version).toBe(version);
    expect(json("package.json").version).toBe(version);
  });

  it("is reported by the extension, the bridge package and the MCP server", () => {
    expect(json("extension/manifest.json").version).toBe(version);
    expect(json("bridge/package.json").version).toBe(version);
    expect(
      readFileSync(join(process.cwd(), "bridge/src/server.ts"), "utf8"),
    ).toContain(`version: "${version}"`);
  });

  it("is what the privacy page and the committed bundle state", () => {
    expect(
      readFileSync(join(process.cwd(), "public/privacy.html"), "utf8"),
    ).toContain(`Version ${version}`);
    expect(json("bin/extension/manifest.json").version).toBe(version);
  });

  it("is what the release builder stamps on the app", () => {
    const build = readFileSync(
      join(process.cwd(), "desktop/distribution/build.mjs"),
      "utf8",
    );
    expect(build).not.toMatch(/appVersion:\s*"/);
    expect(build).toMatch(/appVersion:\s*version/);
  });

  it("is what the pinned desktop manifest pins, once it is pinned", () => {
    const manifest = json("plugin/desktop/manifest.json");
    if (manifest.builds?.length) expect(manifest.version).toBe(version);
  });

  it("is what the lock file records for the root package", () => {
    const lock = json("package-lock.json");
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
  });
});
