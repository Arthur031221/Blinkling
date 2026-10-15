import test from "node:test";
import assert from "node:assert/strict";
import { resolveClaude } from "./resolve.mjs";

const on = (...files) => ({
  platform: "win32",
  env: { PATH: "C:\\a;C:\\npm" },
  exists: (p) => files.includes(p),
});

test("only the bare name claude on Windows is looked up", () => {
  assert.deepEqual(resolveClaude("claude", { platform: "linux" }), {
    command: "claude",
    args: [],
  });
  assert.deepEqual(resolveClaude("node", on()), { command: "node", args: [] });
});

test("a claude.exe on PATH is used by its full path", () => {
  const r = resolveClaude("claude", on("C:\\a\\claude.exe"));
  assert.match(r.command, /claude\.exe$/);
  assert.deepEqual(r.args, []);
});

test("an npm claude.cmd resolves to the package's own binary or cli.js", () => {
  const exe = resolveClaude(
    "claude",
    on(
      "C:\\npm\\claude.cmd",
      "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
    ),
  );
  assert.match(exe.command, /claude-code.bin.claude\.exe$/);
  const js = resolveClaude(
    "claude",
    on(
      "C:\\npm\\claude.cmd",
      "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
    ),
  );
  assert.equal(js.command, "node");
  assert.match(js.args[0], /cli\.js$/);
});

test("nothing found keeps the plain name so the missing-Claude bubble still fires", () => {
  assert.deepEqual(resolveClaude("claude", on()), {
    command: "claude",
    args: [],
  });
});
