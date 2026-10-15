/** One snapshot per key (a window), answered from memory. A read never waits
 * past `budget`: a fresh snapshot is returned, a stale one is returned and
 * refreshed behind the caller, a missing one is raced against the budget.
 *
 * Every invalidation starts a new generation for its key; a load that started
 * in an older generation is dropped when it lands, so a read begun before a
 * click can never overwrite what was read after it. */
export function createSnapshotCache({
  now = Date.now,
  ttl = 400,
  maxAge = 10_000,
  budget = 30,
} = {}) {
  const entries = new Map(); // key -> { value, at }
  const generations = new Map(); // key -> number
  const flights = new Map(); // key -> { generation, promise }

  const generation = (key) => generations.get(key) ?? 0;

  /** The shared load for this key and generation. Resolves true when stored. */
  function start(key, load) {
    const current = flights.get(key);
    if (current && current.generation === generation(key)) return current;
    const mine = generation(key);
    const flight = { generation: mine, promise: null };
    flight.promise = (async () => {
      try {
        const value = await load();
        if (generation(key) !== mine) return false;
        entries.set(key, { value, at: now() });
        return true;
      } catch {
        return false;
      } finally {
        if (flights.get(key) === flight) flights.delete(key);
      }
    })();
    flights.set(key, flight);
    return flight;
  }

  const waitFor = (flight, ms) => {
    let timer;
    const limit = new Promise((resolve) => {
      timer = setTimeout(() => resolve("late"), ms);
    });
    return Promise.race([flight.promise, limit]).finally(() =>
      clearTimeout(timer),
    );
  };

  async function settle(key, flight, ms) {
    const outcome = await waitFor(flight, ms);
    const entry = entries.get(key);
    if (outcome === true && entry && generation(key) === flight.generation)
      return { state: "fresh", value: entry.value };
    return { state: outcome === "late" ? "pending" : "failed", value: null };
  }

  return {
    get size() {
      return entries.size;
    },

    async read(key, load, options = {}) {
      const ms = options.budget ?? budget;
      const entry = entries.get(key);
      const age = entry ? now() - entry.at : Infinity;
      if (entry && age < ttl) return { state: "fresh", value: entry.value };
      if (entry && age < maxAge) {
        start(key, load);
        return { state: "stale", value: entry.value };
      }
      if (entry) entries.delete(key);
      return settle(key, start(key, load), ms);
    },

    /** Drops the snapshot and waits for a read that began after this call. It
     * never answers with the old snapshot: on timeout the value is null. */
    async refresh(key, load, { timeout = 250 } = {}) {
      this.invalidate(key);
      return settle(key, start(key, load), timeout);
    },

    invalidate(key) {
      const keys =
        key === undefined ? [...entries.keys(), ...flights.keys()] : [key];
      for (const k of keys) {
        generations.set(k, generation(k) + 1);
        entries.delete(k);
        flights.delete(k);
      }
    },

    forget(key) {
      this.invalidate(key);
    },
  };
}
