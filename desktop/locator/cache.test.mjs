import test from "node:test";
import assert from "node:assert/strict";
import { createCache } from "./cache.mjs";

const clock = (start = 1000) => {
  const state = { t: start };
  return { now: () => state.t, advance: (ms) => (state.t += ms), state };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test("a fresh entry is served without loading again", async () => {
  const { now } = clock();
  const cache = createCache({ now, ttl: 1500 });
  let loads = 0;
  const load = async () => ++loads;
  assert.deepEqual(await cache.fetch("w", "sig", load), {
    status: "loaded",
    value: 1,
  });
  assert.deepEqual(await cache.fetch("w", "sig", load), {
    status: "fresh",
    value: 1,
  });
  assert.equal(loads, 1);
});

test("a stale entry is served at once and refreshed behind the caller", async () => {
  const c = clock();
  const cache = createCache({ now: c.now, ttl: 1000, staleTtl: 20_000 });
  let n = 0;
  const gate = deferred();
  const load = async () => {
    n++;
    if (n === 2) await gate.promise;
    return n;
  };
  await cache.fetch("w", "s", load);
  c.advance(5000);
  const stale = await cache.fetch("w", "s", load);
  assert.deepEqual(stale, { status: "stale", value: 1 });
  assert.equal(n, 2, "the refresh started");
  // A second hover while it refreshes does not start another.
  await cache.fetch("w", "s", load);
  assert.equal(n, 2);
  gate.resolve();
  await cache.settled("w");
  assert.deepEqual(await cache.fetch("w", "s", load), {
    status: "fresh",
    value: 2,
  });
});

test("past the stale limit the entry is gone and the caller waits", async () => {
  const c = clock();
  const cache = createCache({ now: c.now, ttl: 1000, staleTtl: 5000 });
  let n = 0;
  const load = async () => ++n;
  await cache.fetch("w", "s", load);
  c.advance(6000);
  assert.deepEqual(await cache.fetch("w", "s", load), {
    status: "loaded",
    value: 2,
  });
});

test("a changed signature (the window moved or retitled) invalidates", async () => {
  const { now } = clock();
  const cache = createCache({ now });
  let n = 0;
  const load = async () => ++n;
  await cache.fetch("w", "0,0,10,10|A", load);
  const moved = await cache.fetch("w", "5,0,10,10|A", load);
  assert.deepEqual(moved, { status: "loaded", value: 2 });
  const retitled = await cache.fetch("w", "5,0,10,10|B", load);
  assert.deepEqual(retitled, { status: "loaded", value: 3 });
});

test("invalidate drops one key or all, and discards a load still in flight", async () => {
  const { now } = clock();
  const cache = createCache({ now });
  const gate = deferred();
  const slow = async () => {
    await gate.promise;
    return "old";
  };
  const pending = cache.fetch("w", "s", slow, { wait: 5 });
  assert.equal((await pending).status, "pending");
  cache.invalidate("w");
  gate.resolve();
  await cache.settled("w");
  assert.equal(
    cache.peek("w", "s"),
    undefined,
    "the stale result was not stored",
  );
  await cache.fetch("a", "s", async () => 1);
  await cache.fetch("b", "s", async () => 2);
  cache.invalidate();
  assert.equal(cache.size, 0);
});

test("a loader that takes longer than wait reports pending and still fills the cache", async () => {
  const { now } = clock();
  const cache = createCache({ now });
  const gate = deferred();
  const first = await cache.fetch(
    "w",
    "s",
    async () => {
      await gate.promise;
      return "late";
    },
    { wait: 10 },
  );
  assert.deepEqual(first, { status: "pending", value: undefined });
  gate.resolve();
  await cache.settled("w");
  assert.deepEqual(await cache.fetch("w", "s", async () => "never"), {
    status: "fresh",
    value: "late",
  });
});

test("a loader that throws settles as nothing, not as an error", async () => {
  const { now } = clock();
  const cache = createCache({ now });
  const result = await cache.fetch("w", "s", async () => {
    throw new Error("boom");
  });
  assert.deepEqual(result, { status: "loaded", value: null });
});

test("prune forgets windows that are gone", async () => {
  const { now } = clock();
  const cache = createCache({ now });
  await cache.fetch("a", "s", async () => 1);
  await cache.fetch("b", "s", async () => 2);
  cache.prune(new Set(["b"]));
  assert.equal(cache.peek("a", "s"), undefined);
  assert.equal(cache.peek("b", "s")?.value, 2);
});
