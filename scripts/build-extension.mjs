import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

await rm("dist-extension", { recursive: true, force: true });
await mkdir("dist-extension/assets", { recursive: true });
await build({
  entryPoints: ["extension/background.ts"],
  outfile: "dist-extension/background.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  legalComments: "none",
});
// Injected files must be classic scripts, so these are not modules.
await build({
  entryPoints: {
    page: "extension/page.ts",
    install: "extension/install.ts",
  },
  outdir: "dist-extension",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome116",
  legalComments: "none",
});
await build({
  entryPoints: { popup: "extension/popup.ts", reader: "extension/reader.ts" },
  outdir: "dist-extension",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const name of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "reader.html",
  "reader.css",
])
  await cp(`extension/${name}`, `dist-extension/${name}`);
await cp("public/assets", "dist-extension/assets", { recursive: true });
await cp("extension/icons", "dist-extension/icons", { recursive: true });
await cp("extension/_locales", "dist-extension/_locales", { recursive: true });
await cp("public/licenses", "dist-extension/licenses", { recursive: true });
await cp(
  resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  "dist-extension/pdf.worker.min.mjs",
);
await build({
  entryPoints: ["extension/reader-worker.ts"],
  outfile: "dist-extension/pdf.worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  legalComments: "none",
});
await cp(resolve("node_modules/pdfjs-dist/cmaps"), "dist-extension/cmaps", {
  recursive: true,
});
await cp(
  resolve("node_modules/pdfjs-dist/standard_fonts"),
  "dist-extension/standard_fonts",
  { recursive: true },
);
await cp(resolve("node_modules/pdfjs-dist/wasm"), "dist-extension/wasm", {
  recursive: true,
});
await cp(
  resolve("node_modules/pdfjs-dist/LICENSE"),
  "dist-extension/licenses/pdfjs-LICENSE",
);
const manifest = JSON.parse(
  await readFile("dist-extension/manifest.json", "utf8"),
);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
manifest.version = pkg.version;
await writeFile(
  "dist-extension/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Built unpacked extension ${manifest.version} in dist-extension.`);
