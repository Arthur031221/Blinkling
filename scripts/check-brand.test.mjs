import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFileInfo } from "prettier";
import { describe, expect, it } from "vitest";
import {
  checkReadmeHeader,
  findSecondDrawings,
  missingModules,
} from "./check-brand.mjs";

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

describe("faces other than the master", () => {
  const page = (css) =>
    `<!doctype html><style>${css}</style><h1>Blinkling</h1>`;

  it("accepts a page that loads only the interface face", () => {
    expect(
      findSecondDrawings({
        "assets/social-card.html": page(
          '@font-face { font-family: Inter; src: url("../public/assets/Inter.ttf"); } h1 { font-family: Inter, Arial, sans-serif }',
        ),
        "site/install/install.css":
          '@font-face{font-family:"Inter";src:url(Inter.ttf)}',
      }),
    ).toEqual([]);
  });

  it.each([
    [
      "an @font-face for a display face",
      "assets/social-card.html",
      page(
        '@font-face { font-family: Fraunces; src: url("../public/assets/Fraunces.ttf"); }',
      ),
    ],
    [
      "a quoted display family in a stylesheet",
      "demo/demo.css",
      '@font-face{font-family:"DynaPuff";src:url(d.ttf)}',
    ],
    [
      "the master face loaded to draw the name",
      "assets/store/promo.html",
      page("@font-face { font-family: DynaPuff; src: url(DynaPuff.ttf) }"),
    ],
    [
      "a web font link",
      "site/index.html",
      '<link href="https://fonts.googleapis.com/css2?family=Fraunces" rel="stylesheet">',
    ],
    [
      "a CSS font import",
      "site/a.css",
      '@import url("https://fonts.gstatic.com/x.css");',
    ],
    [
      "a face loaded from script",
      "demo/demo.js",
      'new FontFace("Fraunces", "url(f.woff2)").load();',
    ],
    [
      "a heading set in a display face without any @font-face",
      "demo/demo.css",
      "h1 { font-family: Fraunces, Georgia, serif }",
    ],
  ])("rejects %s", (_label, file, text) => {
    const problems = findSecondDrawings({ [file]: text });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^${file}: .*font`));
  });

  it("names every face on the page, once each", () => {
    const [problem] = findSecondDrawings({
      "assets/social-card.html": page(
        "@font-face{font-family:Fraunces;src:url(a)} @font-face{font-family:Fraunces;src:url(b)} @font-face{font-family:Lobster;src:url(c)}",
      ),
    });
    expect(problem).toContain("Fraunces, Lobster");
  });

  it("leaves the kit's own files alone", () => {
    expect(
      findSecondDrawings({
        "assets/brand/wordmark.mjs": "@font-face { font-family: DynaPuff }",
      }),
    ).toEqual([]);
  });
});

describe("the brand folder and prettier", () => {
  it("is ignored, so the wordmark files stay byte-identical to the kit", async () => {
    for (const file of [
      "assets/brand/wordmark-parts.json",
      "assets/brand/wordmark-light.svg",
    ]) {
      const info = await getFileInfo(file, { ignorePath: ".prettierignore" });
      expect(info.ignored, file).toBe(true);
    }
  });

  it("does not ignore the rest of assets", async () => {
    const info = await getFileInfo("assets/social-card.html", {
      ignorePath: ".prettierignore",
    });
    expect(info.ignored).toBe(false);
  });

  it("makes `prettier --check .` clean on the master files", () => {
    const out = execFileSync(
      process.execPath,
      [
        "node_modules/prettier/bin/prettier.cjs",
        "--list-different",
        "assets/brand",
      ],
      { encoding: "utf8" },
    );
    expect(out).toBe("");
  });
});

describe("a machine without the Python modules", () => {
  /** A real interpreter with nothing installed: a venv without pip. */
  function bareInterpreter() {
    const dir = mkdtempSync(join(tmpdir(), "blinkling-bare-python-"));
    execFileSync("python3", ["-m", "venv", "--without-pip", dir]);
    return { dir, python: join(dir, "bin", "python") };
  }

  it("lists what is missing by pip name, nothing for what is there", () => {
    expect(missingModules("python3", ["json", "no_such_module_xyz"])).toEqual([
      "no_such_module_xyz",
    ]);
    expect(missingModules("python3", ["json", "os"])).toEqual([]);
  });

  it("maps fontTools to the pip name fonttools", () => {
    const { dir, python } = bareInterpreter();
    try {
      expect(missingModules(python)).toEqual([
        "fonttools",
        "uharfbuzz",
        "cairosvg",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes check:brand print one line naming them and exit non-zero", () => {
    const { dir, python } = bareInterpreter();
    try {
      const run = spawnSync(process.execPath, ["scripts/check-brand.mjs"], {
        encoding: "utf8",
        env: { ...process.env, BLINKLING_BRAND_PYTHON: python },
      });
      expect(run.status).toBe(1);
      expect(run.stdout).toBe("");
      const lines = run.stderr.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("fonttools, uharfbuzz, cairosvg");
      expect(lines[0]).toContain("pip install fonttools uharfbuzz cairosvg");
      expect(run.stderr).not.toMatch(/Traceback|node:internal/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says so when there is no Python at all", () => {
    const run = spawnSync(process.execPath, ["scripts/check-brand.mjs"], {
      encoding: "utf8",
      env: { ...process.env, BLINKLING_BRAND_PYTHON: "/no/such/python" },
    });
    expect(run.status).toBe(1);
    expect(run.stderr.trim().split("\n")).toHaveLength(1);
    expect(run.stderr).toMatch(/Python 3/);
    expect(run.stderr).toContain("pip install fonttools uharfbuzz cairosvg");
  });
});
