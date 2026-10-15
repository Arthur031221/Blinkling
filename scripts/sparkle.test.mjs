import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPARKLE_CSS } from "../bridge/src/sparkle.ts";
import { installGuide } from "../bridge/src/extension-install.ts";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const block = (text) =>
  text.match(/\/\* sparkle:start.*?\/\* sparkle:end \*\//s)?.[0] ?? "";

describe("the sparkle on the drawn name", () => {
  const panel = block(read("extension/popup.css"));

  it("is one stylesheet block in the popup and the install guide", () => {
    expect(panel).toContain(".sparkle-name");
    expect(block(SPARKLE_CSS)).toBe(panel);
    expect(installGuide("/tmp/Blinkling-extension")).toContain(panel);
  });

  it("only animates properties that never move the layout", () => {
    const keyframes = [
      ...panel.matchAll(/@keyframes[^{]+\{((?:[^{}]|\{[^}]*\})*)\}/g),
    ];
    expect(keyframes.length).toBe(2);
    const used = new Set(
      keyframes.flatMap(([, body]) =>
        [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]),
      ),
    );
    expect([...used].sort()).toEqual([
      "background-position",
      "opacity",
      "transform",
    ]);
    // The stars float over the text and never take up room.
    expect(panel).toMatch(/\.sparkle-star\s*\{[^}]*position:\s*absolute/);
  });

  it("holds one still frame under reduced motion", () => {
    const reduced = panel.match(
      /@media \(prefers-reduced-motion: reduce\) \{(.*)\n\}/s,
    )?.[1];
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).toMatch(/\.sparkle-star\s*\{[^}]*animation:\s*none/);
  });

  it("draws two or three small stars and uses the house green with a white highlight", () => {
    const placed = [
      ...new Set(
        [...panel.matchAll(/\.sparkle-star:nth-child\((\d)\)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    expect(placed.length).toBeGreaterThanOrEqual(2);
    expect(placed.length).toBeLessThanOrEqual(3);
    expect(panel).toContain("#168454");
    expect(panel).toContain("#3ddc97");
    expect(panel).toContain("#fff");
  });

  it("is used for the drawn name only, never for a mention in running text", () => {
    const drawn = (path) =>
      (read(path).match(/className = "sparkle-name"/g) ?? []).length;
    expect(drawn("extension/popup.ts")).toBe(1);
  });

  describe("the README wordmark", () => {
    const light = read("assets/wordmark-light.svg");
    const dark = read("assets/wordmark-dark.svg");

    it("draws the letters as outlines, never as live text", () => {
      for (const svg of [light, dark]) {
        expect(svg).not.toContain("<text");
        expect(svg).toContain('clip-path="url(#letters)"');
        expect(svg.match(/class="star s\d/g)).toHaveLength(3);
      }
    });

    it("has a light and a dark variant in house green", () => {
      expect(light).toContain("#168454");
      expect(dark).toContain("#3ddc97");
      expect(light).not.toBe(dark);
    });

    it("holds one still frame under reduced motion", () => {
      for (const svg of [light, dark]) {
        const reduced = svg.match(
          /@media \(prefers-reduced-motion:reduce\)\{(.*?)\n\}/s,
        )?.[1];
        expect(reduced).toMatch(/\.sweep\{animation:none/);
        expect(reduced).toMatch(/\.star\{animation:none/);
      }
    });

    it("is what all nine READMEs show as the name", () => {
      const readmes = [
        "README.md",
        "README.de.md",
        "README.es.md",
        "README.fr.md",
        "README.ja.md",
        "README.ko.md",
        "README.pt-BR.md",
        "README.zh-CN.md",
        "README.zh-TW.md",
      ];
      for (const file of readmes) {
        const text = read(file);
        expect(text, file).toContain('srcset="assets/wordmark-dark.svg"');
        expect(text, file).toContain('src="assets/wordmark-light.svg"');
        expect(text, file).toContain('alt="Blinkling"');
      }
    });
  });
});
