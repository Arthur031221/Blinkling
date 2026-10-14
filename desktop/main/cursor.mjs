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
          at = clock();
        },
        () => {
          latest = null;
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
    point() {
      refresh();
      return latest && clock() - at <= staleMs ? toDip(latest) : fallback();
    },
  };
}
