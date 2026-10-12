import { access, readFile } from "node:fs/promises";

const required = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".mcp.json",
  "bin/glimpselet.cjs",
  "bin/panel/index.html",
  "bin/THIRD_PARTY_LICENSES",
  "bin/licenses/react/LICENSE",
  "bin/panel/licenses/inter/LICENSE",
  "bin/panel/licenses/fraunces/LICENSE",
  "native/capture-windows.ps1",
  "skills/screen-sharing/SKILL.md",
  "commands/look.md",
  "commands/glimpse.md",
  "commands/translate-screen.md",
  "commands/watch.md",
  "commands/screen-summary.md",
];
for (const file of required) await access(file);
const plugin = JSON.parse(await readFile(required[0], "utf8"));
const marketplace = JSON.parse(await readFile(required[1], "utf8"));
const mcp = JSON.parse(await readFile(required[2], "utf8"));
if (plugin.name !== "glimpselet")
  throw new Error("plugin name must be glimpselet");
if (marketplace.plugins[0].name !== plugin.name || !plugin.version)
  throw new Error("plugin metadata is incomplete");
if (marketplace.plugins.length !== 1 || marketplace.plugins[0].source !== "./")
  throw new Error("marketplace must list this plugin from ./");
if (
  mcp.mcpServers.glimpselet.args[0] !==
  "${CLAUDE_PLUGIN_ROOT}/bin/glimpselet.cjs"
)
  throw new Error("MCP config must start the committed standalone bundle");
const bundle = await readFile("bin/glimpselet.cjs", "utf8");
if (
  !bundle.startsWith("#!/usr/bin/env node") ||
  bundle.includes('require("pngjs")') ||
  bundle.includes('require("@modelcontextprotocol/sdk')
)
  throw new Error("MCP bundle must include its runtime dependencies");
process.stdout.write(
  "Plugin metadata and standalone bundle passed validation.\n",
);
