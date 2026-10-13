import DOMPurify from "dompurify";
import { marked } from "marked";

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
  return DOMPurify.sanitize(marked.parse(source) as string, {
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
