import { attachNudge } from "./nudge.mjs";

/** Makes `handle` drag the panel's window through `api.nudge`. The panel starts
 * from the offset it was opened with: call `.opened(offset)` on every open. */
export function dragPanel(handle, api, { ignore } = {}) {
  let current = { x: 0, y: 0 };
  attachNudge(handle, {
    ignore,
    current: () => current,
    send: (value) => {
      if (value.reset) current = { x: 0, y: 0 };
      else current = { x: value.x, y: value.y };
      api.nudge(value);
    },
  });
  const opened = (offset) => {
    current = offset ? { x: offset.x, y: offset.y } : { x: 0, y: 0 };
  };
  // What the main process kept when a drag ended: the next drag starts there.
  api.onKept?.(opened);
  return { opened };
}
