// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/sessions.js";

describe("SessionStore lifecycle and retention", () => {
  it("expires sessions and invokes the expiry hook", () => {
    let now = 500;
    const expired: string[] = [];
    const store = new SessionStore(
      () => now,
      100,
      2,
      (session) => expired.push(session.id),
    );
    const first = store.create();
    const second = store.create();
    expect(store.get(first.id)).toBe(first);
    now = 600;
    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)).toBeUndefined();
    expect(expired).toEqual([first.id, second.id]);
    expect(store.create().expiresAt).toBe(700);
  });

  it("retains only the newest 100 answers and prunes answers older than ten minutes", () => {
    let now = 1_000_000;
    const store = new SessionStore(() => now);
    const session = store.create();
    const entry = (id: number, at = now) => ({
      id: String(id),
      at,
      question: `q${id}`,
      answer: `a${id}`,
      kind: "ask" as const,
    });
    for (let i = 0; i < 102; i++) store.append(session, entry(i));
    expect(session.entries).toHaveLength(100);
    expect(session.entries[0]!.id).toBe("2");
    now += 600_001;
    expect(store.get(session.id)!.entries).toHaveLength(0);
  });

  it("prunes expired entries during idle session pruning", () => {
    let now = 2_000_000;
    const store = new SessionStore(() => now);
    const session = store.create();
    store.append(session, {
      id: "old-note",
      at: now,
      question: "Observe",
      answer: "A saved passive note",
      kind: "passive",
    });
    now += 600_001;

    store.prune();

    expect(session.entries).toHaveLength(0);
    expect(store.get(session.id)).toBe(session);
  });

  it("does not reset rolling capture capacity when session history resets", async () => {
    const store = new SessionStore();
    const session = store.create();
    for (let i = 0; i < 30; i++)
      expect(session.captureLimiter.take(0)).toBe(true);
    await store.reset(session);
    expect(session.captureLimiter.take(1)).toBe(false);
    expect(session.captureLimiter.take(60_000)).toBe(true);
  });
});
