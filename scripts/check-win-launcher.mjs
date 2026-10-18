// Checks the Windows launcher stub.
//   node scripts/check-win-launcher.mjs source            the committed exe was built from the current C source
//   node scripts/check-win-launcher.mjs spawn <command>   start <command> with no shell and finish an MCP handshake
//   node scripts/check-win-launcher.mjs mcp-json          the same, with the command and arguments of .mcp.json
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repo, "native", "win-launcher", "blinkling-run.c");
const recorded = join(repo, "bin", "blinkling-run.exe.sha256-src");
const exe = join(repo, "bin", "blinkling-run.exe");

const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function checkSource() {
  if (process.argv[3] === "--record") {
    writeFileSync(recorded, `${sha(source)}\n`);
    return;
  }
  if (!existsSync(exe))
    fail(
      "bin/blinkling-run.exe is missing. Build it with the Windows launcher workflow and commit it.",
    );
  if (!existsSync(recorded))
    fail("bin/blinkling-run.exe.sha256-src is missing.");
  if (readFileSync(recorded, "utf8").trim() !== sha(source)) {
    fail(
      "native/win-launcher/blinkling-run.c changed after bin/blinkling-run.exe was built. Rebuild the exe.",
    );
  }
  console.log("launcher exe matches its source");
}

function checkSpawn(
  command,
  args = ["mcp", join(repo, "bin", "blinkling.cjs")],
) {
  if (!command) fail("usage: check-win-launcher.mjs spawn <command>");
  const child = spawn(command, args, {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  let err = "";
  const timer = setTimeout(() => {
    child.kill();
    fail(`no initialize reply in 30 s\nstderr: ${err.slice(0, 400)}`);
  }, 30000);
  child.on("error", (e) => {
    clearTimeout(timer);
    fail(`spawn failed: ${e.code ?? ""} ${e.message}`);
  });
  child.stderr.on("data", (d) => (err += d));
  child.stdout.on("data", (d) => {
    out += d;
    if (!/"id"\s*:\s*1\b/.test(out) || !out.includes("\n")) return;
    clearTimeout(timer);
    let reply;
    try {
      reply = JSON.parse(out.split("\n").find((l) => l.includes('"id"')));
    } catch {
      fail(`unreadable reply: ${out.slice(0, 300)}`);
    }
    child.kill();
    if (!reply.result?.serverInfo)
      fail(`not an initialize result: ${out.slice(0, 300)}`);
    console.log(
      `spawned without a shell, server ${reply.result.serverInfo.name}`,
    );
    process.exit(0);
  });
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "launcher-check", version: "1" },
      },
    })}\n`,
  );
}

// Starts the server exactly as .mcp.json names it, without a shell. On
// Windows the extensionless command has to resolve to bin/blinkling-run.exe.
function checkMcpJson() {
  const server = JSON.parse(readFileSync(join(repo, ".mcp.json"), "utf8"))
    .mcpServers.blinkling;
  const fill = (text) => text.replaceAll("${CLAUDE_PLUGIN_ROOT}", repo);
  checkSpawn(fill(server.command), server.args.map(fill));
}

const mode = process.argv[2];
if (mode === "source") checkSource();
else if (mode === "spawn") checkSpawn(process.argv[3]);
else if (mode === "mcp-json") checkMcpJson();
else fail("usage: check-win-launcher.mjs source|spawn|mcp-json");
