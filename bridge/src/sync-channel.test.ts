import { describe, expect, it } from "vitest";
import { mirrorLines, textOf } from "./sync-channel.js";

const say = (id: string, role: string, text: string, origin?: string) => ({
  type: "message",
  id,
  role,
  ...(origin ? { origin } : {}),
  content: [{ type: "text", text }],
});

describe("mirroring Blink's chat to the terminal", () => {
  it("sends what was typed at once and the answer when it is done", () => {
    const next = mirrorLines();
    expect(next(say("u", "user", "hi"))).toEqual([
      { id: "u", role: "user", text: "hi" },
    ]);
    expect(next(say("a", "assistant", "He"))).toEqual([]);
    expect(next(say("a", "assistant", "Hello"))).toEqual([]);
    expect(next({ type: "done", turnId: "u" })).toEqual([
      { id: "a", role: "assistant", text: "Hello" },
    ]);
    expect(next({ type: "done", turnId: "u" })).toEqual([]);
  });
  it("sends a message once even when Blink replays it", () => {
    const next = mirrorLines();
    expect(next(say("u", "user", "hi"))).toHaveLength(1);
    expect(next(say("u", "user", "hi"))).toEqual([]);
  });
  it("never sends a terminal line back to the terminal", () => {
    const next = mirrorLines();
    expect(next(say("t", "user", "from the terminal", "terminal"))).toEqual([]);
    expect(next(say("t2", "assistant", "answer", "terminal"))).toEqual([]);
    expect(next({ type: "done", turnId: "t" })).toEqual([]);
  });
  it("names a picture and keeps the text, and caps a long message", () => {
    expect(textOf([{ type: "text", text: "look" }, { type: "image" }])).toBe(
      "look\n[picture]",
    );
    expect(textOf([{ type: "text", text: "x".repeat(20000) }])).toHaveLength(
      8000,
    );
    expect(textOf(undefined)).toBe("");
  });
});

describe("the command offered to the person", () => {
  it("is the documented flag naming this plugin, and the note carries it", async () => {
    const { SYNC_COMMAND, SYNC_NOTE } = await import("./sync-channel.js");
    expect(SYNC_COMMAND).toBe(
      "claude --dangerously-load-development-channels plugin:blinkling@blinkling",
    );
    expect(SYNC_NOTE).toContain(SYNC_COMMAND);
  });
});
