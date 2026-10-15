#!/usr/bin/env node
// Keeps the name drawn one way. It fails when
//  - a file in assets/brand differs from what kit.py makes of wordmark-parts.json,
//  - a second drawing of the name exists: an SVG that spells it as text, or a
//    CSS sparkle class, or one of the old wordmark files or generators,
//  - a README header does not use the wordmark files.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NAME = "Blinkling";
const KIT = "assets/brand";
const HEADER_LINES = 12;

/** The files kit.py writes. Anything else in the folder is source, the font or
 * the component. */
const KIT_FILE =
  /^wordmark-(?:light|dark)(?:-static)?\.(?:svg|png)$|^wordmark-parts\.json$/;

/** Old drawings and the scripts that made them. */
const RETIRED = [
  /^assets\/wordmark-[^/]*\.svg$/,
  /^scripts\/render-wordmark\.py$/,
  /^bridge\/src\/sparkle\.ts$/,
  /^scripts\/sparkle\.test\.mjs$/,
];

/** What a CSS or script copy of the sparkle name leaves behind. */
const SPARKLE =
  /SparkleName|SPARKLE_CSS|sparkle:(?:start|end)|[.\s"'`]sparkle[-_a-z0-9]*\s*[{,]|class=["'][^"']*\bsparkle\b/i;
const TEXT_FILE = /\.(?:css|html|svg|mjs|cjs|js|ts|tsx|md)$/;
const SVG_TEXT_NAME = new RegExp(`<text\\b[^>]*>[^<]*${NAME}`, "i");

const inside = (file) => file === KIT || file.startsWith(`${KIT}/`);
const skipped = (file) =>
  file.startsWith("bin/") ||
  file === "scripts/check-brand.mjs" ||
  file === "scripts/check-brand.test.mjs" ||
  file === "CHANGELOG.md" ||
  file.startsWith("docs/BRAND.md");

/** A second drawing of the name among `files` ({ path: text }). Returns
 * human-readable problems. */
export function findSecondDrawings(files) {
  const problems = [];
  for (const [file, text] of Object.entries(files)) {
    if (RETIRED.some((pattern) => pattern.test(file))) {
      problems.push(`${file}: an old drawing of the name; delete it`);
      continue;
    }
    if (inside(file) || skipped(file) || !TEXT_FILE.test(file)) continue;
    if (file.endsWith(".svg") && SVG_TEXT_NAME.test(text)) {
      problems.push(`${file}: an SVG that spells ${NAME} as text`);
    }
    if (!file.endsWith(".md") && SPARKLE.test(text)) {
      problems.push(`${file}: a sparkle class or copy of the sparkle name`);
    }
  }
  return problems;
}

/** The README header must draw the name through the kit's two files. */
export function checkReadmeHeader(file, text) {
  const top = text.split("\n").slice(0, HEADER_LINES).join("\n");
  const picture = top.match(/<picture>[\s\S]*?<\/picture>/)?.[0] ?? "";
  const dark =
    /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/brand\/wordmark-dark\.svg"/;
  const light =
    /<img src="assets\/brand\/wordmark-light\.svg"[^>]*alt="Blinkling"/;
  return dark.test(picture) && light.test(picture)
    ? []
    : [
        `${file}: the header must be a <picture> with ${KIT}/wordmark-dark.svg and ${KIT}/wordmark-light.svg`,
      ];
}

/** Pixel difference between two PNGs, by Pillow (cairosvg depends on it). The
 * same size and a mean difference under one 8-bit step per channel pass: another
 * cairo may anti-alias an edge differently, a hand-edited file does not pass. */
const PNG_DIFF = `
import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert("RGBA")
b = Image.open(sys.argv[2]).convert("RGBA")
if a.size != b.size:
    print(f"size {a.size} != {b.size}"); sys.exit(1)
h = ImageChops.difference(a, b).histogram()
total = sum(h)
mean = sum((i % 256) * n for i, n in enumerate(h)) / total
if mean >= 1.0:
    print(f"mean channel difference {mean:.2f}"); sys.exit(1)
`;

/** Regenerates the kit into a temp folder with kit.py and compares it with the
 * committed files. */
export function checkKit({
  root = ".",
  python = process.env.BLINKLING_BRAND_PYTHON || "python3",
} = {}) {
  const problems = [];
  const out = mkdtempSync(join(tmpdir(), "blinkling-brand-"));
  try {
    try {
      execFileSync(python, [resolve(root, KIT, "kit.py"), out], {
        cwd: resolve(root, KIT),
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      const detail = String(error.stderr || error.message)
        .trim()
        .split("\n")
        .pop();
      return [
        `${KIT}/kit.py did not run (${detail}). It needs: pip install fonttools uharfbuzz cairosvg`,
      ];
    }
    const made = new Set(readdirSync(out));
    const kept = readdirSync(join(root, KIT)).filter((f) => KIT_FILE.test(f));
    for (const name of kept) {
      if (!made.has(name)) {
        problems.push(`${KIT}/${name}: kit.py does not make this file`);
      }
    }
    for (const name of [...made].filter((f) => KIT_FILE.test(f)).sort()) {
      const committed = join(root, KIT, name);
      if (!kept.includes(name)) {
        problems.push(`${KIT}/${name}: kit.py makes it but it is missing`);
      } else if (name.endsWith(".png")) {
        try {
          execFileSync(python, ["-c", PNG_DIFF, committed, join(out, name)], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          problems.push(
            `${KIT}/${name}: differs from kit.py output (${String(error.stdout).trim()})`,
          );
        }
      } else if (
        !readFileSync(committed).equals(readFileSync(join(out, name)))
      ) {
        problems.push(
          `${KIT}/${name}: differs from what kit.py makes from wordmark-parts.json`,
        );
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  return problems;
}

const tracked = (root) =>
  execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

/** All three checks over a checkout. */
export function checkBrand({ root = ".", python } = {}) {
  const files = tracked(root);
  const texts = {};
  for (const file of files) {
    if (!TEXT_FILE.test(file) && !RETIRED.some((p) => p.test(file))) continue;
    try {
      texts[file] = readFileSync(join(root, file), "utf8");
    } catch {
      // Deleted in the working tree but not yet committed: nothing to scan.
    }
  }
  const problems = [...checkKit({ root, python })];
  problems.push(...findSecondDrawings(texts));
  for (const file of files.filter((f) =>
    /^README(\.[A-Za-z-]+)?\.md$/.test(f),
  )) {
    if (texts[file] !== undefined)
      problems.push(...checkReadmeHeader(file, texts[file]));
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problems = checkBrand();
  if (problems.length) {
    console.error(`The wordmark must come from ${KIT}/ only (docs/BRAND.md):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    "Brand check passed: one wordmark, made by kit.py from wordmark-parts.json.",
  );
}
