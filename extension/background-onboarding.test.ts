import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), locale: vi.fn() }));
vi.mock("./connection", () => ({
  connectWelcome: mocks.connect,
  saveWelcomeLocale: mocks.locale,
}));
type Listener = (
  message: Record<string, unknown>,
  sender: { tab?: { url?: string } },
  respond: (value: unknown) => void,
) => boolean;
let listener: Listener;
const createWindow = vi.fn();
const queryTabs = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.locale.mockReset().mockResolvedValue(undefined);
  createWindow.mockReset().mockResolvedValue({});
  queryTabs.mockReset().mockResolvedValue([]);
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: (callback: Listener) => (listener = callback) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    action: { onClicked: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: { query: queryTabs },
    windows: { create: createWindow },
  });
  await import("./background");
});
afterEach(() => vi.unstubAllGlobals());
const sender = { tab: { url: "http://127.0.0.1:37115/install" } };
describe("automatic welcome connection", () => {
  it("authenticates in the worker without opening a panel or saving an initial language", async () => {
    const respond = vi.fn();
    expect(
      listener(
        {
          type: "glimpselet:pair",
          port: 37115,
          code: "ABCDEF0123456789",
          locale: "zh-TW",
        },
        sender,
        respond,
      ),
    ).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(mocks.connect).toHaveBeenCalledWith(37115, "ABCDEF0123456789");
    expect(createWindow).not.toHaveBeenCalled();
    expect(mocks.locale).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "glimpselet:connection-updated",
    });
  });
  it("opens only after the bubble action and saves its chosen language", async () => {
    const respond = vi.fn();
    listener(
      { type: "glimpselet:open-bubble", locale: "zh-TW" },
      sender,
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(mocks.locale).toHaveBeenCalledWith("zh-TW");
    expect(createWindow.mock.calls[0][0].url).toBe(
      "chrome-extension://test/panel.html",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("reports a failed handshake without opening a window", async () => {
    mocks.connect.mockRejectedValue(new Error("Expired"));
    const respond = vi.fn();
    listener(
      { type: "glimpselet:pair", port: 37115, code: "ABCDEF0123456789" },
      sender,
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false }));
    expect(createWindow).not.toHaveBeenCalled();
  });
  it.each([
    "https://127.0.0.1:37115/install",
    "http://example.com:37115/install",
    "http://127.0.0.1:37115/other",
    "http://127.0.0.1:37116/install",
    "http://user@127.0.0.1:37115/install",
    "invalid",
  ])("refuses pairing from %s", (url) => {
    const respond = vi.fn();
    expect(
      listener(
        { type: "glimpselet:pair", port: 37115, code: "ABCDEF0123456789" },
        { tab: { url } },
        respond,
      ),
    ).toBe(false);
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_pair_request",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([
    "https://127.0.0.1/install",
    "http://example.com/install",
    "http://localhost/other",
    "invalid",
  ])("refuses the bubble action from %s", (url) => {
    expect(
      listener({ type: "glimpselet:open-bubble" }, { tab: { url } }, vi.fn()),
    ).toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
  });
});
