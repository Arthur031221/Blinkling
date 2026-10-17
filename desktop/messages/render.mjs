import { Marked } from "./vendor/marked.mjs";
import { translatorFor } from "./strings.mjs";
import { highlight } from "./highlight.mjs";
import { timing } from "../shared/motion.mjs";
const markdown = new Marked({ gfm: true, breaks: true });
export const imageURL = (image) => {
  const source = image.source ?? {
    media_type: image.mediaType,
    data: image.data,
    type: "base64",
  };
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      source.media_type,
    ) ||
    source.type !== "base64" ||
    typeof source.data !== "string" ||
    source.data.length > 28 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/=]+$/.test(source.data)
  )
    return null;
  return `data:${source.media_type};base64,${source.data}`;
};
const decode = (text) =>
  text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_, v) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[v] ??
      String.fromCodePoint(
        Math.min(
          0x10ffff,
          parseInt(
            v.slice(v[1]?.toLowerCase() === "x" ? 2 : 1),
            v[1]?.toLowerCase() === "x" ? 16 : 10,
          ) || 0xfffd,
        ),
      ),
  );
/** `[[n:elementId|label]]` and `[[n:box:x,y,w,h|label]]` point at the page. The
 * model writes them inline; the reader sees only the number. Each reference is
 * swapped for one private-use character before Markdown runs, so no lexer rule
 * can split it, and swapped back into a badge afterwards. */
