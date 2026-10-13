import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateAsk, type AskInput, type PageContext } from "./api";
import en from "./locales/en.json";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  context: vi.fn(),
  guide: vi.fn(),
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
  mocks.guide
    .mockReset()
    .mockResolvedValue({ ...page, guideScope: "top-document-text" });
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
  it("shows an unavailable guide reason and clears previous highlights without completing practice", async () => {
    await start();
    await send(
      { type: "glimpselet:tutorial", action: "guide", step: 5 },
      "http://127.0.0.1/assets/glimpselet-welcome-sample.html",
    );
    const reason =
      "I cannot reliably identify the export menu from these controls.";
    mocks.ask.mockResolvedValue({
      answer: JSON.stringify({
        status: "unavailable",
        reason,
        steps: [{ elementId: "g1", note: "Unrelated control", action: "none" }],
      }),
    });
    await click(en.guideAction);
    expect(document.querySelector(".message .answer")?.textContent).toContain(
      reason,
    );
    expect(status()).toBe(en.answerReady);
    expect(
      sendToTab.mock.calls
        .filter(([, message]) => message.type === "glimpselet:guide")
        .map(([, message]) => message),
    ).toEqual([
      {
        type: "glimpselet:guide",
        steps: [],
        documentKey: page.documentKey,
        url: page.url,
      },
    ]);
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:tutorial-done",
      ),
    ).toBe(false);
  });

  const inlineSources = [
    { id: "t20", text: "検証可能" },
    { id: "t21", text: "な" },
    { id: "t22", text: "参考文献や出典" },
  ];
  const inlineTranslations = [
    { id: "t20", text: "verifiable " },
    { id: "t21", omit: true },
    { id: "t22", text: "references or sources" },
  ];
  function translationSource(nodes = inlineSources) {
    sendToTab.mockImplementation(async (_tab, message) => {
      if (message.type === "glimpselet:text-nodes") return { nodes };
      if (message.type === "glimpselet:translate")
        return {
          applied: message.nodes.length,
          changed: message.nodes.length,
          rejected: 0,
          skipped: { disconnected: 0, sourceChanged: 0, ineligible: 0 },
        };
      return { ok: true };
    });
  }

  function boundedTranslationProvider() {
    mocks.ask.mockImplementation(async (input: AskInput) => {
      validateAsk(input);
      const nodes = JSON.parse(
        input.question.slice(input.question.lastIndexOf("\n") + 1),
      ) as Array<{ id: string; text: string }>;
      return {
        answer: JSON.stringify({
          nodes: nodes.map(({ id }) => ({ id, text: `Translated ${id}` })),
        }),
      };
    });
  }

  function requestedTranslationSources() {
    return mocks.ask.mock.calls.flatMap(([input]) =>
      JSON.parse(input.question.slice(input.question.lastIndexOf("\n") + 1)),
    );
  }

  it("requests explicit inline omission and applies a complete translation batch", async () => {
    await start();
    translationSource();
    mocks.ask.mockResolvedValue({
      answer: JSON.stringify({ nodes: inlineTranslations }),
    });
    await click(en.translatePage);
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.ask.mock.calls[0][0].question).toContain('"omit":true');
    expect(
      sendToTab.mock.calls.find(
        ([, message]) => message.type === "glimpselet:translate",
      )?.[1].nodes,
    ).toEqual([
      inlineTranslations[0],
      { id: "t21", text: "", omit: true },
      inlineTranslations[2],
    ]);
    expect(status()).toBe(en.translationApplied);
  });

  it("translates a maximum batch containing 1500 escaped quotes within the provider budget", async () => {
    stored.targetLocale = "en";
    await start();
    const nodes = [
      { id: "t1", text: '"'.repeat(1_500) + "x".repeat(2_000) },
      { id: "t2", text: "x".repeat(1_432) },
    ];
    translationSource(nodes);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationApplied);
    expect(mocks.ask).toHaveBeenCalled();
    for (const [input] of mocks.ask.mock.calls)
      expect(input.question.length).toBeLessThanOrEqual(8_000);
    expect(requestedTranslationSources()).toEqual(nodes);
  });

  it("fits a single 3500-character quoted source by omitting only the optional example", async () => {
    stored.targetLocale = "en";
    await start();
    const nodes = [{ id: "t1", text: '"'.repeat(3_500) }];
    translationSource(nodes);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationApplied);
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    const input = mocks.ask.mock.calls[0][0];
    expect(input.question.length).toBeLessThanOrEqual(8_000);
    expect(input.question).not.toContain("Worked example");
    expect(requestedTranslationSources()).toEqual(nodes);
  });

  it("flushes escaped batches using the exact serialized request length", async () => {
    stored.targetLocale = "en";
    await start();
    const nodes = [
      { id: "t1", text: '"'.repeat(3_500) },
      { id: "t2", text: '"'.repeat(1_432) },
    ];
    translationSource(nodes);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationApplied);
    expect(mocks.ask).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.ask.mock.calls)
      expect(input.question.length).toBeLessThanOrEqual(8_000);
    expect(requestedTranslationSources()).toEqual(nodes);
  });

  it("rejects a source whose escaped request cannot fit before any provider call or page write", async () => {
    stored.targetLocale = "en";
    await start();
    translationSource([
      { id: "t1", text: "Readable source" },
      { id: "t2", text: "\u0000".repeat(3_500) },
    ]);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationIncomplete);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:translate",
      ),
    ).toBe(false);
  });

  it.each([
    {
      limit: "24 nodes",
      nodes: Array.from({ length: 25 }, (_, index) => ({
        id: `t${index + 1}`,
        text: "Source",
      })),
      sizes: [24, 1],
    },
    {
      limit: "5000 source characters with mapping overhead",
      nodes: [
        { id: "t1", text: "x".repeat(2_500) },
        { id: "t2", text: "x".repeat(2_500) },
      ],
      sizes: [1, 1],
    },
  ])("keeps the existing $limit batch limit", async ({ nodes, sizes }) => {
    stored.targetLocale = "en";
    await start();
    translationSource(nodes);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationApplied);
    expect(
      mocks.ask.mock.calls.map(
        ([input]) =>
          JSON.parse(input.question.slice(input.question.lastIndexOf("\n") + 1))
            .length,
      ),
    ).toEqual(sizes);
    expect(requestedTranslationSources()).toEqual(nodes);
  });

  it("keeps an oversized source ID intact and rejects it before provider calls", async () => {
    await start();
    translationSource([{ id: "t1", text: "x".repeat(3_501) }]);
    boundedTranslationProvider();
    await click(en.translatePage);
    expect(status()).toBe(en.translationIncomplete);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(
      sendToTab.mock.calls.some(
        ([, message]) => message.type === "glimpselet:translate",
      ),
    ).toBe(false);
  });

  it.each(["duplicate", "unknown"])(
    "rejects an extra %s mapping before applying translations",
    async (kind) => {
      await start();
      translationSource();
      const regular = inlineSources.map(({ id }) => ({
        id,
        text: "Translated",
      }));
      mocks.ask.mockResolvedValue({
        answer: JSON.stringify({
          nodes: [
            ...regular,
            { id: kind === "duplicate" ? "t20" : "unknown", text: "Extra" },
          ],
        }),
      });
      await click(en.translatePage);
      expect(
        sendToTab.mock.calls.some(
          ([, message]) => message.type === "glimpselet:translate",
        ),
      ).toBe(false);
      expect(status()).toBe(en.translationIncomplete);
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
  it("handles an unavailable reader guide without restoring its instruction in the draft", async () => {
    await start();
    const reason = "This PDF has no reliably identified diagram target.";
    mocks.ask.mockResolvedValue({
      answer: JSON.stringify({ status: "unavailable", reason, steps: [] }),
    });
    const response = await send({
      type: "glimpselet:reader-action",
      action: "guide",
      context: page,
      question: "Guide me through this PDF",
    });

    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(status()).toBe(en.answerReady);
    expect(document.querySelector(".message .answer")?.textContent).toContain(
      reason,
    );
    expect(document.querySelector("textarea")?.value).toBe("");
    expect(
      sendToTab.mock.calls.find(
        ([, message]) => message.type === "glimpselet:guide",
      )?.[1].steps,
    ).toEqual([]);
  });

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
  it("explicitly scopes a section summary to its selected text without an unrelated image or section", async () => {
    await start();
    await click(en.visible);
    expect(document.querySelector(".capture-chip img")).not.toBeNull();
    await send({
      type: "glimpselet:reader-action",
      action: "summary-selection",
      text: "Transformer introduction",
      context: { ...page, text: "Transformer introduction. UNRELATED_SECTION" },
      image: "data:image/png;base64,AAA=",
    });
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    const input = mocks.ask.mock.calls[0][0];
    expect(input.question).toMatch(/Summarize only this selected PDF passage/);
    expect(input.question).toContain("Transformer introduction");
    expect(input.page.text).toBe("Transformer introduction");
    expect(input.image).toBeUndefined();
    expect(document.querySelector("textarea")?.value).toBe("");
  });
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
