import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A Mac that has Claude Code's native installer and no Node.js: the plugin
// must still start, and a hook must never print an error.
const repo = resolve(".");
const wrapper = join(repo, "bin", "blinkling-run.cmd");
const realNode = process.execPath;
const TOOLS = [
  "sh",
  "uname",
  "cat",
  "mkdir",
  "mv",
  "rm",
  "tar",
  "gzip",
  "curl",
  "sha256sum",
  "shasum",
  "sed",
  "sleep",
  "dirname",
  "nohup",
  "head",
  "ls",
  "tr",
  "date",
  "sysctl",
  "wc",
  "env",
];

let root;
let toolBin;
const hookCommands = () => {
  const hooks = JSON.parse(readFileSync("hooks/hooks.json", "utf8")).hooks;
  return Object.values(hooks)
    .flat()
    .flatMap((entry) => entry.hooks.map((hook) => hook.command));
};

const sandbox = (name) => {
  const home = join(root, name, "home");
  const fsRoot = join(root, name, "fs");
  mkdirSync(home, { recursive: true });
  mkdirSync(fsRoot, { recursive: true });
  return {
    home,
    fsRoot,
    env: {
      PATH: toolBin,
      HOME: home,
      BLINKLING_FS_ROOT: fsRoot,
      CLAUDE_PLUGIN_ROOT: repo,
      BLINKLING_NODE_MIRROR: `file://${join(root, name, "mirror")}`,
      BLINKLING_NODE_SHA256: "0".repeat(64),
    },
  };
};

const run = (command, { env, input = "" }) =>
  spawnSync("/bin/sh", ["-c", command], {
    env,
    input,
    encoding: "utf8",
    timeout: 60_000,
  });

/** A directory shaped like a Node.js install that runs the real node. */
const plantNode = (prefix) => {
  mkdirSync(join(prefix, "bin"), { recursive: true });
  symlinkSync(realNode, join(prefix, "bin", "node"));
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "blinkling-nodefree-"));
  toolBin = join(root, "tools");
  mkdirSync(toolBin);
  for (const tool of TOOLS) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (found) symlinkSync(found, join(toolBin, tool));
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the sandbox has no node", () => {
  it("cannot find node on its PATH", () => {
    const { env } = sandbox("probe");
    expect(run("command -v node", { env }).status).not.toBe(0);
    expect(toolBin.split(delimiter)).toHaveLength(1);
  });
});

