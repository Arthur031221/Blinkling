import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PNG } from "pngjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "glimpselet-mcp-e2e-"));
const fixture = join(dir, "fixture.png");
const png = new PNG({ width: 4, height: 3 });
png.data.fill(255);
await writeFile(fixture, PNG.sync.write(png));
const client = new Client({ name: "glimpselet-e2e-client", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/glimpselet.cjs"],
  stderr: "pipe",
  env: {
    ...process.env,
    GLIMPSELET_TEST_MODE: "1",
    GLIMPSELET_TEST_FIXTURE: fixture,
  },
});
try {
  await client.connect(transport);
  const { version } = JSON.parse(
    await readFile(new URL("../bridge/package.json", import.meta.url), "utf8"),
  );
  if (client.getServerVersion()?.version !== version)
    throw new Error(
      `Expected MCP version ${version}, got ${client.getServerVersion()?.version}`,
    );
  const tools = await client.listTools();
  if (
    !tools.tools.some((tool) => tool.name === "screen_latest") ||
    !tools.tools.some((tool) => tool.name === "screen_capture")
  )
    throw new Error("MCP tools are missing");
  const history = await client.callTool({
    name: "screen_history",
    arguments: {},
  });
  if (!JSON.stringify(history).includes("No recent captures"))
    throw new Error("Expected empty bridge history");
  const capture = await client.callTool({
    name: "screen_capture",
    arguments: { target: "screen" },
  });
  if (
    !JSON.stringify(capture).includes("test fixture") ||
    !capture.content.some((item) => item.type === "image")
  )
    throw new Error("Fixture capture did not return its image");
  console.log(
    "MCP E2E passed: real stdio client listed tools, read empty history, and captured a deterministic fixture.",
  );
} finally {
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
