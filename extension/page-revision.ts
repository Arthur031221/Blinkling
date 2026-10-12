import type { PageContext } from "./page-context";

/** A bounded, geometry-free identity for the content exposed to page requests. */
export function pageRevision(context: PageContext): string {
  const elements = context.elements
    .slice(0, 120)
    .map((element) => [
      normalize(element.role, 64),
      normalize(element.text, 240),
    ]);
  const source = JSON.stringify([
    normalize(context.url, 2048),
    normalize(context.title, 500),
    normalize(context.text, 24_000),
    context.hasPassword,
    elements,
  ]);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `v1-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function normalize(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}
