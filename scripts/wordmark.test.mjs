import { describe, expect, it } from "vitest";
import {
  WORDMARK_CSS,
  mountWordmark,
  starPath,
  wordmarkCss,
  wordmarkSvg,
} from "../assets/brand/wordmark.mjs";
import parts from "../assets/brand/wordmark-parts.json" with { type: "json" };

const parse = (markup) => {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.querySelector("svg");
};

describe("the Wordmark component draws the parts file", () => {
  const svg = parse(wordmarkSvg({ id: "t" }));

  it("uses the view box and every letter outline from the JSON", () => {
    expect(svg.getAttribute("viewBox")).toBe(parts.viewBox.join(" "));
    const drawn = [
      ...svg.querySelectorAll(".bl-wm-ink path, g[fill] > path"),
    ].map((p) => p.getAttribute("d"));
    expect(drawn).toEqual(parts.letters.map((l) => l.d));
  });

  it("puts the first group in ink and the second in the green gradient", () => {
    const ink = svg.querySelectorAll(".bl-wm-ink path").length;
    const ling = svg.querySelectorAll('g[fill="url(#t-gl)"] > path').length;
    expect(ink).toBe(parts.letters.filter((l) => l.group === "blink").length);
    expect(ling).toBe(parts.letters.filter((l) => l.group === "ling").length);
  });

  it("places the eye and the stars where the JSON says", () => {
    const eye = svg.querySelector(".bl-wm-eye circle");
    expect(Number(eye.getAttribute("cx"))).toBeCloseTo(parts.eye.cx, 1);
    expect(Number(eye.getAttribute("cy"))).toBeCloseTo(parts.eye.cy, 1);
    expect(Number(eye.getAttribute("r"))).toBeCloseTo(parts.eye.r, 1);
    const big = svg.querySelector(".bl-wm-t0 path");
    expect(big.getAttribute("d")).toBe(
      starPath(parts.bigStar.cx, parts.bigStar.cy, parts.bigStar.r),
    );
    parts.smallStars.forEach((s, i) => {
      expect(
        svg.querySelector(`.bl-wm-small.bl-wm-t${i + 1}`).getAttribute("d"),
      ).toBe(starPath(s.cx, s.cy, s.r));
    });
  });

  it("takes colours and timing from the JSON", () => {
    expect(WORDMARK_CSS).toContain(parts.colors.light.blink);
    expect(WORDMARK_CSS).toContain(parts.colors.dark.ling[1]);
    expect(WORDMARK_CSS).toContain(`${parts.motion.loopSeconds}s`);
    const custom = structuredClone(parts);
    custom.colors.light.blink = "#123456";
    custom.motion.loopSeconds = 9;
    expect(wordmarkCss(custom)).toContain("#123456");
    expect(wordmarkCss(custom)).toContain("9s");
  });

  it("is named Blinkling for assistive technology and carries no inline style", () => {
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title").textContent).toBe("Blinkling");
    expect(svg.outerHTML).not.toMatch(/style=/);
  });
});

describe("instances", () => {
  it("never share a gradient, clip or title id", () => {
    const a = parse(wordmarkSvg());
    const b = parse(wordmarkSvg());
    const ids = (s) => [...s.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids(a).length).toBe(4);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });

  it("references only its own ids", () => {
    const svg = parse(wordmarkSvg({ id: "mine" }));
    const refs = svg.outerHTML.match(/url\(#[^)]+\)/g);
    for (const ref of refs) expect(ref).toMatch(/^url\(#mine-/);
  });

  it("mounts once per document with one stylesheet", () => {
    const one = document.createElement("div");
    const two = document.createElement("div");
    document.body.append(one, two);
    mountWordmark(one);
    mountWordmark(two, { theme: "dark" });
    mountWordmark(one);
    expect(document.querySelectorAll("style[data-bl-wordmark]").length).toBe(1);
    expect(one.querySelectorAll("svg").length).toBe(1);
    expect(two.querySelector("svg").getAttribute("data-theme")).toBe("dark");
  });
});

describe("motion", () => {
  const block = (css, query) => {
    const start = css.indexOf(query);
    return css.slice(start, css.indexOf("}}", start) + 2);
  };

  it("animates the eye, stars and band in the full loop", () => {
    for (const name of ["bl-wm-blink", "bl-wm-twk", "bl-wm-sweep"])
      expect(WORDMARK_CSS).toContain(`@keyframes ${name}`);
  });

  it("stops every animation and holds one frame under prefers-reduced-motion", () => {
    const reduced = block(
      WORDMARK_CSS,
      "@media (prefers-reduced-motion:reduce)",
    );
    expect(reduced).toContain(
      ".bl-wm-eye,.bl-wm-twk,.bl-wm-band{animation:none}",
    );
    expect(reduced).toContain(".bl-wm-twk{transform:scale(.95);opacity:.9}");
    expect(reduced).toContain(".bl-wm-band{display:none}");
  });

  it("draws the static frame on request", () => {
    expect(parse(wordmarkSvg({ still: true })).hasAttribute("data-still")).toBe(
      true,
    );
    expect(WORDMARK_CSS).toContain(".bl-wordmark[data-still] .bl-wm-eye");
  });
});
