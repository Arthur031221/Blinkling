import { build } from "esbuild";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { syncDistribution } from "./sync-distribution.mjs";

await syncDistribution();

await mkdir("bin", { recursive: true });
const result = await build({
  entryPoints: ["bridge/src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  define: { "import.meta.url": "BLINKLING_MODULE_URL" },
  banner: {
    js: 'const BLINKLING_MODULE_URL = require("node:url").pathToFileURL(__filename).href;',
  },
  write: false,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
});
const bundle = result.outputFiles[0].text.replace(/[\t ]+$/gm, "");
await writeFile("bin/blinkling.cjs", bundle, { mode: 0o755 });
await chmod("bin/blinkling.cjs", 0o755);
await rm("bin/panel", { recursive: true, force: true });
// What the bridge's setup page serves: the mark and the install screenshots.
await mkdir("bin/panel/assets", { recursive: true });
await cp("public/assets/logo.svg", "bin/panel/assets/logo.svg");
await cp("assets/install", "bin/panel/assets/install", { recursive: true });
await rm("bin/extension", { recursive: true, force: true });
await cp("dist-extension", "bin/extension", { recursive: true });
await mkdir("bin/config", { recursive: true });
await cp("config/distribution.json", "bin/config/distribution.json");
const packages = new Map();
const candidates = [
  ...Object.keys(result.metafile.inputs).filter((file) =>
    file.includes("node_modules/"),
  ),
];
for (const input of candidates) {
  let directory = dirname(resolve(input));
  while (directory.includes("node_modules")) {
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      );
      if (manifest.name && manifest.version && manifest.license) {
        packages.set(manifest.name, { directory, version: manifest.version });
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
}
await rm("bin/licenses", { recursive: true, force: true });
const notices = [];
for (const [name, { directory, version }] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const licenses = (await readdir(directory)).filter((file) =>
    /^(license|copying|notice)(\.|$)/i.test(file),
  );
  if (!licenses.length)
    throw new Error(`Missing license for bundled dependency ${name}`);
  const destination = join("bin/licenses", name);
  await mkdir(destination, { recursive: true });
  for (let i = 0; i < licenses.length; i++)
    await cp(
      join(directory, licenses[i]),
      join(destination, i ? `NOTICE-${i}` : "LICENSE"),
    );
  notices.push(`${name} ${version}: licenses/${name}/LICENSE`);
}
await writeFile("bin/THIRD_PARTY_LICENSES", notices.join("\n") + "\n");
