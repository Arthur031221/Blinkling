import { Marked } from "./vendor/marked.mjs";
export const markdown = new Marked({ gfm: true, breaks: true });

// Abbreviations whose period does not end a sentence (English and German).
const ABBREVIATION =
  /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|St|vs|bzw|ca|Nr|vgl|ggf|inkl|evtl|[zdu]|e\. ?g|i\. ?e|z\. ?B|d\. ?h|u\. ?a|o\. ?ä|s\. ?o|i\. ?d\. ?R)$/;

// Latin terminators only count before whitespace or the end, so URLs, versions and
// query strings stay in one piece. CJK terminators need no space after them.
const CJK_END = /[。！？]/u;
const LATIN_END = /[.!?]/;

// Boundaries inside code, links or emphasis would break the Markdown delimiters.
function sentences(source) {
  const result = [];
  let start = 0,
    code = false,
    strong = false,
    linkDepth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === "`") code = !code;
    if (code) continue;
    if (source.slice(i, i + 2) === "**" || source.slice(i, i + 2) === "__") {
      strong = !strong;
      i++;
      if (
        !strong &&
        /[。！？!?.]/u.test(source[i - 2] ?? "") &&
        /\s/.test(source[i + 1] ?? "")
      ) {
        result.push(source.slice(start, i + 1).trim());
        start = i + 1;
      }
      continue;
    }
    if (source[i] === "[") linkDepth++;
    if (source[i] === "]" && source[i + 1] !== "(")
      linkDepth = Math.max(0, linkDepth - 1);
    if (source[i] === ")") linkDepth = Math.max(0, linkDepth - 1);
    if (strong || linkDepth) continue;
    const c = source[i];
    const spaced = i + 1 === source.length || /\s/.test(source[i + 1]);
    if (
      CJK_END.test(c) ||
      (LATIN_END.test(c) &&
        (spaced || /[”’」』"')]/u.test(source[i + 1])) &&
        !(c === "." && ABBREVIATION.test(source.slice(start, i))))
    ) {
      // Include closing quotes with the sentence.
      while (/[”’」』"')]/u.test(source[i + 1] ?? "") && i + 1 < source.length)
        i++;
      result.push(source.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) result.push(source.slice(start).trim());
  return result.filter(Boolean);
}

export function bubbleParts(source, complete = false) {
  const parts = [];
  for (const token of markdown.lexer(source)) {
    if (token.type === "space") continue;
    if (token.type === "paragraph") {
      for (const text of sentences(token.raw.trim()))
        parts.push({ kind: "sentence", markdown: text });
    } else if (token.type === "blockquote") {
      for (const line of token.raw.trim().split("\n")) {
        const quoted = line.replace(/^\s*>\s?/, "");
        for (const text of sentences(quoted))
          parts.push({ kind: "blockquote", markdown: `> ${text}` });
      }
    } else if (token.type === "list") {
      token.items.forEach((item, index) =>
        parts.push({
          kind: "point",
          markdown: item.text,
          marker: token.ordered ? `${token.start + index}.` : "•",
        }),
      );
    } else if (token.type === "code") {
      parts.push({
        kind: "code",
        code: token.text,
        language: token.lang?.split(/\s/)[0] ?? "",
        markdown: token.raw.trim(),
      });
    } else {
      parts.push({ kind: token.type, markdown: token.raw.trim() });
    }
  }
  return parts.map((p, i) => ({
    ...p,
    complete: complete || i < parts.length - 1,
  }));
}
