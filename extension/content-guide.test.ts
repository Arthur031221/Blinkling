import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContentMessage = (
  message: Record<string, unknown>,
  sender: unknown,
  respond: (value: unknown) => void,
) => void;

let onMessage: ContentMessage;

async function startContentScript() {
  const listeners: ContentMessage[] = [];
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: { get: vi.fn().mockResolvedValue({}) },
        onChanged: { addListener: vi.fn() },
      },
      runtime: {
        onMessage: {
          addListener: (listener: ContentMessage) => listeners.push(listener),
        },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "glimpseletContentReady");
  await import("./content");
  onMessage = listeners[0];
}

function send<T>(type: string, fields: Record<string, unknown> = {}): T {
  let response: unknown;
  onMessage({ type, ...fields }, {}, (value) => (response = value));
  return response as T;
}

async function setup() {
  document.body.innerHTML =
    '<button id="return-focus">Return focus</button><button>First target</button><button>Second target</button>';
  await startContentScript();
  const context = send<{
    elements: Array<{ id: string; text: string }>;
  }>("glimpselet:context");
  const byText = (text: string) =>
    context.elements.find((element) => element.text === text)!.id;
  return { firstId: byText("First target"), secondId: byText("Second target") };
}

function openGuide(elementIds: string[]) {
  return send<{ ok: boolean }>("glimpselet:guide", {
    steps: elementIds.map((elementId, index) => ({
      elementId,
      note: `Step ${index + 1}`,
    })),
  });
}

