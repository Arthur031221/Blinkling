import { describe, expect, it, vi } from "vitest";
import {
  parseTranslation,
  restoreTab,
  translateTab,
  translationPrompt,
} from "./translate";

const signal = () => new AbortController().signal;

describe("page translation", () => {
  it("asks for exactly as many strings as it sends", () => {
    const prompt = translationPrompt("fr", ["a", "b"]);
    expect(prompt).toContain('"fr"');
    expect(prompt).toContain("exactly 2 strings");
    expect(prompt).toContain('["a","b"]');
  });

  it("accepts an array wrapped in prose and rejects wrong counts or types", () => {
    expect(parseTranslation('Here: ["x","y"]', 2)).toEqual(["x", "y"]);
    expect(parseTranslation('["x"]', 2)).toBeUndefined();
    expect(parseTranslation("[1,2]", 2)).toBeUndefined();
    expect(parseTranslation("nothing", 1)).toBeUndefined();
  });

  it("translates every batch of nodes and writes each back", async () => {
    const page = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "blinkling:text-nodes")
        return message.cursor === 0
          ? { nodes: [{ id: "t1", text: "Hello" }], nextCursor: 1 }
          : { nodes: [{ id: "t2", text: "World" }] };
      return { applied: 1 };
    });
    const ask = vi.fn(async (prompt: string) =>
      prompt.includes("Hello") ? '["Bonjour"]' : '["Monde"]',
    );
    expect(await translateTab({ page, ask, language: "fr" }, signal())).toBe(
      true,
    );
    const writes = page.mock.calls
      .map(([m]) => m)
      .filter((m) => m.type === "blinkling:translate");
    expect(writes).toEqual([
      { type: "blinkling:translate", nodes: [{ id: "t1", text: "Bonjour" }] },
      { type: "blinkling:translate", nodes: [{ id: "t2", text: "Monde" }] },
    ]);
  });

  it("fails without writing when the page holds a password or the answer is unusable", async () => {
    const blocked = vi.fn(async () => ({ error: "password_page" }));
    expect(
      await translateTab(
        { page: blocked, ask: vi.fn(), language: "fr" },
        signal(),
      ),
    ).toBe(false);
    const page = vi.fn(async () => ({ nodes: [{ id: "t1", text: "Hi" }] }));
    expect(
      await translateTab(
        { page, ask: async () => "sorry", language: "fr" },
        signal(),
      ),
    ).toBe(false);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("stops when cancelled between batches", async () => {
    const controller = new AbortController();
    const page = vi.fn(async () => ({
      nodes: [{ id: "t1", text: "Hi" }],
      nextCursor: 1,
    }));
    const ask = vi.fn(async () => {
      controller.abort();
      return '["Salut"]';
    });
    expect(
      await translateTab({ page, ask, language: "fr" }, controller.signal),
    ).toBe(false);
    expect(
      page.mock.calls.filter(([m]) => m.type === "blinkling:translate"),
    ).toHaveLength(0);
  });

  it("restores the originals", async () => {
    const page = vi.fn(async () => ({ restored: 3 }));
    expect(await restoreTab({ page, ask: vi.fn(), language: "fr" })).toBe(true);
    expect(page).toHaveBeenCalledWith({ type: "blinkling:restore" });
  });
});
