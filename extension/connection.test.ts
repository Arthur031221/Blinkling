import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectWelcome, saveToken, storedCredentials } from "./connection";

let store: Record<string, unknown>;
beforeEach(() => {
  store = {};
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.filter((k) => k in store).map((k) => [k, store[k]]),
          ),
        ),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        }),
      },
    },
  };
});

const code = "0123456789ABCDEF";
describe("connectWelcome", () => {
  it("pairs once with the code from the local install page", async () => {
    const open = vi.fn(async () => {});
    await connectWelcome({ open }, 4711, code);
    expect(open).toHaveBeenCalledWith({
      url: "ws://127.0.0.1:4711/extension",
      code,
    });
    await connectWelcome({ open }, 4711, code);
    expect(open).toHaveBeenCalledOnce();
  });

  it("shares one attempt between concurrent calls", async () => {
    let release!: () => void;
    const open = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const a = connectWelcome({ open }, 9, code);
    const b = connectWelcome({ open }, 9, code);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    release();
    await Promise.all([a, b]);
    expect(open).toHaveBeenCalledOnce();
  });

  it("does not remember a failed pairing", async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection_failed"))
      .mockResolvedValue(undefined);
    await expect(connectWelcome({ open }, 9, code)).rejects.toThrow(
      "connection_failed",
    );
    await connectWelcome({ open }, 9, code);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it.each([
    [0, code],
    [70000, code],
    [1.5, code],
    [4711, "short"],
    [4711, code.toLowerCase()],
  ])("refuses port %s with code %s", async (port, bad) => {
    const open = vi.fn();
    await expect(connectWelcome({ open }, port, bad)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("stored credentials", () => {
  it("round trips a valid token and ignores a malformed one", async () => {
    expect(await storedCredentials()).toBeUndefined();
    await saveToken("ws://127.0.0.1:1/extension", "b".repeat(64));
    expect(await storedCredentials()).toEqual({
      url: "ws://127.0.0.1:1/extension",
      token: "b".repeat(64),
    });
    store.bridgeToken = "nope";
    expect(await storedCredentials()).toBeUndefined();
  });
});
