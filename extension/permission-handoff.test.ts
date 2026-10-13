import { describe, expect, it, vi } from "vitest";
import { prepareReaderPermissionHandoff } from "./permission-handoff";

describe("reader permission handoff", () => {
  it("finishes the missing-origin handoff before the caller can request permission", async () => {
    const events: string[] = [];
    const prepared = await prepareReaderPermissionHandoff(
      ["https://arxiv.org/*"],
      async ({ origins }) => {
        events.push(`contains:${origins[0]}`);
        return false;
      },
      async () => {
        events.push("handoff:start");
        await Promise.resolve();
        events.push("handoff:done");
        return { ok: true };
      },
    );

    expect(prepared).toBe("prepared");
    events.push("permission.request");
    expect(events).toEqual([
      "contains:https://arxiv.org/*",
      "handoff:start",
      "handoff:done",
      "permission.request",
    ]);
  });

  it("does not hand off when permission already exists", async () => {
    const handoff = vi.fn();
    const prepared = await prepareReaderPermissionHandoff(
      ["https://arxiv.org/*"],
      async () => true,
      handoff,
    );

    expect(prepared).toBe("granted");
    expect(handoff).not.toHaveBeenCalled();
  });

  it("propagates handoff failures so callers can show a retry state", async () => {
    const failure = new Error("panel did not respond");
    await expect(
      prepareReaderPermissionHandoff(
        ["https://arxiv.org/*"],
        async () => false,
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
  });

  it.each([undefined, { ok: false }])(
    "rejects an unconfirmed handoff: %j",
    async (response) => {
      await expect(
        prepareReaderPermissionHandoff(
          ["https://arxiv.org/*"],
          async () => false,
          async () => response,
        ),
      ).rejects.toThrow("reader_handoff_unconfirmed");
    },
  );
});
