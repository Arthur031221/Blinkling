import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FloatingPreferences,
  normalizeFloatingGeometry,
} from "./floatingPreferences.js";

const directories: string[] = [];
async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "blinkling-floating-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("floating geometry preferences", () => {
  it("normalizes only known geometry and strips unknown fields", () => {
    const normalized = normalizeFloatingGeometry({
      version: 1,
      dimensions: {
        compact: {
          popup: { width: 400, height: 500, path: "/private" },
          ignored: { width: 1, height: 1 },
        },
        private: { pip: { width: 9, height: 9 } },
      },
      popupPosition: { left: -20, top: 30, screenFrame: "secret" },
      popupChrome: { width: 10, height: 11, history: ["secret"] },
      question: "secret",
      key: "secret",
    });
    expect(normalized).toEqual({
      version: 1,
      dimensions: { compact: { popup: { width: 400, height: 500 } } },
      popupPosition: { left: -20, top: 30 },
      popupChrome: { width: 10, height: 11 },
    });
  });

  it.each([
    ["version", { version: 2, dimensions: {} }],
    ["dimensions", { version: 1, dimensions: [] }],
    ["size", { version: 1, dimensions: { compact: [] } }],
    [
      "width",
      { version: 1, dimensions: { compact: { pip: { width: 0, height: 1 } } } },
    ],
    [
      "too large",
      {
        version: 1,
        dimensions: { expanded: { popup: { width: 32769, height: 1 } } },
      },
    ],
    [
      "position",
      { version: 1, dimensions: {}, popupPosition: { left: 1000001, top: 0 } },
    ],
    [
      "chrome",
      { version: 1, dimensions: {}, popupChrome: { width: 0, height: -1 } },
    ],
  ])("rejects malformed %s geometry", (_label, value) => {
    expect(normalizeFloatingGeometry(value)).toBeUndefined();
  });

  it("loads missing and corrupt files as empty canonical geometry", async () => {
    const path = join(await temporaryDirectory(), "prefs.json");
    const store = new FloatingPreferences(path);
    expect(await store.read()).toEqual({ version: 1, dimensions: {} });
    await writeFile(path, "{not-json");
    expect(await store.read()).toEqual({ version: 1, dimensions: {} });
  });

  it("does not read or replace a symlink target", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "outside.json");
    const path = join(directory, "prefs.json");
    await writeFile(target, JSON.stringify({ version: 1, dimensions: {} }));
    await symlink(target, path);
    const store = new FloatingPreferences(path);
    expect(await store.read()).toEqual({ version: 1, dimensions: {} });
    expect(await store.write({ version: 1, dimensions: {} })).toBe(false);
    expect(await readFile(path, "utf8")).toContain('"version":1');
  });

  it("reads queued saves in order before later saves can replace them", async () => {
    const path = join(await temporaryDirectory(), "geometry.json");
    const store = new FloatingPreferences(path);
    const values = [410, 470, 520].map((width) => ({
      version: 1 as const,
      dimensions: { compact: { popup: { width, height: 615 } } },
    }));
    expect(await store.write(values[0]!)).toBe(true);
    const firstSave = store.write(values[1]!);
    const firstRead = store.read();
    const secondSave = store.write(values[2]!);
    const secondRead = store.read();
    expect(await firstSave).toBe(true);
    expect(await firstRead).toEqual(values[1]);
    expect(await secondSave).toBe(true);
    expect(await secondRead).toEqual(values[2]);
  });

  it("serializes simultaneous writes and keeps geometry files private", async () => {
    const path = join(await temporaryDirectory(), "geometry.json");
    const store = new FloatingPreferences(path);
    const values = [410, 420, 430].map((width) => ({
      version: 1 as const,
      dimensions: { compact: { pip: { width, height: 520 } } },
    }));
    expect(
      await Promise.all(values.map((value) => store.write(value))),
    ).toEqual([true, true, true]);
    expect(await store.read()).toEqual(values[2]);
    if (process.platform !== "win32") {
      const { stat } = await import("node:fs/promises");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("treats an unavailable config directory as a best effort failure", async () => {
    const directory = await temporaryDirectory();
    const parent = join(directory, "file");
    await writeFile(parent, "existing file");
    const store = new FloatingPreferences(join(parent, "geometry.json"));
    expect(await store.read()).toEqual({ version: 1, dimensions: {} });
    expect(await store.write({ version: 1, dimensions: {} })).toBe(false);
    expect(await readFile(parent, "utf8")).toBe("existing file");
  });

  it("disables persistence when the path is null", async () => {
    const store = new FloatingPreferences(null);
    expect(await store.read()).toEqual({ version: 1, dimensions: {} });
    expect(await store.write({ version: 1, dimensions: {} })).toBe(false);
  });
});
