import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startWithClaudeCode } from "./launcher.mjs";

const start = new URL("./start.mjs", import.meta.url).pathname;
async function home(settings) {
  const root = await mkdtemp(join(tmpdir(), "blinkling-start-"));
  const runtime = join(root, "runtime");
  await mkdir(join(runtime, "electron"), { recursive: true });
  await writeFile(join(runtime, "enabled.json"), '{"enabled":true}');
  if (settings !== undefined)
    await writeFile(join(runtime, "electron", "settings.json"), settings);
  return { root, runtime };
}
const run = (root, runtime, args) =>
  promisify(execFile)(process.execPath, [start, ...args], {
    env: {
      PATH: process.env.PATH,
      HOME: root,
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_DATA_HOME: join(root, "data"),
      APPDATA: join(root, "appdata"),
      LOCALAPPDATA: join(root, "local"),
      BLINKLING_RUNTIME_DIR: runtime,
      BLINKLING_REMOTE: "0",
    },
  }).then(
    (r) => ({ code: 0, ...r }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

test("start with Claude Code is on unless the settings file says false", async () => {
  const cases = [
    [undefined, true],
    ['{"schemaVersion":1,"startWithClaudeCode":true}', true],
    ['{"schemaVersion":1,"startWithClaudeCode":false}', false],
    ["{ not json", true],
    ['{"startWithClaudeCode":"no"}', true],
  ];
  for (const [settings, expected] of cases) {
    const { root, runtime } = await home(settings);
    try {
      assert.equal(
        await startWithClaudeCode(join(runtime, "electron")),
        expected,
        String(settings),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("--background exits quietly without launching when start with Claude Code is off", async () => {
  const off = await home('{"schemaVersion":1,"startWithClaudeCode":false}');
  const on = await home('{"schemaVersion":1,"startWithClaudeCode":true}');
  try {
    const quiet = await run(off.root, off.runtime, ["--background"]);
    assert.equal(quiet.code, 0);
    assert.equal(quiet.stderr, "");
    assert.equal(quiet.stdout, "");
    // Control: with the setting on, the same session does try to start Blink.
    // Without a display Linux reports that before any download is attempted.
    if (process.platform === "linux") {
      const tried = await run(on.root, on.runtime, ["--background"]);
      assert.match(tried.stderr, /graphical desktop/);
    }
  } finally {
    await rm(off.root, { recursive: true, force: true });
    await rm(on.root, { recursive: true, force: true });
  }
});

test("the slash command still starts Blink when the background start is off", async () => {
  const off = await home('{"schemaVersion":1,"startWithClaudeCode":false}');
  try {
    const result = await run(off.root, off.runtime, []);
    if (process.platform === "linux") {
      assert.match(result.stderr, /graphical desktop/);
      assert.equal(result.code, 1);
    }
  } finally {
    await rm(off.root, { recursive: true, force: true });
  }
});
