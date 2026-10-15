// Run after npm run build:plugin, with a real Claude Code CLI on PATH.
// All marketplace declarations and plugin installations stay in temporary profiles.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execute = promisify(execFile);
const root = resolve(".");
const { version: releaseVersion } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const directory = await mkdtemp(join(tmpdir(), "blinkling-plugin-upgrade-"));
const stage = join(directory, "marketplace");
const cli = process.env.BLINKLING_CLAUDE_CLI || "claude";
const legacyRef = process.env.BLINKLING_LEGACY_REF || "a27fd993";
const pluginId = "blinkling@blinkling";

async function stageRef(ref) {
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage);
  const { stdout } = await execute("git", ["archive", ref], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  const extracted = spawnSync("tar", ["-x", "-C", stage], { input: stdout });
  assert.equal(extracted.status, 0, extracted.stderr.toString());
}

async function profile(name) {
  const cwd = join(directory, name);
  await mkdir(cwd);
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: join(cwd, "claude-config"),
    BLINKLING_REMOTE: "0",
  };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION_ID;
  const run = async (...args) => {
    const result = await execute(cli, ["plugin", ...args], {
      cwd,
      env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  };
  return { cwd, env, run };
}

async function installed(profile, version) {
  const plugins = JSON.parse(await profile.run("list", "--json"));
  const plugin = plugins.find((entry) => entry.id === pluginId);
  assert.ok(plugin, `Missing ${pluginId}`);
  assert.equal(plugin.version, version);
  assert.equal(plugin.scope, "user");
  const manifest = JSON.parse(
    await readFile(
      join(plugin.installPath, ".claude-plugin/plugin.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.version, version);
  return plugin.installPath;
}

async function welcome(profile, pluginPath) {
  const extension = JSON.parse(
    await readFile(join(pluginPath, "bin/extension/manifest.json"), "utf8"),
  );
  assert.equal(extension.version, releaseVersion);
  assert.deepEqual(
    await readFile(join(pluginPath, "bin/blinkling.cjs")),
    await readFile(join(root, "bin/blinkling.cjs")),
  );
  const command = await readFile(
    join(pluginPath, "commands/blinkling.md"),
    "utf8",
  );
  assert.match(command, /Call `desktop_open`/);
  // Redirect homedir only in this child so extension_install cannot overwrite the user's extension.
  const isolate = join(profile.cwd, "isolate-home.cjs");
  await writeFile(
    isolate,
    `require("node:os").homedir = () => ${JSON.stringify(profile.cwd)};\n`,
  );
  const env = {
    ...profile.env,
    BLINKLING_DISABLE_BROWSER_OPEN: "1",
    BLINKLING_TEST_MODE: "1",
    BLINKLING_PORT: "0",
    BLINKLING_REMOTE: "0",
    BLINKLING_RUNTIME_DIR: join(profile.cwd, "runtime"),
  };
  delete env.SSH_CONNECTION;
  delete env.BLINKLING_EXTENSION_DIR;
  delete env.BLINKLING_PANEL_DIR;
  const client = new Client({ name: "upgrade-verification", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--require", isolate, join(pluginPath, "bin/blinkling.cjs")],
    cwd: profile.cwd,
    env,
  });
  try {
    await client.connect(transport);
    const opened = await client.callTool({
      name: "extension_install",
      arguments: {},
    });
    assert.notEqual(opened.isError, true);
    const link = /http:\/\/127\.0\.0\.1:\d+\/install#code=([A-F0-9]{16})/.exec(
      opened.content[0].text,
    );
    assert.ok(link, "The installed command must reach the helper setup page");
    const origin = new URL(link[0]).origin;
    const page = await fetch(`${origin}/install`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Blinkling/);
    const trust = await fetch(`${origin}/install/trust`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ code: link[1] }),
    });
    assert.match((await trust.json()).secret, /^[a-f0-9]{64}$/);
    const copied = JSON.parse(
      await readFile(
        join(profile.cwd, "Blinkling-extension/manifest.json"),
        "utf8",
      ),
    );
    assert.equal(copied.version, releaseVersion);
    console.log(
      `PASS: ${profile.cwd.split("/").at(-1)} installed plugin and extension ${releaseVersion}; the packaged helper setup page handed over its trust automatically`,
    );
  } finally {
    await client.close();
    await transport.close();
  }
}

try {
  console.log((await execute(cli, ["--version"])).stdout.trim());
  const upgrade = await profile("existing-v1");
  await stageRef(legacyRef);
  await upgrade.run("marketplace", "add", stage);
  await upgrade.run("install", pluginId);
  await installed(upgrade, "1.1.1");
  // Stage v2 before testing the documented marketplace refresh and plugin update.
  await stageRef("HEAD");
  await cp(join(root, "bin"), join(stage, "bin"), {
    recursive: true,
    force: true,
  });
  await upgrade.run("marketplace", "update", "blinkling");
  await upgrade.run("update", pluginId);
  await welcome(upgrade, await installed(upgrade, releaseVersion));
  const fresh = await profile("fresh-v2");
  await fresh.run("marketplace", "add", stage);
  await fresh.run("install", pluginId);
  await welcome(fresh, await installed(fresh, releaseVersion));
} finally {
  await rm(directory, { recursive: true, force: true });
}
