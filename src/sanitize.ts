import DOMPurify from "dompurify";
import { Marked } from "marked";

const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const punctuationAdjacentBold =
  /^\*\*([^*`\\<>\r\n]+\p{P})\*\*(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/u;
// Extend inline tokenization only for the observed CJK label form. Code,
// escapes, incomplete delimiters and ordinary Markdown stay with the parser.
const markdown = new Marked({
  extensions: [
    {
      name: "cjkStrong",
      level: "inline",
      start: (source) => source.indexOf("**"),
      tokenizer(source) {
        if (this.lexer.state.inRawBlock) return;
        const match = punctuationAdjacentBold.exec(source);
        if (!match || !cjk.test(match[1]) || /^\s/.test(match[1])) return;
        return {
          type: "strong",
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1]),
        };
      },
    },
  ],
});

const allowedURI = /^(?:https?:\/\/|mailto:|\/\/)/i;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") {
    node.removeAttribute("target");
    node.removeAttribute("rel");
    return;
  }
  const href = (node.getAttribute("href") || "")
    .replace(/[\t\n\r]/g, "")
    .trim();
  let url: URL | undefined;
  if (allowedURI.test(href)) {
    try {
      url = new URL(href, "https://glimpselet.invalid/");
    } catch {
      // Invalid destinations remain plain text.
    }
  }
  if (url) node.setAttribute("href", href);
  else node.removeAttribute("href");
  if (url?.protocol === "http:" || url?.protocol === "https:") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  } else {
    node.removeAttribute("target");
    node.removeAttribute("rel");
  }
});

export function safeMarkdown(source: string): string {
  return DOMPurify.sanitize(markdown.parse(source) as string, {
    ALLOWED_TAGS: [
      "p",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "code",
      "pre",
      "blockquote",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "br",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOWED_URI_REGEXP: allowedURI,
  });
}
