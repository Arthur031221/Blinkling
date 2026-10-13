import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskInput, PageContext } from "./api";
import en from "./locales/en.json";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  context: vi.fn(),
  sensitive: vi.fn(),
  capture: vi.fn(),
  root: undefined as Root | undefined,
}));
vi.mock("react-dom/client", async (original) => {
  const actual = await original<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      mocks.root = actual.createRoot(...args);
      return mocks.root;
    },
  };
});
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  BridgeClient: class extends EventTarget {
    token = "test-token";
    sessionId = "test-session";
    mode = "direct";
    project = "/tmp/project";
    models = [];
    ask = mocks.ask;
    load = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    cancelAndWait = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("./capture", () => ({
  getPageContext: mocks.context,
  isSensitivePage: mocks.sensitive,
  captureWeb: mocks.capture,
  getDocumentIdentity: vi.fn().mockResolvedValue(undefined),
  setCurrentActiveTab: vi.fn(),
}));

type Listener = (...args: unknown[]) => unknown;
function event() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    emit: (...args: unknown[]) => [...listeners].map((fn) => fn(...args)),
  };
}
const page: PageContext = {
  documentKey: "doc-1",
  url: "https://example.com/dashboards",
  title: "Dashboards",
  text: "Readable dashboard context",
  hasPassword: false,
  elements: [
    { id: "g1", role: "button", text: "Export", rect: [0, 0, 80, 30] },
  ],
};
let runtime: ReturnType<typeof event>;
let updated: ReturnType<typeof event>;
let sendToTab: ReturnType<typeof vi.fn>;
let stored: Record<string, unknown>;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  });
}
async function refresh() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(550);
  });
}
async function start() {
  await act(async () => {
    await import("./main");
  });
  await flush();
  await refresh();
  mocks.ask.mockClear();
}
function button(name: string) {
  const result = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent?.trim() === name);
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}
async function click(name: string) {
  await act(async () => button(name).click());
  await flush();
}
async function draft(value: string) {
  const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function send(message: Record<string, unknown>, url = page.url) {
  const response = vi.fn();
  await act(async () => {
    runtime.emit(message, { tab: { id: 1, url } }, response);
  });
  await flush();
  return response;
}
function status() {
  return document.querySelector(".toolbar .status")?.textContent;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  runtime = event();
  updated = event();
  sendToTab = vi.fn().mockResolvedValue({ ok: true });
  stored = { consented: true, locale: "en", targetLocale: "zh-TW" };
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: runtime,
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    },
    storage: {
      local: {
        get: vi.fn(async () => stored),
        set: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      get: vi.fn().mockResolvedValue({ id: 1, windowId: 1, url: page.url }),
      getCurrent: vi.fn().mockResolvedValue({ id: 2 }),
      query: vi.fn().mockResolvedValue([{ id: 1, windowId: 1, url: page.url }]),
      sendMessage: sendToTab,
      onActivated: event(),
      onUpdated: updated,
    },
    windows: { onFocusChanged: event() },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: true }]) },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
  });
  mocks.context.mockReset().mockResolvedValue(page);
  mocks.sensitive.mockReset().mockResolvedValue(false);
  mocks.capture.mockReset().mockResolvedValue({
    page,
    capture: { image: "data:image/png;base64,AAA=", label: "Visible" },
  });
  mocks.ask
    .mockReset()
    .mockImplementation(
      async (input: AskInput, delta: (text: string) => void) => {
        const answer =
          input.kind === "suggest"
            ? '{"questions":["What is this page?","Where is export?","Help me start"]}'
            : input.kind === "guide"
              ? '{"steps":[{"elementId":"g1","note":"Choose Export"}]}'
              : "Answer text";
        delta(answer);
        return { answer };
      },
    );
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(async () => {
  await act(async () => mocks.root?.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("bubble answer rendering and feedback", () => {
  it("clears a page warning after readable SPA context and suggestions arrive", async () => {
    mocks.sensitive.mockResolvedValue(true);
    await start();
    expect(status()).toBe(en.passwordPage);
    mocks.sensitive.mockResolvedValue(false);
    mocks.context.mockResolvedValue({
      ...page,
      documentKey: "doc-2",
      title: "New dashboards",
    });
    await act(async () => {
      updated.emit(1, { url: page.url }, { url: page.url });
    });
    await refresh();
    expect(document.querySelectorAll(".suggestions button")).toHaveLength(3);
    expect(status()).not.toBe(en.passwordPage);
  });
  it("retains a warning when the current page remains blocked", async () => {
    mocks.sensitive.mockResolvedValue(true);
    await start();
    await act(async () => {
      updated.emit(1, { url: page.url }, { url: page.url });
    });
    await refresh();
    expect(status()).toBe(en.passwordPage);
    expect(document.querySelectorAll(".suggestions button")).toHaveLength(0);
  });
  it("does not let a delayed page refresh erase a newer permission error", async () => {
    mocks.sensitive.mockResolvedValue(true);
    await start();
    let release!: (value: PageContext) => void;
    mocks.context.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    mocks.sensitive.mockResolvedValue(false);
    await act(async () => {
      updated.emit(1, { url: page.url }, { url: page.url });
    });
    await refresh();
    mocks.capture.mockRejectedValue(new Error("allow_site_access"));
    await click(en.visible);
    expect(status()).toBe(en.siteAccess);
    await act(async () => release(page));
    await flush();
    expect(status()).toBe(en.siteAccess);
  });
  it("explains how to retry Guide and preserves its practice step after a capture permission error", async () => {
    await start();
    await send(
      { type: "glimpselet:tutorial", action: "guide", step: 5 },
      "http://127.0.0.1/assets/glimpselet-welcome-sample.html",
    );
    mocks.capture.mockRejectedValue(new Error("capture_permission"));
    const guideControls = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((element) => element.textContent?.trim() === en.guideAction);
    expect(guideControls).toHaveLength(1);
    await click(en.guideAction);
    expect(status()).toMatch(/toolbar.*try Guide again/);
    expect(document.querySelector(".float-start p")?.textContent).toBeDefined();
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:tutorial-done",
      ),
    ).toBe(false);
    mocks.capture.mockResolvedValue({
      page,
      capture: { image: "data:image/png;base64,AAA=", label: "Visible" },
    });
    await click(en.guideAction);
    expect(
      sendToTab.mock.calls.some(
        ([, message]) =>
          message.type === "glimpselet:tutorial-done" && message.step === 5,
      ),
    ).toBe(true);
    expect(document.querySelector(".capture-buttons button")?.textContent).toBe(
      en.guideAction,
    );
  });
  it("gives Guide-specific toolbar recovery outside the tutorial too", async () => {
    await start();
    mocks.capture.mockRejectedValue(new Error("capture_permission"));
    await click(en.guideAction);
    expect(status()).toMatch(/toolbar.*try Guide again/);
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("offers the ordinary Guide control when practice is dismissed", async () => {
    await start();
    await send(
      { type: "glimpselet:tutorial", action: "guide", step: 5 },
      "http://127.0.0.1/assets/glimpselet-welcome-sample.html",
    );
    await click("Skip practice step");
    expect(document.querySelector(".capture-buttons button")?.textContent).toBe(
      en.guideAction,
    );
  });
  it("renders streaming and completed Markdown safely and preserves copy/pin text", async () => {
    await start();
    const answer =
      '**Key point**\n\n- First\n- Second\n\n```js\nconst value = 1;\n```\n\n[Source](https://example.com)\n\n<img src="https://tracker.invalid/pixel" onerror="alert(1)"><script>alert(1)</script>[bad](javascript:alert(1)) ![image](https://tracker.invalid/image)';
    let complete!: (result: { answer: string }) => void;
    mocks.ask.mockImplementation((_input, delta) => {
      delta(answer);
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    await send({
      type: "glimpselet:reader-action",
      action: "summary",
      context: page,
    });
    expect(document.querySelector(".answer strong")?.textContent).toBe(
      "Key point",
    );
    expect(document.querySelectorAll(".answer li")).toHaveLength(2);
    expect(document.querySelector(".answer pre code")?.textContent).toContain(
      "const value = 1;",
    );
    expect(document.querySelector(".answer a")?.getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(
      document.querySelector(
        ".answer img, .answer script, .answer [onerror], .answer a[href^='javascript:']",
      ),
    ).toBeNull();
    await act(async () => complete({ answer }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await click(en.copy);
    expect(writeText).toHaveBeenCalledWith(answer);
    await click(en.pin);
    expect(button(en.unpin)).toBeDefined();
    expect(document.querySelector(".answer strong")?.textContent).toBe(
      "Key point",
    );
  });
  it.each([undefined, "data:image/png;base64,AAA="])(
    "reports neutral completion with image=%s",
    async (image) => {
      await start();
      await send({
        type: "glimpselet:reader-action",
        action: "ask",
        text: "PDF passage",
        question: "Explain this",
        context: page,
        image,
      });
      expect(mocks.ask).toHaveBeenCalledTimes(1);
      expect(mocks.ask.mock.calls[0][0].image).toBe(image);
      expect(status()).toBe("Answer ready.");
    },
  );
});
