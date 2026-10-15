import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotCache } from "./cache.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const clock = (start = 1000) => {
  const c = { at: start, now: () => c.at, tick: (ms) => (c.at += ms) };
  return c;
};
const tick = () => new Promise((r) => setImmediate(r));

test("a miss loads, answers within the budget and is fresh afterwards", async () => {
  const c = clock();
  const cache = createSnapshotCache({ now: c.now, ttl: 100, budget: 50 });
  let loads = 0;
  const load = async () => (loads++, { n: loads });
  assert.deepEqual(await cache.read("w", load), {
    state: "fresh",
    value: { n: 1 },
  });
  assert.deepEqual(await cache.read("w", load), {
    state: "fresh",
    value: { n: 1 },
  });
  assert.equal(loads, 1);
});

test("a slow first read answers pending at the budget and lands in the cache", async () => {
  const c = clock();
  const cache = createSnapshotCache({ now: c.now, ttl: 100, budget: 5 });
  const gate = deferred();
  const first = await cache.read("w", () => gate.promise);
  assert.deepEqual(first, { state: "pending", value: null });
  gate.resolve({ n: 1 });
  await tick();
  assert.deepEqual(await cache.read("w", () => assert.fail("no reload")), {
    state: "fresh",
    value: { n: 1 },
  });
});

test("a stale snapshot is answered at once and refreshed in the background", async () => {
  const c = clock();
  const cache = createSnapshotCache({ now: c.now, ttl: 100, budget: 5 });
  await cache.read("w", async () => ({ n: 1 }));
  c.tick(500);
  const gate = deferred();
  const stale = await cache.read("w", () => gate.promise);
  assert.deepEqual(stale, { state: "stale", value: { n: 1 } });
  gate.resolve({ n: 2 });
  await tick();
  assert.deepEqual(await cache.read("w", () => assert.fail("no reload")), {
    state: "fresh",
    value: { n: 2 },
  });
});

test("concurrent reads share one load", async () => {
  const cache = createSnapshotCache({ ttl: 100, budget: 20 });
  let loads = 0;
  const gate = deferred();
  const load = () => (loads++, gate.promise);
  const all = Promise.all([
    cache.read("w", load),
    cache.read("w", load),
    cache.read("w", load),
  ]);
  gate.resolve({ n: 1 });
  const results = await all;
  assert.equal(loads, 1);
  assert.ok(results.every((r) => r.value.n === 1));
});

test("a snapshot past the hard age is not served stale", async () => {
  const c = clock();
  const cache = createSnapshotCache({
    now: c.now,
    ttl: 100,
    maxAge: 1000,
    budget: 5,
  });
  await cache.read("w", async () => ({ n: 1 }));
  c.tick(5000);
  const gate = deferred();
  assert.deepEqual(await cache.read("w", () => gate.promise), {
    state: "pending",
    value: null,
  });
});

test("invalidate drops the snapshot", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 20 });
  let loads = 0;
  const load = async () => ({ n: ++loads });
  await cache.read("w", load);
  cache.invalidate("w");
  assert.equal((await cache.read("w", load)).value.n, 2);
});

test("invalidate with no key drops every window", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 20 });
  let loads = 0;
  const load = async () => ({ n: ++loads });
  await cache.read("a", load);
  await cache.read("b", load);
  cache.invalidate();
  await cache.read("a", load);
  await cache.read("b", load);
  assert.equal(loads, 4);
});

test("a load that was already running when invalidate came is discarded", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 5 });
  const old = deferred();
  await cache.read("w", () => old.promise);
  cache.invalidate("w");
  const fresh = await cache.read("w", async () => ({ n: 2 }));
  assert.equal(fresh.value.n, 2);
  old.resolve({ n: 1 }); // the old read lands late and must not win
  await tick();
  assert.equal(
    (await cache.read("w", () => assert.fail("no reload"))).value.n,
    2,
  );
});

test("refresh invalidates and waits for a fresh read", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 5 });
  await cache.read("w", async () => ({ n: 1 }));
  const gate = deferred();
  const pending = cache.refresh("w", () => gate.promise, { timeout: 200 });
  gate.resolve({ n: 2 });
  assert.deepEqual(await pending, { state: "fresh", value: { n: 2 } });
});

test("refresh gives up at the timeout and never returns the old snapshot", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 5 });
  await cache.read("w", async () => ({ n: 1 }));
  const gate = deferred();
  const out = await cache.refresh("w", () => gate.promise, { timeout: 10 });
  assert.deepEqual(out, { state: "pending", value: null });
});

test("a failing load is not cached and does not throw", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 20 });
  const bad = await cache.read("w", async () => {
    throw new Error("boom");
  });
  assert.deepEqual(bad, { state: "failed", value: null });
  assert.equal((await cache.read("w", async () => ({ n: 1 }))).value.n, 1);
});

test("a failing refresh keeps serving the stale snapshot", async () => {
  const c = clock();
  const cache = createSnapshotCache({ now: c.now, ttl: 100, budget: 5 });
  await cache.read("w", async () => ({ n: 1 }));
  c.tick(500);
  const stale = await cache.read("w", async () => {
    throw new Error("boom");
  });
  assert.equal(stale.state, "stale");
  await tick();
  assert.equal((await cache.read("w", async () => ({ n: 9 }))).value.n, 1);
});

test("forget removes a window that is gone", async () => {
  const cache = createSnapshotCache({ ttl: 1e6, budget: 20 });
  await cache.read("w", async () => ({ n: 1 }));
  assert.equal(cache.size, 1);
  cache.forget("w");
  assert.equal(cache.size, 0);
});
