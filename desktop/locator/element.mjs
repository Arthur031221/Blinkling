import { MAX_TEXT, kindOf, normalizeText } from "./kinds.mjs";

const CONTENT_KEYS = ["markdown", "code", "language", "latex", "mathml"];

const cleanContent = (content) => {
  if (!content || typeof content !== "object") return undefined;
  const out = {};
  for (const key of CONTENT_KEYS)
    if (typeof content[key] === "string" && content[key])
      out[key] = content[key].slice(0, MAX_TEXT);
  return Object.keys(out).length ? out : undefined;
};

/** One Element in the shape the interface promises. A secure field is reduced
 * here, at the single place every source builds elements, to a bare marker: it
 * keeps its id, bounds and window so a caller can lock on it, and nothing else. */
export function buildElement({
  source,
  windowId,
  n,
  bounds,
  role = "",
  tag,
  name = "",
  text = "",
  secure = false,
  content,
  window,
  display,
  kind,
}) {
  const id = `${source}:${windowId}:${n}`;
  const rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  if (secure)
    return {
      id,
      kind: "input",
      bounds: rect,
      role: "textbox",
      name: "",
      text: "",
      window,
      display,
      secure: true,
    };
  const element = {
    id,
    kind: kind ?? kindOf({ role, tag, name, text }),
    bounds: rect,
    role: String(role),
    name: normalizeText(name, 500),
    text: normalizeText(text),
    window,
    display,
  };
  const extra = cleanContent(content);
  if (extra) element.content = extra;
  return element;
}

export const isSecure = (element) => element?.secure === true;