describe("content script guide focus", () => {
  const listeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];
  const observers: MutationObserver[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    const add = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(
      function (this: EventTarget, type, listener, options) {
        if (listener && (this === window || this === document))
          listeners.push({ target: this, type, listener, options });
        add.call(this, type, listener, options);
      },
    );
    vi.stubGlobal(
      "MutationObserver",
      class extends window.MutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.push(this);
        }
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 16),
    );
  });

  afterEach(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    for (const { target, type, listener, options } of listeners.splice(0))
      target.removeEventListener(type, listener, options);
    for (const observer of observers.splice(0)) observer.disconnect();
    document
      .querySelectorAll("[data-glimpselet-overlay]")
      .forEach((overlay) => overlay.remove());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "chrome");
    Reflect.deleteProperty(globalThis, "glimpseletContentReady");
    document.body.innerHTML = "";
  });

  it("serves an explicit text-only guide context but refuses known password reads and draws", async () => {
    const { firstId } = await setup();
    const frame = document.createElement("iframe");
    document.body.append(frame);
    Object.defineProperty(frame, "contentDocument", { value: null });
    expect(
      send<{ hasPassword: boolean }>("glimpselet:context").hasPassword,
    ).toBe(true);
    expect(
      send<{ hasPassword: boolean; guideScope: string }>(
        "glimpselet:guide-context",
      ),
    ).toMatchObject({ hasPassword: false, guideScope: "top-document-text" });
    expect(openGuide([firstId])).toEqual({ ok: true });
    document.body.insertAdjacentHTML("beforeend", '<input type="password">');
    expect(send("glimpselet:guide-context")).toEqual({
      error: "password_page",
    });
    expect(openGuide([firstId])).toEqual({ error: "password_page" });
  });

  it("marks explicit page reading as text-only, excludes opaque embed fallback and rejects known passwords", async () => {
    await setup();
    document.body.insertAdjacentHTML(
      "beforeend",
      "<p>Public mug · 350 ml · ¥2,290</p><iframe></iframe><object><p>UNKNOWN_EMBED_TEXT</p><button>UNKNOWN_EMBED_CONTROL</button></object>",
    );
    Object.defineProperty(
      document.querySelector("iframe")!,
      "contentDocument",
      {
        value: null,
      },
    );
    const context = send<{
      hasPassword: boolean;
      textScope: string;
      excludedEmbeds: number;
      text: string;
    }>("glimpselet:explicit-context");
    expect(context).toMatchObject({
      hasPassword: false,
      textScope: "top-document-text",
      excludedEmbeds: 2,
    });
    expect(context).not.toHaveProperty("guideScope");
    expect(context.text).toContain("350 ml · ¥2,290");
    expect(JSON.stringify(context)).not.toContain("UNKNOWN_EMBED");
    expect(
      send<{ hasPassword: boolean }>("glimpselet:context").hasPassword,
    ).toBe(true);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<input autocomplete="current-password" hidden>',
    );
    expect(send("glimpselet:explicit-context")).toEqual({
      error: "password_page",
    });
  });

  it.each(["glimpselet:explicit-context", "glimpselet:guide-context"])(
    "%s rejects a mismatched document key or URL before returning text",
    async (type) => {
      await setup();
      const identity = send<{ documentKey: string; url: string }>(
        "glimpselet:identity",
      );
      expect(send(type, identity)).toMatchObject({
        [type === "glimpselet:guide-context" ? "guideScope" : "textScope"]:
          "top-document-text",
      });
      expect(send(type, identity)).not.toHaveProperty(
        type === "glimpselet:guide-context" ? "textScope" : "guideScope",
      );
      expect(
        send(type, { ...identity, documentKey: "replaced-document" }),
      ).toEqual({ error: "tab_changed" });
      expect(
        send(type, { ...identity, url: `${identity.url}replaced` }),
      ).toEqual({ error: "tab_changed" });
    },
  );

  it("keeps the focused nav control through scroll and resize repositioning", async () => {
    const { firstId, secondId } = await setup();
    expect(openGuide([firstId, secondId]).ok).toBe(true);

    const host = document.querySelector<HTMLElement>(
      "[data-glimpselet-overlay]",
    )!;
    const root = host.shadowRoot!;
    const next = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="next"]')!;
    const initialNext = next();
    initialNext.focus();

    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(16);
    expect(next()).not.toBe(initialNext);
    expect(root.activeElement).toBe(next());

    next().click();
    const back = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="back"]')!;
    const initialBack = back();
    initialBack.focus();
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(16);
    expect(back()).not.toBe(initialBack);
    expect(root.activeElement).toBe(back());

    back().click();
    expect(back().disabled).toBe(true);
    expect(root.activeElement).toBe(next());
  });

  it("returns focus to the previously focused page element when closed", async () => {
    const { firstId } = await setup();
    const returnFocus =
      document.querySelector<HTMLButtonElement>("#return-focus")!;
    returnFocus.focus();
    expect(document.activeElement).toBe(returnFocus);
    const restoreFocus = vi.spyOn(returnFocus, "focus");

    expect(openGuide([firstId]).ok).toBe(true);
    const host = document.querySelector<HTMLElement>(
      "[data-glimpselet-overlay]",
    )!;
    host
      .shadowRoot!.querySelector<HTMLButtonElement>(
        '[data-guide-control="next"]',
      )!
      .click();

    expect(host.shadowRoot!.querySelector(".guide")).toBeNull();
    expect(restoreFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(returnFocus);
  });

  it.each([0, 1, 2])(
    "Escape closes step %s before the page can stop propagation",
    async (index) => {
      const { firstId, secondId } = await setup();
      const returnFocus =
        document.querySelector<HTMLButtonElement>("#return-focus")!;
      returnFocus.focus();
      const context = send<{ elements: Array<{ id: string; text: string }> }>(
        "glimpselet:context",
      );
      openGuide([firstId, secondId, context.elements[0].id]);
      const root = document.querySelector(
        "[data-glimpselet-overlay]",
      )!.shadowRoot!;
      for (let i = 0; i < index; i++)
        root
          .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
          .click();
      const stop = (event: KeyboardEvent) => event.stopPropagation();
      document.addEventListener("keydown", stop);
      try {
        const control = root.querySelector<HTMLButtonElement>(
          '[data-guide-control="next"]',
        )!;
        // Exercise both a focused shadow control and actual page content.
        for (const target of [control, returnFocus]) {
          target.focus();
          target.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              bubbles: true,
              composed: true,
            }),
          );
          expect(root.querySelector(".guide")).toBeNull();
          expect(root.querySelector("svg.draw")).toBeNull();
          expect(document.activeElement).toBe(returnFocus);
          openGuide([firstId, secondId, context.elements[0].id]);
          for (let i = 0; i < index; i++)
            root
              .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
              .click();
        }
      } finally {
        document.removeEventListener("keydown", stop);
      }
    },
  );

  it("offers Close guide at every step and restores focus without affecting page Escape", async () => {
    const { firstId, secondId } = await setup();
    const previous =
      document.querySelector<HTMLButtonElement>("#return-focus")!;
    for (const index of [0, 1]) {
      previous.focus();
      openGuide([firstId, secondId]);
      const root = document.querySelector(
        "[data-glimpselet-overlay]",
      )!.shadowRoot!;
      if (index)
        root
          .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
          .click();
      const close = root.querySelector<HTMLButtonElement>(
        '[data-guide-control="close"]',
      );
      expect(close?.textContent).toBe("Close guide");
      close!.focus();
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(16);
      expect(root.activeElement?.getAttribute("data-guide-control")).toBe(
        "close",
      );
      (root.activeElement as HTMLButtonElement).click();
      expect(root.querySelector(".guide")).toBeNull();
      expect(document.activeElement).toBe(previous);
    }
    const pageEscape = vi.fn();
    document.addEventListener("keydown", pageEscape);
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      previous.dispatchEvent(event);
      expect(pageEscape).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      document.removeEventListener("keydown", pageEscape);
    }
  });
});

