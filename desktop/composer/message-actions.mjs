import { timing } from "../shared/motion.mjs";
/** The small row under every message: when it was said and what can be done
 * with it. Built from plain data so the same row serves both roles. */
const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];
/** "6 hours ago" in the reader's language; under a minute is "now". */
export function relativeTime(at, now, locale) {
  const seconds = Math.round((at - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size)
      return format.format(Math.round(seconds / size), unit);
  return format.format(0, "second");
}
/** Refresh every time label under `root`, once a minute from the caller. */
export function refreshTimes(root, now, locale) {
  for (const n of root.querySelectorAll("[data-at]")) {
    const text = relativeTime(Number(n.dataset.at), now, locale);
    if (n.textContent !== text) n.textContent = text;
  }
}
/** What a message can be asked to do: answers get copy, ask again and read
 * aloud; the reader's own messages get a tick, copy and edit. */
export function actionsFor(message) {
  const text = (message.text ?? "").trim();
  const images = message.content.some((b) => b.type === "image");
  if (message.role === "user")
    return [...(text ? ["copy"] : []), ...(text || images ? ["edit"] : [])];
  const plain = message.plain || message.failure || message.offer;
  if (plain || !message.complete || !text) return [];
  return ["copy", "retry", "read"];
}
export function buildRow(
  doc,
  { message, tr, locale, now = Date.now(), busy = false, on },
) {
  const row = doc.createElement("div");
  row.className = "gl-message-meta";
  row.dataset.role = message.role;
  const made = (cls, text) => {
    const n = doc.createElement("span");
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const button = (id, label, handler) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "gl-meta-button";
    b.dataset.act = id;
    b.textContent = label;
    b.title = label;
    b.addEventListener("click", () => handler(b));
    return b;
  };
  const time = () => {
    if (!Number.isFinite(message.at)) return null;
    const t = made("gl-meta-time", relativeTime(message.at, now, locale));
    t.dataset.at = String(message.at);
    t.title = new Date(message.at).toLocaleString(locale);
    return t;
  };
  const flash = (b, label) => {
    const was = b.textContent;
    b.textContent = label;
    doc.defaultView.setTimeout(() => (b.textContent = was), timing.copiedHold);
  };
  const doCopy = async (b) => {
    try {
      await on.copy(message.text);
      flash(b, tr("copiedMark"));
    } catch {
      flash(b, tr("retry"));
    }
  };
  const acts = actionsFor(message);
  if (message.role === "user") {
    const t = time();
    if (t) row.append(t);
    const tick = made("gl-meta-tick", "✓");
    tick.title = tr("delivered");
    tick.setAttribute("aria-label", tr("delivered"));
    row.append(tick);
    if (acts.includes("copy"))
      row.append(button("copy", tr("copyMessage"), doCopy));
    if (acts.includes("edit"))
      row.append(button("edit", tr("editResend"), () => on.edit(message)));
  } else {
    if (acts.includes("copy"))
      row.append(button("copy", tr("copyAnswer"), doCopy));
    if (acts.includes("retry")) {
      const b = button("retry", tr("askAgain"), () => on.retry(message));
      b.disabled = busy;
      row.append(b);
    }
    if (acts.includes("read")) {
      const b = button("read", tr("readAloud"), async () => {
        const result = await on.read(message, (reading) => {
          b.textContent = tr(reading ? "stopReading" : "readAloud");
          b.dataset.reading = String(reading);
        });
        if (result === "unavailable") flash(b, tr("noVoice"));
      });
      row.append(b);
    }
    const t = time();
    if (t && acts.length) row.append(t);
  }
  return row.childElementCount ? row : null;
}
