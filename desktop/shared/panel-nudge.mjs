import {
  PANEL_NUDGE_MAX,
  PANEL_REACH,
  clampNudge,
  nudged,
} from "../main/placement.mjs";

/** Lets the reader move a panel (settings, welcome) anywhere in the work area.
 * The panel's page sends its drag on `channel`; this keeps the offset in
 * `nudges` under `key()` and calls `replace()` so the panel is placed again
 * with it.
 *
 * nudges: {get(key), set(key, offset, commit)}; ipc: {on(channel, fn)}
 * Returns `apply(bounds, area)`, `bounds` moved by the offset kept for the
 * panel. The offset kept is what fits on screen; the page hears it on
 * `${channel}-kept` when a drag ends. */
export function bindPanelNudge({ ipc, win, channel, key, nudges, replace }) {
  ipc.on(channel, (event, message) => {
    if (event?.sender !== win.webContents || !message) return;
    const next = message.reset
      ? { x: 0, y: 0 }
      : clampNudge(message, PANEL_NUDGE_MAX);
    nudges.set(key(), next, false);
    replace();
    if (!message.commit && !message.reset) return;
    // The end of a drag keeps what fits and tells the page, so the next drag
    // starts from where the window really is.
    const kept = nudges.get(key());
    nudges.set(key(), kept, true);
    if (!win.webContents.isDestroyed?.())
      win.webContents.send(`${channel}-kept`, kept);
  });
  return (bounds, area) => {
    const kept = nudges.get(key());
    const out = nudged(bounds, kept, area, PANEL_REACH, PANEL_NUDGE_MAX);
    const fits = { x: out.x - bounds.x, y: out.y - bounds.y };
    if (fits.x !== kept.x || fits.y !== kept.y) nudges.set(key(), fits, false);
    return out;
  };
}
