// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBlinkling } from "../src/server.js";

const apps: Awaited<ReturnType<typeof createBlinkling>>[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(clients.splice(0).map((client) => client.close()));
});
async function tools() {
  const app = await createBlinkling({});
  apps.push(app);
  const client = new Client({ name: "annotations-test", version: "1.0.0" });
  clients.push(client);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await app.server.connect(serverTransport);
  await client.connect(clientTransport);
  return (await client.listTools()).tools;
}

const expected: Record<string, Record<string, boolean>> = {
  screen_capture: { readOnlyHint: true, destructiveHint: false },
  screen_latest: { readOnlyHint: true, destructiveHint: false },
  screen_history: { readOnlyHint: true, destructiveHint: false },
  screen_watch_start: { readOnlyHint: false, destructiveHint: false },
  screen_watch_stop: { readOnlyHint: false, destructiveHint: false },
  screen_notes: { readOnlyHint: true, destructiveHint: false },
  desktop_open: { readOnlyHint: false, openWorldHint: true },
  extension_install: { readOnlyHint: false, destructiveHint: false },
  screen_clear: { readOnlyHint: false, destructiveHint: true },
  blinkling_reply: { readOnlyHint: false, destructiveHint: false },
  blinkling_chat_images: { readOnlyHint: true, destructiveHint: false },
};

it("every tool carries a title and all four behaviour hints", async () => {
  const list = await tools();
  expect(list.map((tool) => tool.name).sort()).toEqual(
    Object.keys(expected).sort(),
  );
  for (const tool of list) {
    const a = tool.annotations;
    expect(a?.title, tool.name).toMatch(/\S/);
    expect(tool.title, tool.name).toBe(a?.title);
    for (const hint of [
      "readOnlyHint",
      "idempotentHint",
      "openWorldHint",
    ] as const)
      expect(typeof a?.[hint], `${tool.name} ${hint}`).toBe("boolean");
    // Every tool states destructiveHint, read-only ones included.
    expect(typeof a?.destructiveHint, `${tool.name} destructive`).toBe(
      "boolean",
    );
  }
});

it("the capture and notes tools are read only as the account holder listed them, the captures and notes living in memory only", async () => {
  const byName = new Map((await tools()).map((tool) => [tool.name, tool]));
  for (const name of [
    "screen_capture",
    "screen_notes",
    "screen_latest",
    "screen_history",
    "blinkling_chat_images",
  ])
    expect(byName.get(name)?.annotations, name).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
});

it("each tool states the hints that match what it does", async () => {
  const byName = new Map((await tools()).map((tool) => [tool.name, tool]));
  for (const [name, hints] of Object.entries(expected))
    expect(byName.get(name)?.annotations, name).toMatchObject(hints);
  // Only the tool that deletes captures is destructive, and only the one that
  // downloads Blink reaches beyond this machine.
  const all = [...byName.values()];
  expect(
    all.filter((t) => t.annotations?.destructiveHint).map((t) => t.name),
  ).toEqual(["screen_clear"]);
  expect(
    all.filter((t) => t.annotations?.openWorldHint).map((t) => t.name),
  ).toEqual(["desktop_open"]);
});