describe("every hook command without node", () => {
  const payload = JSON.stringify({
    session_id: "s1",
    prompt: "/blinkling:blinkling",
    hook_event_name: "UserPromptSubmit",
  });
  const commands = hookCommands();

  it("covers every command of hooks.json", () => {
    expect(commands.length).toBeGreaterThanOrEqual(6);
    for (const command of commands) {
      expect(command).not.toMatch(/^node /);
      expect(command).toContain("bin/blinkling-run.cmd");
    }
  });

  for (const command of new Set(commands)) {
    it(`exits 0 and stays quiet: ${command.slice(-48)}`, () => {
      const box = sandbox("hooks");
      const result = run(
        command
          .replace("${CLAUDE_PLUGIN_ROOT}", repo)
          .replaceAll("${CLAUDE_PLUGIN_ROOT}", repo),
        {
          env: box.env,
          input: payload,
        },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      // Only the notice hook may say anything, and only as one JSON object.
      if (result.stdout) {
        expect(command).toContain(" notice ");
        expect(JSON.parse(result.stdout).systemMessage).toMatch(/Node\.js/);
      }
    });
  }

  it("says that node is missing once, not on every prompt", () => {
    const box = sandbox("once");
    const command = commands.find((c) => c.includes(" notice "));
    const expanded = command.replaceAll("${CLAUDE_PLUGIN_ROOT}", repo);
    const first = run(expanded, { env: box.env, input: payload });
    const second = run(expanded, { env: box.env, input: payload });
    expect(first.stdout).toContain("systemMessage");
    expect(second.stdout).toBe("");
    expect(second.status).toBe(0);
  });
});

describe("finding node", () => {
  const echoScript = (box) => {
    const file = join(box.home, "echo.mjs");
    writeFileSync(
      file,
      'let s="";for await (const c of process.stdin) s+=c;process.stdout.write(`ran ${process.argv.slice(2).join(",")} ${s}`);',
    );
    return file;
  };

  for (const [label, where] of [
    ["nvm", (box) => join(box.home, ".nvm", "versions", "node", "v22.1.0")],
    [
      "fnm",
      (box) =>
        join(
          box.home,
          ".local",
          "share",
          "fnm",
          "node-versions",
          "v22.1.0",
          "installation",
        ),
    ],
    ["asdf", (box) => join(box.home, ".asdf", "installs", "nodejs", "22.1.0")],
    ["Homebrew", (box) => join(box.fsRoot, "opt", "homebrew")],
    ["/usr/local", (box) => join(box.fsRoot, "usr", "local")],
    ["Volta", (box) => join(box.home, ".volta")],
  ]) {
    it(`finds a ${label} install and passes arguments and stdin through`, () => {
      const box = sandbox(`find-${label.replace(/\W/g, "")}`);
      plantNode(where(box));
      const script = echoScript(box);
      const result = run(`"${wrapper}" hook "${script}" a b`, {
        env: box.env,
        input: "payload",
      });
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("ran a,b payload");
      expect(
        readFileSync(
          join(box.home, ".blinkling", "runtime", "node-path"),
          "utf8",
        ),
      ).toContain("node");
    });
  }

  it("skips a node older than 22", () => {
    const box = sandbox("old");
    const dir = join(box.home, ".nvm", "versions", "node", "v18.0.0", "bin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "node"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(dir, "node"), 0o755);
    const result = run(`"${wrapper}" hook "${echoScript(box)}"`, {
      env: box.env,
    });
    expect(result.stdout).toBe("");
    expect(result.status).toBe(0);
  });

  it("answers from the cache on a second start in under a second", () => {
    const box = sandbox("cache");
    plantNode(join(box.home, ".volta"));
    const script = echoScript(box);
    run(`"${wrapper}" hook "${script}"`, { env: box.env });
    const started = Date.now();
    const result = run(`"${wrapper}" notice "${script}"`, { env: box.env });
    expect(result.stdout).toBe("ran  ");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("the MCP server without node", () => {
  it("says one clear line and fails when node cannot be fetched", () => {
    const box = sandbox("nofetch");
    const result = run(
      `"${wrapper}" mcp "${join(repo, "bin", "blinkling.cjs")}"`,
      {
        env: box.env,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toMatch(/Node\.js 22/);
  });

  it("fetches a pinned node, refuses a wrong digest, then answers the MCP handshake", async () => {
    const box = sandbox("fetch");
    const mirror = join(root, "fetch", "mirror");
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const version = readFileSync(wrapper, "utf8").match(
      /^node_version=(\S+)/m,
    )[1];
    const name = `node-v${version}-${os}-${arch}`;
    const stage = join(root, "fetch", "stage", name);
    plantNode(stage);
    mkdirSync(join(mirror, `v${version}`), { recursive: true });
    const archive = join(mirror, `v${version}`, `${name}.tar.gz`);
    const tar = spawnSync("tar", [
      "-czf",
      archive,
      "-C",
      join(root, "fetch", "stage"),
      name,
    ]);
    expect(tar.status).toBe(0);

    // A digest that does not match leaves nothing installed.
    const bad = run(
      `"${wrapper}" mcp "${join(repo, "bin", "blinkling.cjs")}"`,
      { env: box.env },
    );
    expect(bad.status).toBe(1);
    expect(existsSync(join(box.home, ".blinkling", "runtime", "node"))).toBe(
      false,
    );

    const sha = createHash("sha256")
      .update(readFileSync(archive))
      .digest("hex");
    const env = { ...box.env, BLINKLING_NODE_SHA256: sha };
    const child = spawn(wrapper, ["mcp", join(repo, "bin", "blinkling.cjs")], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const reply = new Promise((done, fail) => {
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
        if (out.includes("\n")) done(out);
      });
      child.on("error", fail);
      setTimeout(() => fail(new Error(`no MCP reply: ${out}`)), 40_000);
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }) + "\n",
    );
    const line = await reply;
    child.kill();
    expect(JSON.parse(line.split("\n")[0]).result.serverInfo.name).toMatch(
      /blinkling/i,
    );
    expect(
      existsSync(
        join(box.home, ".blinkling", "runtime", "node", "bin", "node"),
      ),
    ).toBe(true);
  }, 60_000);
});
