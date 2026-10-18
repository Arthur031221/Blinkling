import assert from "node:assert/strict";
import test from "node:test";
import { quiet, REPLY_TOOL } from "./quiet.mjs";

test("a delivered answer ends the turn without a line from the terminal", () => {
  assert.deepEqual(
    quiet({
      tool_name: REPLY_TOOL,
      tool_response: { content: [{ type: "text", text: "Delivered." }] },
    }),
    { continue: false, suppressOutput: true },
  );
});

test("a failed reply is left to the model to explain", () => {
  assert.equal(
    quiet({ tool_name: REPLY_TOOL, tool_response: { isError: true } }),
    undefined,
  );
});

test("other tools are untouched", () => {
  assert.equal(quiet({ tool_name: "Bash", tool_response: {} }), undefined);
  assert.equal(quiet(undefined), undefined);
});

test("the plugin's hooks run it after the reply tool and nothing else", async () => {
  const { readFile } = await import("node:fs/promises");
  const hooks = JSON.parse(
    await readFile(new URL("../../hooks/hooks.json", import.meta.url), "utf8"),
  );
  const [entry, ...rest] = hooks.hooks.PostToolUse;
  assert.equal(rest.length, 0);
  assert.equal(entry.matcher, REPLY_TOOL);
  assert.match(entry.hooks[0].command, /plugin\/desktop\/quiet\.mjs/);
});
