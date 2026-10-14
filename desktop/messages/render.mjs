import { markdown } from "./parts.mjs";
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
const el = (doc, tag, cls) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
export function renderMarkdown(
  doc,
  source,
  {
    copy = (text) => doc.defaultView.navigator.clipboard.writeText(text),
    openLink,
  } = {},
) {
  const root = el(doc, "div", "gl-markdown");
  function inline(parent, tokens = []) {
    for (const t of tokens) {
      if (["strong", "em", "del"].includes(t.type)) {
        const n = el(doc, { strong: "strong", em: "em", del: "s" }[t.type]);
        inline(n, t.tokens);
        parent.append(n);
      } else if (t.type === "codespan") {
        const n = el(doc, "code");
        n.textContent = decode(t.text);
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
        n.textContent = t.text || "圖片";
        parent.append(n);
      } else if (t.tokens) inline(parent, t.tokens);
      else parent.append(doc.createTextNode(decode(t.text ?? t.raw ?? "")));
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
        button.textContent = "複製";
        button.setAttribute("aria-label", "複製程式碼");
        button.addEventListener("click", async () => {
          try {
            await copy(t.text);
            button.textContent = "已複製";
          } catch {
            button.textContent = "請再試一次";
          }
        });
        code.textContent = t.text;
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
          inline(th, cell.tokens);
          tr.append(th);
        }
        head.append(tr);
        for (const row of t.rows) {
          const r = el(doc, "tr");
          for (const cell of row) {
            const td = el(doc, "td");
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
        parent.append(doc.createTextNode(t.text));
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
  blocks(root, markdown.lexer(source));
  return root;
}
export function renderImage(doc, image) {
  const url = imageURL(image);
  if (!url) return null;
  const n = el(doc, "img", "gl-message-image");
  n.src = url;
  n.alt = image.name || "附件圖片";
  return n;
}
export function renderDocument(doc, document) {
  const n = el(doc, "div", "gl-document");
  n.textContent = `📎 ${document.title || "附件檔案"}`;
  return n;
}
