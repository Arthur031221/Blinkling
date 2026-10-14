import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn().mockResolvedValue(undefined);
let pair: (event: MessageEvent) => void;
let tutorial: (event: CustomEvent) => void;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "blinklingContentReady");
  history.replaceState(null, "", "/install");
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage,
    },
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
    if (type === "message") pair = listener as (event: MessageEvent) => void;
    if (type === "blinkling:tutorial-action")
      tutorial = listener as (event: CustomEvent) => void;
  });
  await import("./content");
  sendMessage.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "blinklingContentReady");
  history.replaceState(null, "", "/");
});

function request(
  fields: Record<string, unknown> = {},
  event: Partial<MessageEvent> = {},
) {
  pair({
    source: window,
    origin: location.origin,
    data: {
      type: "blinkling:pair",
      port: Number(location.port || 80),
      code: "ABCDEF0123456789",
      locale: "zh-TW",
      ...fields,
    },
    ...event,
  } as MessageEvent);
}

describe("localhost onboarding locale handoff", () => {
  it("forwards the validated language with pairing and practice requests", () => {
    request();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "blinkling:pair", locale: "zh-TW" }),
    );
    history.replaceState(null, "", "/assets/blinkling-welcome-sample.html");
    tutorial(
      new CustomEvent("blinkling:tutorial-action", {
        detail: { version: 1, action: "translate", step: 6, locale: "zh-TW" },
      }),
    );
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: "blinkling:tutorial",
      action: "translate",
      step: 6,
      locale: "zh-TW",
    });
  });

  it("strips unsupported language values without broadening pairing trust", () => {
    request({ locale: "constructor" });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ locale: undefined }),
    );
    sendMessage.mockClear();
    request({}, { source: null });
    request({}, { origin: "http://example.com" });
    request({ code: "invalid" });
    request({ port: 37115 });
    history.replaceState(null, "", "/other");
    request();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("retains practice version, action, step and sample-path validation", () => {
    history.replaceState(null, "", "/assets/blinkling-welcome-sample.html");
    for (const invalid of [
      { version: 2 },
      { action: "unsupported" },
      { step: 0 },
      { step: 9 },
      { step: 6.5 },
      { step: "6" },
    ])
      tutorial(
        new CustomEvent("blinkling:tutorial-action", {
          detail: {
            version: 1,
            action: "translate",
            step: 6,
            locale: "zh-TW",
            ...invalid,
          },
        }),
      );
    history.replaceState(null, "", "/install");
    tutorial(
      new CustomEvent("blinkling:tutorial-action", {
        detail: { version: 1, action: "translate", step: 6, locale: "zh-TW" },
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