const REFERENCE = /\[\[(\d{1,3}):([^|\]\n]+)\|([^\]\n]*)\]\]/g;
const UNFINISHED_REFERENCE = /\[\[\d{0,3}(?::[^\]\n]*)?$/;
const MARK = 0xe000;
export function extractReferences(source) {
  const references = [];
  const text = source
    .replace(REFERENCE, (raw, n, ref, label) => {
      references.push({ raw, n: Number(n), ref: ref.trim(), label });
      return String.fromCodePoint(MARK + references.length - 1);
    })
    .replace(UNFINISHED_REFERENCE, ""); // a streaming reference stays hidden until closed
  return { text, references };
}
const el = (doc, tag, cls) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
/** The runtime's raw interrupt markers are not something a person wrote. */
const INTERRUPT = /^\s*\[Request interrupted by user(?: for tool use)?\]\s*$/;
/** "簡答" is model-written; explain it where it appears instead of leaving a bare label. */
function tagSummary(doc, root, t) {
  const lead = root.firstElementChild?.firstElementChild;
  if (
    lead?.tagName !== "STRONG" ||
    !/^簡答[：:]?$/.test(lead.textContent.trim())
  )
    return;
  const tag = el(doc, "span", "gl-summary-tag");
  tag.textContent = lead.textContent;
  tag.title = t("briefTag");
  lead.replaceWith(tag);
}
export function renderMarkdown(
  doc,
  source,
  {
    copy = (text) => doc.defaultView.navigator.clipboard.writeText(text),
    openLink,
    t: tr = translatorFor(doc),
  } = {},
) {
  const root = el(doc, "div", "gl-markdown");
  const extracted = extractReferences(source);
  const restore = (text) =>
    text.replace(
      /[\ue000-\uf8ff]/g,
      (c) => extracted.references[c.codePointAt(0) - MARK]?.raw ?? c,
    );
  function words(parent, text) {
    for (const piece of text.split(/([\ue000-\uf8ff])/)) {
      const reference = extracted.references[piece.codePointAt(0) - MARK];
      if (piece.length === 1 && reference) {
        const badge = el(doc, "button", "gl-ref");
        badge.type = "button";
        badge.dataset.ref = reference.ref;
        badge.textContent = String(reference.n);
        badge.title = reference.label;
        badge.setAttribute(
          "aria-label",
          tr("reference", { n: reference.n, label: reference.label }),
        );
        parent.append(badge);
      } else if (piece) parent.append(doc.createTextNode(decode(piece)));
    }
  }
  function inline(parent, tokens = []) {
    for (const t of tokens) {
      if (["strong", "em", "del"].includes(t.type)) {
        const n = el(doc, { strong: "strong", em: "em", del: "s" }[t.type]);
        inline(n, t.tokens);
        parent.append(n);
      } else if (t.type === "codespan") {
        const n = el(doc, "code");
        n.textContent = restore(decode(t.text));
        parent.append(n);
      } else if (t.type === "br") parent.append(el(doc, "br"));
      else if (t.type === "link") {
        let valid = false;
        try {
          valid = ["https:", "http:", "mailto:"].includes(
            new URL(t.href).protocol,
          );
        } catch {
          /* Render malformed links as text. */
        }
        const n = el(doc, valid ? "a" : "span");
        inline(n, t.tokens);
        if (valid) {
          n.href = t.href;
          n.rel = "noopener noreferrer";
          n.addEventListener("click", (e) => {
            e.preventDefault();
            openLink?.(t.href);
          });
        }
        parent.append(n);
      } else if (t.type === "image") {
        const n = el(doc, "span", "gl-image-label");
        n.textContent = t.text || tr("image");
        parent.append(n);
      } else if (t.tokens) inline(parent, t.tokens);
      else words(parent, t.text ?? t.raw ?? "");
    }
  }
  function blocks(parent, tokens) {
    for (const t of tokens) {
      if (t.type === "space") continue;
      if (t.type === "code") {
        const wrap = el(doc, "div", "gl-code"),
          toolbar = el(doc, "div", "gl-code-toolbar"),
          label = el(doc, "span"),
          button = el(doc, "button"),
          pre = el(doc, "pre"),
          code = el(doc, "code");
        label.textContent = t.lang?.split(/\s/)[0] ?? "";
        button.type = "button";
        button.textContent = tr("copy");
        button.setAttribute("aria-label", tr("copyCode"));
        button.addEventListener("click", async () => {
          try {
            await copy(restore(t.text));
            button.textContent = tr("copied");
          } catch {
            button.textContent = tr("retry");
          }
          doc.defaultView.setTimeout(
            () => (button.textContent = tr("copy")),
            timing.copiedHold,
          );
        });
        for (const [type, piece] of highlight(restore(t.text), t.lang)) {
          if (type === "plain") code.append(doc.createTextNode(piece));
          else {
            const span = el(doc, "span", `gl-tok-${type}`);
            span.textContent = piece;
            code.append(span);
          }
        }
        if (t.lang) wrap.dataset.lang = t.lang.split(/\s/)[0];
        pre.append(code);
        toolbar.append(label, button);
        wrap.append(toolbar, pre);
        parent.append(wrap);
      } else if (t.type === "list") {
        const n = el(doc, t.ordered ? "ol" : "ul");
        if (t.ordered) n.start = t.start;
        for (const item of t.items) {
          const li = el(doc, "li");
          if (item.task) {
            const check = el(doc, "input");
            check.type = "checkbox";
            check.disabled = true;
            check.checked = item.checked;
            li.append(check);
          }
          blocks(li, item.tokens);
          n.append(li);
        }
        parent.append(n);
      } else if (t.type === "table") {
        const wrap = el(doc, "div", "gl-table"),
          table = el(doc, "table"),
          head = el(doc, "thead"),
          body = el(doc, "tbody"),
          tr = el(doc, "tr");
        for (const cell of t.header) {
          const th = el(doc, "th");
          if (cell.align) th.style.textAlign = cell.align;
          inline(th, cell.tokens);
          tr.append(th);
        }
        head.append(tr);
        for (const row of t.rows) {
          const r = el(doc, "tr");
          for (const cell of row) {
            const td = el(doc, "td");
            if (cell.align) td.style.textAlign = cell.align;
            inline(td, cell.tokens);
            r.append(td);
          }
          body.append(r);
        }
        table.append(head, body);
        wrap.append(table);
        parent.append(wrap);
      } else if (t.type === "blockquote") {
        const n = el(doc, "blockquote");
        blocks(n, t.tokens);
        parent.append(n);
      } else if (t.type === "hr") parent.append(el(doc, "hr"));
      else if (t.type === "html") {
        parent.append(doc.createTextNode(restore(t.text)));
      } else {
        const n = el(
          doc,
          t.type === "heading" ? `h${Math.min(4, t.depth)}` : "p",
        );
        inline(n, t.tokens ?? [{ type: "text", text: t.text ?? t.raw }]);
        parent.append(n);
      }
    }
  }
  source = extracted.text;
  if (INTERRUPT.test(source)) {
    const line = el(doc, "p", "gl-system-line");
    line.textContent = tr("stopped");
    root.append(line);
    return root;
  }
  blocks(root, markdown.lexer(source));
  tagSummary(doc, root, tr);
  return root;
}
export function renderImage(doc, image, t = translatorFor(doc)) {
  const url = imageURL(image);
  if (!url) return null;
  const n = el(doc, "img", "gl-message-image");
  n.src = url;
  n.alt = image.name || t("attachedImage");
  return n;
}
export function renderDocument(doc, document, t = translatorFor(doc)) {
  const n = el(doc, "div", "gl-document");
  n.textContent = `📎 ${document.title || t("attachedFile")}`;
  return n;
}
