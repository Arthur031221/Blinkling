import { describe, expect, it } from "vitest";
import { checkReadmeHeader, findSecondDrawings } from "./check-brand.mjs";

const picture = `<h1 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>`;

describe("second drawings of the name", () => {
  it("accepts code that uses the component and files that merely say the name", () => {
    expect(
      findSecondDrawings({
        "extension/popup.ts":
          'import { mountWordmark } from "../assets/brand/wordmark.mjs";',
        "site/install/index.html":
          '<img src="wordmark-light.svg" alt="Blinkling">',
        "src/logo.svg": '<svg><path d="M0 0"/></svg>',
        "assets/brand/wordmark-light.svg":
          "<svg><title>Blinkling</title></svg>",
      }),
    ).toEqual([]);
  });

  it("rejects an SVG that spells the name as text", () => {
    const problems = findSecondDrawings({
      "assets/mark.svg":
        '<svg><text x="0" y="20" font-size="20">Blinkling</text></svg>',
    });
    expect(problems).toEqual([
      "assets/mark.svg: an SVG that spells Blinkling as text",
    ]);
  });

  it.each([
    [
      "a CSS sparkle class",
      "extension/a.css",
      ".sparkle-star { animation: twinkle 1s }",
    ],
    ["a sparkle block marker", "src/style.css", "/* sparkle:start */"],
    ["the old component", "src/App.tsx", "return <SparkleName />;"],
    ["a markup class", "bridge/x.html", '<span class="sparkle">ling</span>'],
    ["the old CSS export", "bridge/src/a.ts", "const css = SPARKLE_CSS;"],
  ])("rejects %s", (_label, file, text) => {
    expect(findSecondDrawings({ [file]: text })).toHaveLength(1);
  });

  it("rejects the retired files whatever they contain", () => {
    for (const file of [
      "assets/wordmark-light.svg",
      "scripts/render-wordmark.py",
      "bridge/src/sparkle.ts",
      "scripts/sparkle.test.mjs",
    ]) {
      expect(findSecondDrawings({ [file]: "" })).toEqual([
        `${file}: an old drawing of the name; delete it`,
      ]);
    }
  });

  it("leaves the kit, the history, the brand guide and the built bundle alone", () => {
    expect(
      findSecondDrawings({
        "assets/brand/wordmark.mjs": "/* sparkle:start */",
        "CHANGELOG.md": "sparkle:start",
        "docs/BRAND.md": ".sparkle {",
        "bin/blinkling.cjs": "SparkleName",
      }),
    ).toEqual([]);
  });
});

describe("README headers", () => {
  it("accepts the picture with both kit files", () => {
    expect(checkReadmeHeader("README.md", `${picture}\n\ntext`)).toEqual([]);
  });

  it.each([
    ["the old paths", picture.replaceAll("assets/brand/", "assets/")],
    [
      "a plain image",
      '<h1><img src="assets/brand/wordmark-light.svg" alt="Blinkling"></h1>',
    ],
    ["a heading with the name as text", "# Blinkling"],
    ["a picture lower than the header", `${"line\n".repeat(20)}${picture}`],
  ])("rejects %s", (_label, text) => {
    expect(checkReadmeHeader("README.fr.md", text)).toHaveLength(1);
  });
});
