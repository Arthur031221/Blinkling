// Stale-while-revalidate cache for the element lists of windows. Hovering must
// answer in 50 ms, a cold accessibility walk takes longer, so a list that is a
// little old is served at once and refreshed behind the caller.

const FRESH_MS = 1500;
const STALE_MS = 30_000;

export function createCache({
  now = Date.now,
  ttl = FRESH_MS,
  staleTtl = STALE_MS,
} = {}) {
  const entries = new Map(); // key -> { signature, value, at }
  const loading = new Map(); // key -> { promise, signature, token }
  let generation = 0;

  const alive = (entry, signature) =>
    entry && entry.signature === signature && now() - entry.at < staleTtl;

  function start(key, signature, load) {
    const token = ++generation;
    let started;
    try {
      started = Promise.resolve(load());
    } catch (error) {
      started = Promise.reject(error);
    }
    const promise = started
      .catch(() => null)
      .then((value) => {
        const slot = loading.get(key);
        // invalidate() or a newer load took over: this result is outdated.
        if (slot?.token === token) {
          loading.delete(key);
          entries.set(key, { signature, value, at: now() });
        }
        return value;
      });
    loading.set(key, { promise, signature, token });
    return promise;
  }

  return {
    // -> { status: "fresh" | "stale" | "loaded" | "pending", value }
    async fetch(key, signature, load, { wait } = {}) {
      const entry = entries.get(key);
      if (alive(entry, signature)) {
        if (now() - entry.at < ttl)
          return { status: "fresh", value: entry.value };
        const running = loading.get(key);
        if (!running || running.signature !== signature)
          start(key, signature, load);
        return { status: "stale", value: entry.value };
      }
      if (entry) entries.delete(key);
      let running = loading.get(key);
      if (!running || running.signature !== signature) {
        start(key, signature, load);
        running = loading.get(key);
      }
      const promise = running.promise;
      if (wait === undefined) return { status: "loaded", value: await promise };
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(PENDING), wait);
      });
      const value = await Promise.race([promise, timeout]);
      clearTimeout(timer);
      return value === PENDING
        ? { status: "pending", value: undefined }
        : { status: "loaded", value };
    },
    peek(key, signature) {
      const entry = entries.get(key);
      return entry && (signature === undefined || entry.signature === signature)
        ? entry
        : undefined;
    },
    // Waits for the load in flight for a key (tests and shutdown).
    async settled(key) {
      await loading.get(key)?.promise;
    },
    invalidate(key) {
      if (key === undefined) {
        entries.clear();
        loading.clear();
      } else {
        entries.delete(key);
        loading.delete(key);
      }
    },
    // Forgets windows that are no longer on screen.
    prune(keep) {
      for (const key of [...entries.keys()])
        if (!keep.has(key)) entries.delete(key);
      for (const key of [...loading.keys()])
        if (!keep.has(key)) loading.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}

const PENDING = Symbol("pending");
