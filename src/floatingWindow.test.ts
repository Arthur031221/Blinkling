import { describe, expect, it } from "vitest";
import {
  readFloatingGeometry,
  rememberFloatingGeometry,
  type GeometryStorage,
  type ScreenBounds,
} from "./floatingWindow";

const screen: ScreenBounds = { left: 0, top: 0, width: 1920, height: 1080 };

function memoryStorage(initial?: string): GeometryStorage & { value?: string } {
  return {
    value: initial,
    getItem() {
      return this.value ?? null;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe("floating window geometry", () => {
  it("uses defaults and remembers manual inner size per size and kind", () => {
    const storage = memoryStorage();
    expect(readFloatingGeometry("compact", "pip", screen, storage)).toEqual({
      width: 420,
      height: 520,
    });
    rememberFloatingGeometry(
      "compact",
      "pip",
      {
        innerWidth: 500,
        innerHeight: 600,
        outerWidth: 510,
        outerHeight: 640,
        left: 100,
        top: 120,
      },
      storage,
    );
    rememberFloatingGeometry(
      "expanded",
      "popup",
      {
        innerWidth: 700,
        innerHeight: 800,
        outerWidth: 720,
        outerHeight: 840,
        left: 200,
        top: 220,
      },
      storage,
    );
    expect(readFloatingGeometry("compact", "pip", screen, storage)).toEqual({
      width: 500,
      height: 600,
    });
    expect(readFloatingGeometry("expanded", "pip", screen, storage)).toEqual({
      width: 420,
      height: 680,
    });
    expect(readFloatingGeometry("compact", "popup", screen, storage)).toEqual({
      width: 420,
      height: 520,
      left: 200,
      top: 220,
    });
  });

  it("keeps PiP position browser controlled and uses the latest popup position across modes", () => {
    const storage = memoryStorage();
    rememberFloatingGeometry(
      "compact",
      "popup",
      {
        innerWidth: 400,
        innerHeight: 500,
        outerWidth: 420,
        outerHeight: 530,
        left: 90,
        top: 110,
      },
      storage,
    );
    rememberFloatingGeometry(
      "expanded",
      "popup",
      {
        innerWidth: 410,
        innerHeight: 660,
        outerWidth: 430,
        outerHeight: 690,
        left: 120,
        top: 140,
      },
      storage,
    );
    expect(readFloatingGeometry("compact", "pip", screen, storage)).toEqual({
      width: 420,
      height: 520,
    });
    expect(readFloatingGeometry("compact", "popup", screen, storage)).toEqual({
      width: 400,
      height: 500,
      left: 120,
      top: 140,
    });
  });

  it("clamps sizes and outer popup bounds for negative and changed display coordinates", () => {
    const storage = memoryStorage();
    rememberFloatingGeometry(
      "expanded",
      "popup",
      {
        innerWidth: 800,
        innerHeight: 900,
        outerWidth: 840,
        outerHeight: 960,
        left: -1900,
        top: 800,
      },
      storage,
    );
    expect(
      readFloatingGeometry(
        "expanded",
        "popup",
        { left: -1600, top: -200, width: 900, height: 700 },
        storage,
      ),
    ).toEqual({
      width: 800,
      height: 640,
      left: -1600,
      top: -200,
    });
    expect(
      readFloatingGeometry(
        "expanded",
        "popup",
        { left: 100, top: 50, width: 500, height: 300 },
        storage,
      ),
    ).toEqual({
      width: 460,
      height: 240,
      left: 100,
      top: 50,
    });
  });

  it("ignores corrupted, wrong-typed, and nonfinite stored values", () => {
    for (const raw of [
      "{",
      JSON.stringify({ version: 2, dimensions: {} }),
      JSON.stringify({
        version: 1,
        dimensions: { compact: { pip: { width: "600", height: 400 } } },
        popupPosition: { left: "5", top: 6 },
      }),
    ]) {
      const storage = memoryStorage(raw);
      expect(readFloatingGeometry("compact", "pip", screen, storage)).toEqual({
        width: 420,
        height: 520,
      });
      expect(readFloatingGeometry("compact", "popup", screen, storage)).toEqual(
        { width: 420, height: 520 },
      );
    }
    const storage = memoryStorage();
    rememberFloatingGeometry(
      "compact",
      "pip",
      {
        innerWidth: Infinity,
        innerHeight: 500,
        outerWidth: 500,
        outerHeight: 520,
        left: 0,
        top: 0,
      },
      storage,
    );
    expect(storage.value).toBeUndefined();
  });

  it("survives blocked reads and writes", () => {
    const storage: GeometryStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(readFloatingGeometry("expanded", "popup", screen, storage)).toEqual({
      width: 420,
      height: 680,
    });
    expect(() =>
      rememberFloatingGeometry(
        "compact",
        "popup",
        {
          innerWidth: 420,
          innerHeight: 520,
          outerWidth: 440,
          outerHeight: 550,
          left: 0,
          top: 0,
        },
        storage,
      ),
    ).not.toThrow();
  });
});
