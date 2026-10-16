import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const READMES = readdirSync(".").filter((name) => /^README.*\.md$/.test(name));
const version = (name) => name.match(/^v(\d+)\.(\d+)\.(\d+)\.md$/)?.slice(1);
const newest = readdirSync("docs/releases")
  .filter(version)
  .sort((a, b) => {
    const [x, y] = [version(a), version(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  })
  .at(-1);

describe("the release notes link of every README", () => {
  it("covers all nine languages", () => {
    expect(READMES).toHaveLength(9);
  });

  for (const name of READMES)
    it(`${name} points to the newest release notes`, () => {
      const links = [
        ...readFileSync(name, "utf8").matchAll(
          /\]\((docs\/releases\/v[\d.]+\.md)\)/g,
        ),
      ].map((m) => m[1]);
      expect(links).toEqual([`docs/releases/${newest}`]);
    });

  it("the newest release notes belong to the version being shipped", () => {
    const { version: shipped } = JSON.parse(
      readFileSync("package.json", "utf8"),
    );
    expect(newest).toBe(`v${shipped}.md`);
  });
});