describe("selection tools during a guide", () => {
  const listeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];
  const observers: MutationObserver[] = [];
  let rangeRect: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    const add = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(
      function (this: EventTarget, type, listener, options) {
        if (listener && (this === window || this === document))
          listeners.push({ target: this, type, listener, options });
        add.call(this, type, listener, options);
      },
    );
    vi.stubGlobal(
      "MutationObserver",
      class extends window.MutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.push(this);
        }
      },
    );
    rangeRect = Object.getOwnPropertyDescriptor(
      Range.prototype,
      "getBoundingClientRect",
    );
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(30, 120, 360, 40),
    });
  });

  afterEach(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    for (const { target, type, listener, options } of listeners.splice(0))
      target.removeEventListener(type, listener, options);
    for (const observer of observers.splice(0)) observer.disconnect();
    window.getSelection()?.removeAllRanges();
    document
      .querySelectorAll("[data-glimpselet-overlay]")
      .forEach((overlay) => overlay.remove());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (rangeRect)
      Object.defineProperty(
        Range.prototype,
        "getBoundingClientRect",
        rangeRect,
      );
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    Reflect.deleteProperty(globalThis, "chrome");
    Reflect.deleteProperty(globalThis, "glimpseletContentReady");
    document.body.innerHTML = "";
  });

  async function selectPassage(kind: "webpage" | "reader") {
    const passage = "The selected section explains attention and its weights.";
    document.body.innerHTML =
      kind === "reader"
        ? `<main data-glimpselet-reader-page="4"><div class="pdf-text-layer"><span id="passage">${passage}</span><span>Next section</span></div></main>`
        : `<main><h2>Selected section</h2><p id="passage">${passage}</p><h2>Next section</h2></main>`;
    await startContentScript();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#passage")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    // Settle the native selectionchange tasks while keeping the 40 ms UI delay pending.
    vi.advanceTimersByTime(0);
    const context = send<{ elements: Array<{ id: string }> }>(
      "glimpselet:guide-context",
    );
    return {
      passage,
      range,
      selection,
      ids: context.elements.map((element) => element.id),
    };
  }

  function root() {
    return document.querySelector("[data-glimpselet-overlay]")!.shadowRoot!;
  }

  function expectPassagePreserved(selection: Selection, range: Range) {
    const selected = selection.getRangeAt(0);
    expect(selected.startContainer).toBe(range.startContainer);
    expect(selected.startOffset).toBe(range.startOffset);
    expect(selected.endContainer).toBe(range.endContainer);
    expect(selected.endOffset).toBe(range.endOffset);
  }

  it.each(["webpage", "reader"] as const)(
    "dismisses an existing %s selection toolbar without clearing its passage",
    async (kind) => {
      const { ids, passage, range, selection } = await selectPassage(kind);
      vi.advanceTimersByTime(40);
      expect(root().querySelectorAll(".popover button")).toHaveLength(3);

      expect(openGuide(ids)).toEqual({ ok: true });
      expect(root().querySelector(".popover")).toBeNull();
      expect(selection.toString()).toBe(passage);
      expectPassagePreserved(selection, range);

      for (let index = 0; index < ids.length; index++) {
        expect(root().querySelector(".guide p")?.textContent).toBe(
          `Step ${index + 1}`,
        );
        expect(root().querySelector(".popover")).toBeNull();
        root()
          .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
          .click();
      }
      expect(root().querySelector(".guide")).toBeNull();
    },
  );

  it.each(["webpage", "reader"] as const)(
    "cancels a queued %s selection toolbar even when the guide closes before its delay",
    async (kind) => {
      const { ids, selection, range } = await selectPassage(kind);
      const scheduled = vi.spyOn(window, "setTimeout");
      const cancelled = vi.spyOn(window, "clearTimeout");
      document.dispatchEvent(new Event("selectionchange"));
      const pending = scheduled.mock.results.at(-1)!.value as number;

      expect(openGuide(ids)).toEqual({ ok: true });
      expect(cancelled).toHaveBeenCalledWith(pending);
      root()
        .querySelector<HTMLButtonElement>('[data-guide-control="close"]')!
        .click();
      vi.advanceTimersByTime(60);
      expect(root().querySelector(".popover")).toBeNull();
      expectPassagePreserved(selection, range);
    },
  );

  it.each(["webpage", "reader"] as const)(
    "suppresses delayed %s selection events through guide navigation and resumes every action after close",
    async (kind) => {
      const { ids, passage, range, selection } = await selectPassage(kind);
      expect(openGuide(ids)).toEqual({ ok: true });
      vi.advanceTimersByTime(60);
      expect(root().querySelector(".popover")).toBeNull();

      for (let index = 0; index < ids.length; index++) {
        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(60);
        expect(root().querySelector(".popover")).toBeNull();
        expectPassagePreserved(selection, range);
        if (index + 1 < ids.length)
          root()
            .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
            .click();
      }
      root()
        .querySelector<HTMLButtonElement>('[data-guide-control="back"]')!
        .click();
      document.dispatchEvent(new Event("selectionchange"));
      // A callback scheduled while guiding must not reappear after closing.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      vi.advanceTimersByTime(60);
      expect(root().querySelector(".guide")).toBeNull();
      expect(root().querySelector(".popover")).toBeNull();

      for (const [index, action] of ["explain", "translate", "ask"].entries()) {
        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(40);
        const buttons =
          root().querySelectorAll<HTMLButtonElement>(".popover button");
        expect(buttons).toHaveLength(3);
        buttons[index].click();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
          type: "glimpselet:selection",
          text: passage,
          url: location.href,
          action,
        });
        expect(root().querySelector(".popover")).toBeNull();
        expectPassagePreserved(selection, range);
      }
    },
  );
});
