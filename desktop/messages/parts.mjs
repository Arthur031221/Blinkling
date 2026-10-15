import { Marked } from "./vendor/marked.mjs";
export const markdown = new Marked({ gfm: true, breaks: true });

// Abbreviations whose period does not end a sentence (English and German).
const ABBREVIATION =
  /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|St|vs|bzw|ca|Nr|vgl|ggf|inkl|evtl|[zdu]|e\. ?g|i\. ?e|z\. ?B|d\. ?h|u\. ?a|o\. ?ä|s\. ?o|i\. ?d\. ?R)$/;

// Latin terminators only count before whitespace or the end, so URLs, versions and
// query strings stay in one piece. CJK terminators need no space after them.
const CJK_END = /[。！？]/u;
const LATIN_END = /[.!?]/;

// A Japanese quotation that closes right after a full stop usually ends the
// sentence ("He said 「終わり。」次へ。"), unless a particle carries the sentence on
// past it ("「ドキュメント。」を参照してください！"). No sentence starts with these.
const CJK_OPEN = /[「『]/u;
const CJK_CLOSE = /[」』]/u;
const CARRIES_ON =
  /^(?:に|を|は|が|の|も|へ|や|とは|と(?=[言思呼])|という|といった|として|など|について|から|まで|より)/u;

// Boundaries inside code, links or emphasis would break the Markdown delimiters.
function sentences(source) {
  const result = [];
  let start = 0,
    code = false,
    strong = false,
    linkDepth = 0,
    quote = 0;
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
    if (CJK_OPEN.test(c)) quote++;
    if (CJK_CLOSE.test(c) && quote) {
      quote--;
      if (
        !quote &&
        (CJK_END.test(source[i - 1] ?? "") ||
          LATIN_END.test(source[i - 1] ?? "")) &&
        !CARRIES_ON.test(source.slice(i + 1))
      ) {
        result.push(source.slice(start, i + 1).trim());
        start = i + 1;
      }
      continue;
    }
    // A full stop inside 「…」 belongs to the quotation.
    if (quote) continue;
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

// One bubble per sentence: a list item with several sentences is several
// bubbles, and only the first carries the marker. Nested lists are flattened.
function listParts(list, depth = 0) {
  return list.items.flatMap((item, index) => {
    let marker = list.ordered ? `${list.start + index}.` : depth ? "◦" : "•";
    return item.tokens.flatMap((token) => {
      if (token.type === "space") return [];
      if (token.type === "text" || token.type === "paragraph")
        return sentences(token.text.trim()).map((text) => {
          const point = { kind: "point", markdown: text, marker };
          marker = "";
          return point;
        });
      if (token.type === "list") return listParts(token, depth + 1);
      return blockParts(token);
    });
  });
}

function blockParts(token) {
  if (token.type === "space") return [];
  if (token.type === "paragraph")
    return sentences(token.raw.trim()).map((text) => ({
      kind: "sentence",
      markdown: text,
    }));
  if (token.type === "blockquote")
    return token.raw
      .trim()
      .split("\n")
      .flatMap((line) =>
        sentences(line.replace(/^\s*>\s?/, "")).map((text) => ({
          kind: "blockquote",
          markdown: `> ${text}`,
        })),
      );
  if (token.type === "list") return listParts(token);
  if (token.type === "code")
    return [
      {
        kind: "code",
        code: token.text,
        language: token.lang?.split(/\s/)[0] ?? "",
        markdown: token.raw.trim(),
      },
    ];
  return [{ kind: token.type, markdown: token.raw.trim() }];
}

export function bubbleParts(source, complete = false) {
  const parts = markdown.lexer(source).flatMap(blockParts);
  return parts.map((p, i) => ({
    ...p,
    complete: complete || i < parts.length - 1,
  }));
}
