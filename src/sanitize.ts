import DOMPurify from "dompurify";
import { marked } from "marked";
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
    ],
    ALLOWED_ATTR: ["href", "title"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}
