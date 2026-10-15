import test from "node:test";
import assert from "node:assert/strict";
import { resolveClaude, loginShellProbe } from "./resolve.mjs";

const on = (...files) => ({
  platform: "win32",
  env: { PATH: "C:\\a;C:\\npm" },
  exists: (p) => files.includes(p),
});

test("only the bare name claude on Windows is looked up", async () => {
  assert.deepEqual(
    await resolveClaude("/opt/x/claude", { platform: "linux" }),
    {
      command: "/opt/x/claude",
      args: [],
    },
  );
  assert.deepEqual(await resolveClaude("node", on()), {
    command: "node",
    args: [],
  });
});

test("a claude.exe on PATH is used by its full path", async () => {
  const r = await resolveClaude("claude", on("C:\\a\\claude.exe"));
  assert.match(r.command, /claude\.exe$/);
  assert.deepEqual(r.args, []);
});

test("an npm claude.cmd resolves to the package's own binary or cli.js", async () => {
  const exe = await resolveClaude(
    "claude",
    on(
      "C:\\npm\\claude.cmd",
      "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
    ),
  );
  assert.match(exe.command, /claude-code.bin.claude\.exe$/);
  const js = await resolveClaude(
    "claude",
    on(
      "C:\\npm\\claude.cmd",
      "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
    ),
  );
  assert.equal(js.command, "node");
  assert.match(js.args[0], /cli\.js$/);
});

test("nothing found keeps the plain name so the missing-Claude bubble still fires", async () => {
  assert.deepEqual(await resolveClaude("claude", on()), {
    command: "claude",
    args: [],
  });
});

const posixOn = (files, extra = {}) => ({
  platform: "darwin",
  env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
  home: "/Users/a",
  exists: (p) => files.includes(p),
  cache: new Map(),
  probe: () => null,
  ...extra,
});

test("a Mac app with the bare Finder PATH still finds the native installer, Homebrew and npm folders", async () => {
  for (const file of [
    "/Users/a/.local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "/Users/a/.claude/local/claude",
    "/Users/a/.npm-global/bin/claude",
  ])
    assert.deepEqual(await resolveClaude("claude", posixOn([file])), {
      command: file,
      args: [],
    });
});

test("PATH wins, and the login shell is asked only when nothing else matches", async () => {
  let asked = 0;
  const probe = () => (asked++, "/Users/a/tools/claude");
  assert.equal(
    (await resolveClaude("claude", posixOn(["/usr/bin/claude"], { probe })))
      .command,
    "/usr/bin/claude",
  );
  assert.equal(asked, 0);
  assert.equal(
    (await resolveClaude("claude", posixOn([], { probe }))).command,
    "/Users/a/tools/claude",
  );
  assert.equal(asked, 1);
});

test("a found path is cached and a miss is not probed again for a minute", async () => {
  let asked = 0;
  let time = 1000;
  const cache = new Map();
  const options = posixOn([], {
    cache,
    now: () => time,
    probe: () => (asked++, null),
  });
  assert.equal((await resolveClaude("claude", options)).command, "claude");
  time += 10000;
  assert.equal((await resolveClaude("claude", options)).command, "claude");
  assert.equal(asked, 1);
  time += 60000;
  await resolveClaude("claude", options);
  assert.equal(asked, 2);
});

test("the login shell answer must be an absolute path that exists", async () => {
  const run = (shell, args, opts) => {
    assert.deepEqual(args, ["-ilc", "command -v claude"]);
    assert.equal(opts.timeout, 5000);
    return { stdout: "welcome banner\n/Users/a/bin/claude\n" };
  };
  assert.equal(
    await loginShellProbe({
      env: { SHELL: "/bin/zsh" },
      run,
      exists: () => true,
    }),
    "/Users/a/bin/claude",
  );
  assert.equal(
    await loginShellProbe({
      env: {},
      run: () => ({ stdout: "claude: aliased\n" }),
      exists: () => true,
    }),
    null,
  );
  assert.equal(
    await loginShellProbe({
      env: {},
      run: () => ({ stdout: "/gone/claude" }),
      exists: () => false,
    }),
    null,
  );
});

// The probe runs a POSIX login shell, which Windows does not have.
test(
  "a slow login shell does not block the event loop while it answers",
  {
    skip: process.platform === "win32",
  },
  async () => {
    const { mkdtemp, writeFile, chmod } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const shell = join(await mkdtemp(join(tmpdir(), "slow-shell-")), "sh");
    await writeFile(shell, "#!/bin/sh\nsleep 0.5\necho /bin/sh\n");
    await chmod(shell, 0o755);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 20);
    const found = await loginShellProbe({ env: { SHELL: shell } });
    clearInterval(timer);
    assert.equal(found, "/bin/sh");
    assert.ok(ticks >= 10, `the loop ran ${ticks} times during the probe`);
  },
);
