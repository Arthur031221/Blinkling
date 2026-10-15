import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyDependencies } from "./dependencies.mjs";

async function app() {
  const root = await mkdtemp(join(tmpdir(), "deps-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { keep: "1", skipped: "1" } }),
  );
  for (const name of ["keep", "skipped"]) {
    const dir = join(root, "node_modules", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "package.json"), JSON.stringify({ name }));
  }
  return root;
}

test("every production dependency is copied", async () => {
  const root = await app();
  const out = await mkdtemp(join(tmpdir(), "out-"));
  await copyDependencies(join(root, "package.json"), out);
  assert.deepEqual((await readdir(join(out, "node_modules"))).sort(), [
    "keep",
    "skipped",
  ]);
});

test("a package the target never loads can be skipped", async () => {
  const root = await app();
  const out = await mkdtemp(join(tmpdir(), "out-"));
  await copyDependencies(join(root, "package.json"), out, {
    skip: ["skipped"],
  });
  assert.deepEqual(await readdir(join(out, "node_modules")), ["keep"]);
});
