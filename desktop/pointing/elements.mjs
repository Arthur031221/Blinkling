/** What the model is told about the screen so it can point at things (M3). */
const SKIP = new Set(["page", "window", "titlebar", "section"]);
const flat = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const clip = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** One `'<id> <kind> <name/text>'` line per element worth pointing at: visible,
 * not a secure field, not a container. Capped so a busy page stays a small
 * prompt; the first `limit` elements in the locator's reading order win. */
export function elementsForPrompt(elements, { limit = 60, width = 70 } = {}) {
  const lines = [];
  for (const el of elements ?? []) {
    if (lines.length >= limit) break;
    if (!el?.id || !el.kind || SKIP.has(el.kind) || el.secure) continue;
    if (!(el.bounds?.width > 0) || !(el.bounds?.height > 0)) continue;
    const label = clip(flat(el.name || el.text), width);
    lines.push(`${el.id} ${el.kind}${label ? ` ${label}` : ""}`);
  }
  return lines;
}

const OPEN = "<pointing-elements>";
const CLOSE = "</pointing-elements>";
const BLOCK = /\s*<pointing-elements>[\s\S]*?<\/pointing-elements>/g;

/** The block appended to a screen question. The reference syntax is the one
 * the bubbles already render as numbered badges (messages/render.mjs). */
export function pointingInstructions(lines) {
  if (!lines.length) return "";
  return [
    "",
    OPEN,
    "Elements on the screen, one per line as `id kind name`:",
    ...lines,
    "",
    "When your answer refers to one of these, keep its name in the sentence and",
    "put [[n:id|short label]] right after that name, numbering from 1 in the",
    "order you mention them, e.g. the address bar [[1:" +
      lines[0].split(" ")[0] +
      "|address bar]]. A mark shows as a small number, so the sentence must read",
    "well without it: never write a mark in place of a name. Use only ids from the list.",
    "If nothing in the list fits, you may use a pixel box of the screenshot:",
    "[[n:box:x,y,width,height|label]]. Do not mention this syntax to the user.",
    CLOSE,
  ].join("\n");
}

/** The user's own bubble shows what they typed, not the instructions that
 * rode along with it. */
export function hidePointing(event) {
  if (event?.type !== "message" || event.role !== "user") return event;
  if (!Array.isArray(event.content)) return event;
  return {
    ...event,
    content: event.content.map((block) =>
      block?.type === "text" && block.text.includes(OPEN)
        ? { ...block, text: block.text.replace(BLOCK, "") }
        : block,
    ),
  };
}
