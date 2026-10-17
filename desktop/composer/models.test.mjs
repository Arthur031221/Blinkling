import assert from "node:assert/strict";
import { test } from "node:test";
import {
  families,
  familyOf,
  modelId,
  modelLabel,
  modelVersions,
} from "./models.mjs";

test("the version table names the current four models", () => {
  assert.deepEqual(
    Object.fromEntries(families.map((f) => [f, modelLabel(f)])),
    {
      opus: "Opus 5.5",
      sonnet: "Sonnet 5.5",
      haiku: "Haiku 4.5",
      fable: "Fable 5.1",
    },
  );
  assert.deepEqual(modelVersions, {
    opus: "5.5",
    sonnet: "5.5",
    haiku: "4.5",
    fable: "5.1",
  });
});

test("an alias resolves to the current full id", () => {
  assert.equal(modelId("fable"), "claude-fable-5-1");
  assert.equal(modelId("opus"), "claude-opus-5-5");
  assert.equal(
    modelId("claude-haiku-4-5-20251001"),
    "claude-haiku-4-5-20251001",
  );
  assert.equal(modelId("mystery"), "mystery");
});

test("a full id keeps its own version and belongs to its family", () => {
  assert.equal(modelLabel("claude-fable-5-1"), "Fable 5.1");
  assert.equal(modelLabel("claude-opus-4-1-20250805"), "Opus 4.1");
  assert.equal(familyOf("claude-fable-5-1"), "fable");
  assert.equal(familyOf("fable"), "fable");
});
