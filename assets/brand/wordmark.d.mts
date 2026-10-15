export type WordmarkParts = {
  viewBox: [number, number, number, number];
  letters: { glyph: string; d: string; group: "blink" | "ling" }[];
  eye: { cx: number; cy: number; r: number };
  bigStar: { cx: number; cy: number; r: number };
  smallStars: { cx: number; cy: number; r: number }[];
  colors: Record<
    "light" | "dark",
    { blink: string; ling: [string, string]; band: string }
  >;
  motion: {
    loopSeconds: number;
    eyeBlinkAt: [number, number];
    bandSweepFrom: number;
    bandSweepTo: number;
    starDelays: number[];
  };
};
export type WordmarkOptions = {
  id?: string;
  still?: boolean;
  theme?: "light" | "dark";
  source?: WordmarkParts;
};
export function starPath(
  cx: number,
  cy: number,
  r: number,
  inner?: number,
): string;
export function wordmarkCss(source?: WordmarkParts): string;
export const WORDMARK_CSS: string;
export function nextWordmarkId(): string;
export function wordmarkSvg(options?: WordmarkOptions): string;
export function mountWordmark(
  parent: Element,
  options?: WordmarkOptions,
): SVGSVGElement;
