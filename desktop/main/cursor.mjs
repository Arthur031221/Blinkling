/** The pointer for the 16 ms hover poll. Electron's getCursorScreenPoint goes
 * stale on X11 while the pointer is over another client's window, so a native
 * query (XQueryPointer) is preferred. The query is asynchronous: one request is
 * kept in flight and its latest answer is read synchronously by the poll. */
export function cursorSource({
  query,
  fallback,
  toDip = (point) => point,
  clock = () => performance.now(),
  staleMs = 250,
}) {
  let latest = null,
    down = null,
    at = -Infinity,
    inflight = false;
  const refresh = () => {
    if (!query || inflight) return;
    inflight = true;
    let pending;
    try {
      pending = Promise.resolve(query());
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending
      .then(
        (point) => {
          latest = point ?? null;
          down = typeof point?.down === "boolean" ? point.down : null;
          at = clock();
        },
        () => {
          latest = null;
          down = null;
        },
      )
      .finally(() => {
        inflight = false;
      });
  };
  return {
    /** Where the last answer came from: the native query or Electron. */
    get source() {
      return latest && clock() - at <= staleMs ? "x11" : "electron";
    },
    /** Whether the primary button is down, or null where nothing native says. */
    pressed() {
      return latest && clock() - at <= staleMs ? down : null;
    },
    point() {
      refresh();
      return latest && clock() - at <= staleMs
        ? toDip({ x: latest.x, y: latest.y })
        : fallback();
    },
  };
}
