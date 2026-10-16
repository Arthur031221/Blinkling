import { describe, expect, it } from "vitest";
import {
  SYNC_COMMAND,
  SYNC_INSTRUCTIONS,
  channelFlagged,
  channelNotification,
  syncIdentity,
  syncNote,
} from "./sync-channel.js";

describe("telling whether Claude Code was started with the channel", () => {
  it("sees the development flag naming this plugin", () => {
    expect(
      channelFlagged(
        "claude\0--dangerously-load-development-channels\0plugin:blinkling@blinkling\0",
      ),
    ).toBe(true);
    expect(channelFlagged(SYNC_COMMAND)).toBe(true);
  });
  it("sees the plain channels flag too", () => {
    expect(channelFlagged("claude --channels plugin:blinkling@blinkling")).toBe(
      true,
    );
  });
  it("does not take another plugin's channel, or no flag, for ours", () => {
    expect(
      channelFlagged(
        "claude --dangerously-load-development-channels plugin:other@market",
      ),
    ).toBe(false);
    expect(channelFlagged("claude --resume abc")).toBe(false);
    expect(channelFlagged("")).toBe(false);
  });
});

describe("what Blink sends a linked session", () => {
  it("is a question with its turn, and a notice with its kind", () => {
    expect(
      channelNotification({ type: "turn", turn: "t-1", text: "what is this?" }),
    ).toEqual({
      content: "what is this?",
      meta: { kind: "question", turn: "t-1" },
    });
    expect(
      channelNotification({ type: "notice", text: "Blink was closed." }),
    ).toEqual({ content: "Blink was closed.", meta: { kind: "notice" } });
  });
  it("carries only identifier characters in its meta and drops empty frames", () => {
    expect(
      channelNotification({ type: "turn", turn: 'a"b c', text: "x" })?.meta
        .turn,
    ).toBe("abc");
    expect(channelNotification({ type: "turn", text: "  " })).toBeUndefined();
    expect(channelNotification({ type: "other", text: "x" })).toBeUndefined();
  });
});

describe("naming the session that loaded the server", () => {
  it("uses the ids Claude Code puts in the environment", () => {
    const read = (pid: number) =>
      pid === 4242
        ? "claude --dangerously-load-development-channels plugin:blinkling@blinkling"
        : "";
    expect(
      syncIdentity(
        {
          CLAUDE_CODE_SESSION_ID: "abc-123",
          CLAUDE_PROJECT_DIR: "/work/alpha",
        },
        4242,
        read,
      ),
    ).toEqual({
      session: "abc-123",
      pid: 4242,
      cwd: "/work/alpha",
      channel: true,
    });
  });
  it("reads the parent process, never a CLAUDE_PID that an outer Claude Code left in the environment", () => {
    // A Claude Code started inside another one inherits the outer one's pid.
    const read = (pid: number) =>
      pid === 1111
        ? "claude --dangerously-load-development-channels plugin:blinkling@blinkling"
        : "claude";
    const identity = syncIdentity(
      { CLAUDE_PID: "1111", CLAUDE_CODE_SESSION_ID: "inner" },
      2222,
      read,
    );
    expect(identity.pid).toBe(2222);
    expect(identity.channel).toBe(false);
  });
  it("falls back to the parent process and says no channel when the command is unreadable", () => {
    const identity = syncIdentity({}, 77, () => "");
    expect(identity.pid).toBe(77);
    expect(identity.session).toBe("pid-77");
    expect(identity.channel).toBe(false);
  });
});

describe("what the person and Claude are told", () => {
  it("names the documented command, by whether the session took the channel", () => {
    expect(SYNC_COMMAND).toBe(
      "claude --dangerously-load-development-channels plugin:blinkling@blinkling",
    );
    expect(syncNote(false)).toContain(SYNC_COMMAND);
    expect(syncNote(true)).not.toContain(SYNC_COMMAND);
  });
  it("tells Claude to answer through the reply tool and to show notices in one line", () => {
    expect(SYNC_INSTRUCTIONS).toMatch(/blinkling_reply/);
    expect(SYNC_INSTRUCTIONS).toMatch(/blinkling_chat_images/);
    expect(SYNC_INSTRUCTIONS).toMatch(/notice/);
    expect(SYNC_INSTRUCTIONS).toMatch(/one short line/);
  });
});
