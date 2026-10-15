// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDesktopHost } from "../../plugin/desktop/host.mjs";
import { parseTranslation, wakeDesktop } from "./desktop-link.js";

let directory = "";
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "blinkling-link-"));
  process.env.BLINKLING_RUNTIME_DIR = directory;
});
afterEach(async () => {
  delete process.env.BLINKLING_RUNTIME_DIR;
  await rm(directory, { recursive: true, force: true });
});

describe("waking Blink from the browser helper", () => {
  it("starts Blink when it is not running, then brings it forward once it answers", async () => {
    let launches = 0;
    let opens = 0;
    let host: Awaited<ReturnType<typeof startDesktopHost>> | undefined;
    try {
      const woke = await wakeDesktop(async () => {
        launches++;
        host = await startDesktopHost({
          directory,
          descriptor: join(directory, "desktop.json"),
          onOpen: () => opens++,
        });
      });
      expect(woke).toBe(true);
      expect(launches).toBe(1);
      expect(opens).toBe(1);
    } finally {
      await host?.close();
    }
  });

  it("only brings the window forward when Blink is already running", async () => {
    let opens = 0;
    const host = await startDesktopHost({
      directory,
      descriptor: join(directory, "desktop.json"),
      onOpen: () => opens++,
    });
    try {
      let launches = 0;
      expect(await wakeDesktop(async () => void launches++)).toBe(true);
      expect(launches).toBe(0);
      expect(opens).toBe(1);
    } finally {
      await host.close();
    }
  });
});

describe("a translated batch", () => {
  it("accepts a JSON array of the same length, even inside other text", () => {
    expect(parseTranslation('Here: ["a","b"]', 2)).toEqual(["a", "b"]);
  });
  it("rejects a different length, non-strings and prose", () => {
    expect(() => parseTranslation('["a"]', 2)).toThrow(/incomplete/);
    expect(() => parseTranslation("[1,2]", 2)).toThrow(/incomplete/);
    expect(() => parseTranslation("sorry", 1)).toThrow(/not understood/);
  });
});
