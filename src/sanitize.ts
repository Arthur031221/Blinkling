import DOMPurify from "dompurify";
import { marked } from "marked";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") {
    node.removeAttribute("target");
    node.removeAttribute("rel");
    return;
  }
  if (/^(?:https?:)?\/\//i.test(node.getAttribute("href") || "")) {
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
      "br",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|\/\/)/i,
  });
}
