import { expect, it } from "vitest";
import { PNG } from "pngjs";
import { readPanelImage } from "./panel-image.js";

it("accepts a large valid PNG without overflowing the base64 validator", () => {
  const png = new PNG({ width: 1600, height: 1200 });
  let seed = 0x12345678;
  for (let index = 0; index < png.data.length; index += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    png.data[index] = seed & 255;
    png.data[index + 1] = (seed >>> 8) & 255;
    png.data[index + 2] = (seed >>> 16) & 255;
    png.data[index + 3] = 255;
  }
  const encoded = PNG.sync.write(png).toString("base64");
  expect(encoded.length).toBeGreaterThan(5_000_000);
  const result = readPanelImage(`data:image/png;base64,${encoded}`);
  expect([result.width, result.height]).toEqual([1568, 1176]);
});

it("rejects malformed base64 lengths, characters and padding", () => {
  for (const encoded of [
    "",
    "A",
    "AA",
    "AAA",
    "AA=",
    "A===",
    "====",
    "=AAA",
    "A=AA",
    "AA=A",
    "AA_+",
    "AA +",
    "AA\n+",
  ]) {
    expect(() => readPanelImage(encoded)).toThrow("Supply a valid PNG image.");
  }
});

it("rejects valid base64 that does not decode to a PNG", () => {
  for (const encoded of ["AAAA", "AAA=", "AA=="]) {
    expect(() => readPanelImage(encoded)).toThrow("The PNG image is invalid");
  }
});
