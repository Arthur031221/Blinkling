import { expect, it } from "vitest";
import manifest from "./manifest.json";

it("uses a valid global crop shortcut without taking a macOS screenshot shortcut", () => {
  const global = manifest.commands["crop-global"];
  expect(global.global).toBe(true);
  expect(global.suggested_key.default).toMatch(/^Ctrl\+Shift\+[0-9]$/);
  expect(global.suggested_key.mac).toMatch(/^Command\+Shift\+[0-9]$/);
  expect([
    "Command+Shift+3",
    "Command+Shift+4",
    "Command+Shift+5",
    "Command+Shift+6",
  ]).not.toContain(global.suggested_key.mac);
  expect(manifest.commands["crop-screen"].suggested_key).toEqual({
    default: "Ctrl+Shift+S",
    mac: "Command+Shift+S",
  });
});
