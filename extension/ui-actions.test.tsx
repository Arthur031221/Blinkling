import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskInput, PageContext } from "./api";
import en from "./locales/en.json";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  context: vi.fn(),
  guide: vi.fn(),
  sensitive: vi.fn(),
  capture: vi.fn(),
  cancel: vi.fn(),
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
    send = vi.fn().mockResolvedValue(undefined);
    cancelAndWait = mocks.cancel;
  },
}));
vi.mock("./capture", () => ({
  getPageContext: mocks.context,
  getGuideContext: mocks.guide,
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
let views: ReturnType<typeof vi.fn>;

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
  views = vi.fn().mockReturnValue([]);
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
    extension: { getViews: views },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: true }]) },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
  });
  mocks.context.mockReset().mockResolvedValue(page);
  mocks.guide
    .mockReset()
    .mockResolvedValue({ ...page, guideScope: "top-document-text" });
  mocks.sensitive.mockReset().mockResolvedValue(false);
  mocks.capture.mockReset().mockResolvedValue({
    page,
    capture: { image: "data:image/png;base64,AAA=", label: "Visible" },
  });
  mocks.cancel.mockReset().mockResolvedValue(undefined);
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
  it.each(["translate", "summary-selection"])(
    "rejects invalid reader %s selections before disturbing a background request or draft",
    async (action) => {
      mocks.ask.mockImplementation(() => new Promise(() => {}));
      await start();
      await draft("Keep my next question");
      const originalStatus = status();
      for (const text of ["", " \n\t ", "x".repeat(5001)]) {
        const response = await send({
          type: "glimpselet:reader-action",
          action,
          text,
          context: { ...page, text: "Unrelated PDF context" },
        });
        expect(response).toHaveBeenCalledWith({
          ok: false,
          error: "selection_limit",
        });
        expect(mocks.ask).not.toHaveBeenCalled();
        expect(mocks.cancel).not.toHaveBeenCalled();
        expect(status()).toBe(originalStatus);
        expect(document.querySelector("textarea")?.value).toBe(
          "Keep my next question",
        );
      }
    },
  );
  it("admits a complete reader translation at the selection limit exactly once", async () => {
    await start();
    const text = "x".repeat(5000);
    const response = await send({
      type: "glimpselet:reader-action",
      action: "translate",
      text,
      context: page,
    });
    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.ask.mock.calls[0][0].question).toBe(
      `Translate this selected text into 繁體中文: ${text}`,
    );
  });
  it("hands off and resumes the existing chat in a reader-owned PiP without losing its thread, draft or attachment", async () => {
    await start();
    await send({
      type: "glimpselet:reader-action",
      action: "summary",
      context: page,
    });
    await click(en.visible);
    await draft("Keep this draft while allowing the PDF site");
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const floating = frame.contentWindow!;
    const close = vi.fn(() => floating.dispatchEvent(new Event("pagehide")));
    Object.defineProperty(floating, "close", {
      configurable: true,
      value: close,
    });
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ".app { color: black; }",
      }),
    );
    await click(en.float);
    expect(floating.document.querySelector("textarea")?.value).toContain(
      "Keep this draft",
    );
    const originalMessages =
      floating.document.querySelectorAll(".message").length;
    const handoffResponse = vi.fn();
    await act(async () =>
      runtime.emit(
        { type: "glimpselet:reader-permission-handoff" },
        {},
        handoffResponse,
      ),
    );
    await flush();
    expect(handoffResponse).toHaveBeenCalledWith({
      ok: true,
      interrupted: true,
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.querySelector("textarea")?.value).toContain(
      "Keep this draft",
    );
    expect(
      document.querySelector(".capture-chip img")?.getAttribute("src"),
    ).toBe("data:image/png;base64,AAA=");
    const resumedFrame = document.createElement("iframe");
    document.body.append(resumedFrame);
    const resumed = resumedFrame.contentWindow!;
    const readerUrl =
      "chrome-extension://test/reader.html?url=https%3A%2F%2Fexample.com%2Fpaper.pdf";
    views.mockReturnValue([
      {
        location: { href: readerUrl },
        documentPictureInPicture: { window: resumed },
      },
    ]);
    const response = await send(
      { type: "glimpselet:reader-resume-floating" },
      readerUrl,
    );
    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(views).toHaveBeenCalledWith({ type: "tab", tabId: 1 });
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(resumed.document.querySelector(".app.in-pip")).not.toBeNull();
    expect(resumed.document.querySelector("textarea")?.value).toContain(
      "Keep this draft",
    );
    expect(resumed.document.querySelectorAll(".message")).toHaveLength(
      originalMessages,
    );
    expect(
      resumed.document.querySelector(".capture-chip img")?.getAttribute("src"),
    ).toBe("data:image/png;base64,AAA=");
    expect(resumed.document.head.querySelector("style")?.textContent).toContain(
      ".app",
    );
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    await act(async () => resumed.dispatchEvent(new Event("pagehide")));
    await flush();
    expect(document.querySelector("textarea")?.value).toContain(
      "Keep this draft",
    );
    expect(document.querySelectorAll(".message")).toHaveLength(
      originalMessages,
    );
  });
  it("leaves reader permission coordination to the background before acknowledging", async () => {
    await start();
    const response = await send(
      { type: "glimpselet:reader-permission-handoff" },
      "chrome-extension://test/reader.html",
    );
    expect(response).not.toHaveBeenCalled();
    const forwardedResponse = vi.fn();
    await act(async () =>
      runtime.emit(
        { type: "glimpselet:reader-permission-handoff" },
        {},
        forwardedResponse,
      ),
    );
    expect(forwardedResponse).toHaveBeenCalledWith({
      ok: true,
      interrupted: false,
    });
  });
  it.each([page.url, "chrome-extension://test/reader.html?url=another"])(
    "rejects reader PiP adoption from an unrelated sender %s",
    async (url) => {
      await start();
      const frame = document.createElement("iframe");
      document.body.append(frame);
      views.mockReturnValue([
        {
          location: { href: "chrome-extension://test/reader.html" },
          documentPictureInPicture: { window: frame.contentWindow },
        },
      ]);
      const response = await send(
        { type: "glimpselet:reader-resume-floating" },
        url,
      );
      expect(response).toHaveBeenCalledWith({ ok: false });
      expect(document.querySelector(".app.in-pip")).toBeNull();
      expect(frame.contentDocument?.querySelector(".app")).toBeNull();
    },
  );
  it.each(["summary", "translate"])(
    "submits a reader %s once without leaving its instruction in the draft",
    async (action) => {
      await start();
      const response = await send({
        type: "glimpselet:reader-action",
        action,
        text: "Selected Transformer passage",
        context: page,
      });
      expect(response).toHaveBeenCalledWith({ ok: true });
      expect(mocks.ask).toHaveBeenCalledTimes(1);
      expect(document.querySelector("textarea")?.value).toBe("");
      const input = mocks.ask.mock.calls[0][0];
      if (action === "translate") {
        expect(input.question).toContain("繁體中文");
        expect(input.question).toContain("Selected Transformer passage");
      }
      expect(
        document.querySelector(".message .question")?.textContent,
      ).toContain(input.question);
    },
  );
  it("submits automatic selection actions but keeps Ask editable", async () => {
    await start();
    await send({
      type: "glimpselet:selection",
      action: "explain",
      text: "Selected passage",
    });
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(document.querySelector("textarea")?.value).toBe("");
    mocks.ask.mockClear();
    await send({
      type: "glimpselet:selection",
      action: "ask",
      text: "Editable selection",
    });
    expect(document.querySelector("textarea")?.value).toBe(
      "Editable selection",
    );
    expect(mocks.ask).not.toHaveBeenCalled();
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".composer .send")!.click();
    });
    await flush();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(document.querySelector("textarea")?.value).toBe("");
  });
  it("keeps the reader Ask action editable until the user sends it", async () => {
    await start();
    const response = await send({
      type: "glimpselet:reader-action",
      action: "ask",
      question: "Help me understand this selected passage.",
      text: "Selected PDF passage",
      context: page,
    });
    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(document.querySelector("textarea")?.value).toContain(
      "Selected PDF passage",
    );
    expect(mocks.ask).not.toHaveBeenCalled();
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".composer .send")!.click();
    });
    await flush();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(document.querySelector("textarea")?.value).toBe("");
  });
  it("disables web capture controls during streaming and enables capture after completion", async () => {
    await start();
    let complete!: (result: { answer: string }) => void;
    mocks.ask.mockImplementation((_input, delta) => {
      delta("**Still streaming**");
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    await send({
      type: "glimpselet:reader-action",
      action: "summary",
      context: page,
    });
    for (const name of [en.visible, en.fullPage, en.element])
      expect(button(name).disabled).toBe(true);
    await act(async () => complete({ answer: "Finished answer" }));
    await flush();
    for (const name of [en.visible, en.fullPage, en.element])
      expect(button(name).disabled).toBe(false);
    await click(en.visible);
    expect(document.querySelector(".capture-chip img")).not.toBeNull();
  });
  it.each([false, true])(
    "preserves a newer typed draft after late automatic success/rejection=%s",
    async (reject) => {
      await start();
      let complete!: (result: { answer: string }) => void;
      let fail!: (error: Error) => void;
      mocks.ask.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            complete = resolve;
            fail = reject;
          }),
      );
      await send({
        type: "glimpselet:reader-action",
        action: "translate",
        text: "Selected passage",
        context: page,
      });
      await draft("A new question I am writing");
      await act(async () =>
        reject
          ? fail(new Error("bridge_disconnected"))
          : complete({ answer: "Translation" }),
      );
      await flush();
      expect(document.querySelector("textarea")?.value).toBe(
        "A new question I am writing",
      );
      expect(mocks.ask).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps the current draft on a busy reader rejection", async () => {
    await start();
    mocks.ask.mockImplementation(() => new Promise(() => {}));
    await send({
      type: "glimpselet:reader-action",
      action: "summary",
      context: page,
    });
    await draft("Do not lose this draft");
    const response = await send({
      type: "glimpselet:reader-action",
      action: "translate",
      text: "Another passage",
      context: page,
    });
    expect(response).toHaveBeenCalledWith({ ok: false, error: "busy" });
    expect(document.querySelector("textarea")?.value).toBe(
      "Do not lose this draft",
    );
    expect(mocks.ask).toHaveBeenCalledTimes(1);
  });
  it("keeps a rejected automatic request editable when no newer draft exists", async () => {
    await start();
    mocks.ask.mockRejectedValue(new Error("bridge_disconnected"));
    await send({
      type: "glimpselet:reader-action",
      action: "translate",
      text: "Selected passage",
      context: page,
    });
    expect(document.querySelector("textarea")?.value).toContain(
      "Selected passage",
    );
    expect(status()).toBe(en.bridgeLost);
  });
  it.each(["summary-selection", "translate"])(
    "explicitly scopes reader %s to its selected text without an unrelated image or section",
    async (action) => {
      await start();
      await click(en.visible);
      expect(document.querySelector(".capture-chip img")).not.toBeNull();
      await send({
        type: "glimpselet:reader-action",
        action,
        text: "Transformer introduction",
        context: {
          ...page,
          text: "Transformer introduction. UNRELATED_SECTION",
        },
        image: "data:image/png;base64,AAA=",
      });
      expect(mocks.ask).toHaveBeenCalledTimes(1);
      const input = mocks.ask.mock.calls[0][0];
      expect(input.question).toMatch(
        action === "summary-selection"
          ? /Summarize only this selected PDF passage/
          : /Translate this selected text/,
      );
      expect(input.question).toContain("Transformer introduction");
      expect(input.page.text).toBe("Transformer introduction");
      expect(input.image).toBeUndefined();
      expect(document.querySelector("textarea")?.value).toBe("");
    },
  );
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
  it("uses explicit guide text without attaching the previous screenshot or seeding automatic context", async () => {
    await start();
    await click(en.visible);
    mocks.capture.mockClear();
    const guidePage = {
      ...page,
      text: "Safe top document only",
      guideScope: "top-document-text",
    };
    mocks.guide.mockResolvedValue(guidePage);
    await click(en.guideAction);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.ask.mock.calls[0][0]).toMatchObject({
      kind: "guide",
      page: guidePage,
    });
    expect(mocks.ask.mock.calls[0][0].image).toBeUndefined();
    const overlay = sendToTab.mock.calls.find(
      ([, message]) => message.type === "glimpselet:guide",
    )?.[1];
    expect(overlay.labels).toEqual({
      next: en.next,
      back: en.back,
      close: en.guideClose,
      done: en.guideDone,
      title: en.guideAction,
    });
  });
  it("rechecks the guide document before dispatch and discards a navigation", async () => {
    await start();
    mocks.guide
      .mockResolvedValueOnce({ ...page, guideScope: "top-document-text" })
      .mockResolvedValueOnce({ ...page, guideScope: "top-document-text" })
      .mockRejectedValueOnce(new Error("tab_changed"));
    await click(en.guideAction);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(status()).toBe(en.tabChanged);
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:guide",
      ),
    ).toBe(false);
  });
  it("explains how to retry Guide and preserves its practice step after a capture permission error", async () => {
    await start();
    await send(
      { type: "glimpselet:tutorial", action: "guide", step: 5 },
      "http://127.0.0.1/assets/glimpselet-welcome-sample.html",
    );
    mocks.guide.mockRejectedValue(new Error("capture_permission"));
    const guideControls = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((element) => element.textContent?.trim() === en.guideAction);
    expect(guideControls).toHaveLength(1);
    expect(
      [...document.querySelectorAll(".float-start button")].at(-1)?.textContent,
    ).toBe(en.guideAction);
    expect(
      [...document.querySelectorAll(".float-start")].at(-1)?.textContent,
    ).toContain(en.guideCapturePermission);
    await click(en.guideAction);
    expect(status()).toMatch(/toolbar.*try Guide again/);
    expect(document.querySelector(".float-start p")?.textContent).toBeDefined();
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:tutorial-done",
      ),
    ).toBe(false);
    mocks.guide.mockResolvedValue({ ...page, guideScope: "top-document-text" });
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
    mocks.guide.mockRejectedValue(new Error("capture_permission"));
    await click(en.guideAction);
    expect(status()).toMatch(/toolbar.*try Guide again/);
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("keeps Guide practice open when the page rejects the guide overlay", async () => {
    await start();
    await send(
      { type: "glimpselet:tutorial", action: "guide", step: 5 },
      "http://127.0.0.1/assets/glimpselet-welcome-sample.html",
    );
    sendToTab.mockImplementation(async (_tab, message) => ({
      ok: message.type !== "glimpselet:guide",
    }));
    await click(en.guideAction);
    expect(status()).toBe(en.guideFailed);
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:tutorial-done",
      ),
    ).toBe(false);
    expect(
      [...document.querySelectorAll(".float-start")].at(-1)?.textContent,
    ).toContain("5/8");
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
        action: "summary",
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
