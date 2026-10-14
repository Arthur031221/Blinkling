/** Where the pointer is, in DIP.
 * On X11 Electron's screen.getCursorScreenPoint() goes stale while the pointer is
 * over another client's window, so hover never ends. XQueryPointer always answers.
 * Anything that goes wrong with it falls back to Electron's own point. */
export function createPointerSource({
  query = null,
  fallback,
  toDip = (point) => point,
  timeout = 100,
} = {}) {
  const valid = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  let last = null,
    source = query ? "x11" : "electron";
  async function fromQuery() {
    let timer;
    try {
      const point = await Promise.race([
        query(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("pointer query timed out")),
            timeout,
          );
        }),
      ]);
      const dip = valid(point) ? toDip(point) : null;
      return valid(dip) ? dip : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    get source() {
      return source;
    },
    get last() {
      return last;
    },
    async read() {
      const queried = query ? await fromQuery() : null;
      source = queried ? "x11" : "electron";
      last = queried ?? fallback();
      return last;
    },
  };
}
