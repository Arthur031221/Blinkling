import { clampNudge, nudged } from "../main/placement.mjs";

/** Lets the reader move a panel (settings, welcome, the quick-ask box) a little
 * way from where it opens, the way the chat card moves. The panel's page sends
 * its drag on `channel`; this keeps the offset in `nudges` under `key()` and
 * calls `replace()` so the panel is placed again with it.
 *
 * nudges: {get(key), set(key, offset, commit)}; ipc: {on(channel, fn)}
 * Returns `apply(bounds, area)`, `bounds` moved by the offset kept for the panel. */
export function bindPanelNudge({ ipc, win, channel, key, nudges, replace }) {
  ipc.on(channel, (event, message) => {
    if (event?.sender !== win.webContents || !message) return;
    const next = message.reset ? { x: 0, y: 0 } : clampNudge(message);
    nudges.set(key(), next, Boolean(message.commit || message.reset));
    replace();
  });
  return (bounds, area) => nudged(bounds, nudges.get(key()), area);
}
