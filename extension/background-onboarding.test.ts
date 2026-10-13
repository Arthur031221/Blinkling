import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (
  message: Record<string, unknown>,
  sender: { tab?: { url?: string } },
  respond: (value: unknown) => void,
) => boolean;

let listener: Listener;
const createWindow = vi.fn().mockResolvedValue({});
const queryTabs = vi.fn().mockResolvedValue([]);
const updateTab = vi.fn().mockResolvedValue({});
const updateWindow = vi.fn().mockResolvedValue({});

beforeEach(async () => {
  vi.resetModules();
  createWindow.mockClear();
  queryTabs.mockReset().mockResolvedValue([]);
  updateTab.mockClear();
  updateWindow.mockClear();
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: (callback: Listener) => (listener = callback) },
    },
    action: { onClicked: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: { query: queryTabs, update: updateTab },
    windows: { create: createWindow, update: updateWindow },
  });
  await import("./background");
});

afterEach(() => vi.unstubAllGlobals());

describe("welcome pairing locale", () => {
  it.each(["en", "zh-TW"])(
    "passes validated %s into the consent window",
    async (locale) => {
      const respond = vi.fn();
      expect(
        listener(
          {
            type: "glimpselet:pair",
            port: 37115,
            code: "ABCDEF0123456789",
            locale,
          },
          { tab: { url: "http://127.0.0.1:37115/install" } },
          respond,
        ),
      ).toBe(true);
      await vi.waitFor(() =>
        expect(respond).toHaveBeenCalledWith({ ok: true }),
      );
      const target = new URL(createWindow.mock.calls[0][0].url);
      expect(target.searchParams.get("welcomeLocale")).toBe(locale);
      expect(target.searchParams.get("pairCode")).toBe("ABCDEF0123456789");
    },
  );

  it("passes the selected language when pairing reuses an existing panel", async () => {
    queryTabs.mockResolvedValue([{ id: 7, windowId: 8 }]);
    const respond = vi.fn();
    expect(
      listener(
        {
          type: "glimpselet:pair",
          port: 37115,
          code: "ABCDEF0123456789",
          locale: "zh-TW",
        },
        { tab: { url: "http://127.0.0.1:37115/install" } },
        respond,
      ),
    ).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(createWindow).not.toHaveBeenCalled();
    expect(updateTab).toHaveBeenCalledWith(7, {
      url: "chrome-extension://test/panel.html?pairPort=37115&pairCode=ABCDEF0123456789&welcomeLocale=zh-TW",
      active: true,
    });
    expect(updateWindow).toHaveBeenCalledWith(8, { focused: true });
  });

  it.each(["zh-CN", "zh", "constructor", "", undefined, { locale: "zh-TW" }])(
    "does not propagate unsupported locale %j",
    async (locale) => {
      const respond = vi.fn();
      listener(
        {
          type: "glimpselet:pair",
          port: 37115,
          code: "ABCDEF0123456789",
          locale,
        },
        { tab: { url: "http://localhost:37115/install" } },
        respond,
      );
      await vi.waitFor(() =>
        expect(respond).toHaveBeenCalledWith({ ok: true }),
      );
      expect(
        new URL(createWindow.mock.calls[0][0].url).searchParams.has(
          "welcomeLocale",
        ),
      ).toBe(false);
    },
  );

  it.each([
    "https://127.0.0.1:37115/install",
    "http://example.com:37115/install",
    "http://127.0.0.1:37115/other",
    "http://127.0.0.1:37116/install",
  ])("still refuses pairing from %s", (url) => {
    const respond = vi.fn();
    expect(
      listener(
        {
          type: "glimpselet:pair",
          port: 37115,
          code: "ABCDEF0123456789",
          locale: "zh-TW",
        },
        { tab: { url } },
        respond,
      ),
    ).toBe(false);
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_pair_request",
    });
    expect(createWindow).not.toHaveBeenCalled();
  });
});
