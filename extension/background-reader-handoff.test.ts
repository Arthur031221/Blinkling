import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (
  message: { type: string },
  sender: { tab: { id: number; url: string } },
  respond: (value: unknown) => void,
) => boolean;
let listener: Listener;
let panels: ReturnType<typeof vi.fn>;
let handoff: ReturnType<typeof vi.fn>;
let owner: ReturnType<typeof vi.fn>;
let update: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  panels = vi.fn().mockResolvedValue([{ id: 7, windowId: 9 }]);
  handoff = vi.fn().mockResolvedValue({ ok: true, interrupted: false });
  owner = vi.fn().mockResolvedValue({ type: "normal", state: "normal" });
  update = vi.fn().mockResolvedValue(undefined);
  const event = () => ({ addListener: vi.fn() });
  vi.stubGlobal("chrome", {
    action: { onClicked: event() },
    commands: { onCommand: event() },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onInstalled: event(),
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn;
        },
      },
      sendMessage: handoff,
    },
    tabs: { query: panels },
    windows: { get: owner, update },
  });
  await import("./background");
});
afterEach(() => vi.unstubAllGlobals());

async function prepare() {
  const respond = vi.fn();
  expect(
    listener(
      { type: "glimpselet:reader-permission-handoff" },
      { tab: { id: 1, url: "chrome-extension://test/reader.html?url=paper" } },
      respond,
    ),
  ).toBe(true);
  for (let i = 0; i < 15; i++) await Promise.resolve();
  return respond;
}

describe("reader permission background coordination", () => {
  it.each([
    "https://example.com/reader.html",
    "chrome-extension://test/reader.html-other",
    "chrome-extension://test/reader.html/nested",
    "chrome-extension://another/reader.html",
  ])("rejects a permission handoff from an unrelated document %s", (url) => {
    const respond = vi.fn();
    expect(
      listener(
        { type: "glimpselet:reader-permission-handoff" },
        { tab: { id: 1, url } },
        respond,
      ),
    ).toBe(false);
    expect(panels).not.toHaveBeenCalled();
    expect(handoff).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("reports no interruption when no chat panel exists", async () => {
    panels.mockResolvedValue([]);
    const respond = await prepare();
    expect(respond).toHaveBeenCalledWith({ ok: true, interrupted: false });
    expect(handoff).not.toHaveBeenCalled();
  });
  it("propagates a closed floating chat after the panel acknowledges", async () => {
    handoff.mockResolvedValue({ ok: true, interrupted: true });
    const respond = await prepare();
    expect(respond).toHaveBeenCalledWith({ ok: true, interrupted: true });
    expect(update).not.toHaveBeenCalled();
  });
  it("waits for popup minimization and reports that interruption too", async () => {
    owner.mockResolvedValue({ type: "popup", state: "normal" });
    let finish!: () => void;
    update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const respond = await prepare();
    expect(respond).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(9, { state: "minimized" });
    finish();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(respond).toHaveBeenCalledWith({ ok: true, interrupted: true });
  });
  it("preserves the closed PiP recovery when popup minimization fails", async () => {
    handoff.mockResolvedValue({ ok: true, interrupted: true });
    owner.mockResolvedValue({ type: "popup", state: "normal" });
    update.mockRejectedValue(new Error("Panel window disappeared"));
    const respond = await prepare();
    expect(respond).toHaveBeenCalledWith({ ok: false, interrupted: true });
  });
  it("does not grant a handoff when the panel fails to acknowledge", async () => {
    handoff.mockResolvedValue(undefined);
    const respond = await prepare();
    expect(respond).toHaveBeenCalledWith({ ok: false });
    expect(owner).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
