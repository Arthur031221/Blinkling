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
  it("does not refocus an overview annotation after the page loses focus", async () => {
    const { firstId } = await setup();
    vi.spyOn(
      document.querySelectorAll("button")[1],
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(40, 80, 100, 30));
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    openGuide([firstId]);
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="overview"]')!
      .click();
    root.querySelector<HTMLButtonElement>(".guide-annotation")!.focus();
    hasFocus.mockReturnValue(false);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(100);
    expect(root.querySelector(".guide-overview")).not.toBeNull();
    expect(focus).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root.querySelector(".guide-overview")).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not focus a background page when a guide arrives, repositions or closes", async () => {
    const { firstId } = await setup();
    const previous =
      document.querySelector<HTMLButtonElement>("#return-focus")!;
    previous.focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    openGuide([firstId]);
    expect(
      document
        .querySelector("[data-glimpselet-overlay]")!
        .shadowRoot!.querySelector(".guide"),
    ).not.toBeNull();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(focus).not.toHaveBeenCalled();
  });
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

  it.each([
    {
      name: "the real export menu item with a multiline note",
      viewport: [1280, 850],
      target: [24, 134, 207, 32],
      card: [271, 154],
      expected: [24, 184],
    },
    {
      name: "a target at the lower right viewport edge",
      viewport: [1100, 780],
      target: [1040, 720, 32, 32],
      card: [271, 154],
      expected: [821, 548],
    },
    {
      name: "a tall note with space to the right",
      viewport: [1280, 850],
      target: [24, 330, 207, 32],
      card: [271, 650],
      expected: [249, 192],
    },
    {
      name: "a tall note with space to the left",
      viewport: [1100, 780],
      target: [1040, 330, 32, 32],
      card: [271, 650],
      expected: [751, 122],
    },
    {
      name: "a narrow viewport requiring a bounded scrollable note",
      viewport: [320, 320],
      target: [0, 170, 320, 32],
      card: [271, 250],
      expected: [8, 8],
    },
  ])(
    "keeps the guide clear of $name",
    async ({ viewport, target, card, expected }) => {
      vi.stubGlobal("innerWidth", viewport[0]);
      vi.stubGlobal("innerHeight", viewport[1]);
      const { firstId } = await setup();
      const originalBounds = HTMLElement.prototype.getBoundingClientRect;
      // Model the note's scrollable area too: an outer card clipped to a side
      // does not mean its full passage or navigation fits in that space.
      const noteHeight = Math.max(20, card[1] - 80);
      vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(
        function (this: Element) {
          return this.matches(".guide p") ? noteHeight : 0;
        },
      );
      vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(
        function (this: Element) {
          if (!this.matches(".guide p")) return 0;
          const limit = Number.parseFloat(this.parentElement!.style.maxHeight);
          return Math.max(0, Math.min(noteHeight, (limit || card[1]) - 80));
        },
      );
      const measure = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: HTMLElement) {
          if (this.textContent === "First target")
            return new DOMRect(...(target as [number, number, number, number]));
          if (this.classList.contains("guide"))
            return new DOMRect(
              Number.parseFloat(this.style.left) || 0,
              Number.parseFloat(this.style.top) || 0,
              Math.min(
                card[0],
                Number.parseFloat(this.style.maxWidth) || Infinity,
              ),
              Math.min(
                card[1],
                Number.parseFloat(this.style.maxHeight) || Infinity,
              ),
            );
          return originalBounds.call(this);
        });
      try {
        expect(openGuide([firstId])).toEqual({ ok: true });
        const callout = document
          .querySelector("[data-glimpselet-overlay]")!
          .shadowRoot!.querySelector<HTMLElement>(".guide")!;
        const bounds = callout.getBoundingClientRect();
        const [x, y, width, height] = target;
        expect(
          bounds.right <= x ||
            bounds.left >= x + width ||
            bounds.bottom <= y ||
            bounds.top >= y + height,
        ).toBe(true);
        expect([bounds.left, bounds.top]).toEqual(expected);
        expect(bounds.left).toBeGreaterThanOrEqual(8);
        expect(bounds.top).toBeGreaterThanOrEqual(8);
        expect(bounds.right).toBeLessThanOrEqual(viewport[0] - 8);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport[1] - 8);
        expect(measure.mock.instances).toContain(callout);
      } finally {
        measure.mockRestore();
      }
    },
  );

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

  it("clears a previous tour when a text-only unavailable result has no steps", async () => {
    const { firstId } = await setup();
    expect(openGuide([firstId])).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    expect(root.querySelector(".guide")).not.toBeNull();
    expect(
      root.querySelector('svg[class~="draw"] ellipse.ink')?.isConnected,
    ).toBe(true);
    expect(
      root.querySelector('svg[class~="draw"] path.arrow')?.isConnected,
    ).toBe(true);
    expect(send("glimpselet:guide", { steps: [] })).toEqual({ ok: false });
    expect(root.querySelector(".guide")).toBeNull();
    expect(root.querySelector('svg[class~="draw"]')).toBeNull();
  });

  it("omits a literal no-op action and rejects replaced targets without leaving stale ink", async () => {
    const { firstId } = await setup();
    expect(
      send("glimpselet:guide", {
        steps: [
          { elementId: firstId, note: "Use this control", action: " none " },
        ],
      }),
    ).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    expect(root.querySelector(".guide p")!.textContent).toBe(
      "Use this control",
    );
    const target = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "First target",
    )!;
    target.replaceWith(target.cloneNode(true));
    expect(
      send("glimpselet:guide", {
        steps: [{ elementId: firstId, note: "Use this old control" }],
      }),
    ).toEqual({ ok: false });
    expect(root.querySelector(".guide")).toBeNull();
    expect(root.querySelector('svg[class~="draw"]')).toBeNull();
  });

  it.each(["private", "hidden", "replaced", "password"])(
    "clears an active tour when its target becomes %s before redraw",
    async (state) => {
      const { firstId } = await setup();
      expect(openGuide([firstId])).toEqual({ ok: true });
      const root = document.querySelector(
        "[data-glimpselet-overlay]",
      )!.shadowRoot!;
      const target = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "First target",
      )!;
      if (state === "private") target.setAttribute("data-private", "true");
      if (state === "hidden") target.hidden = true;
      if (state === "replaced") target.replaceWith(target.cloneNode(true));
      if (state === "password")
        document.body.insertAdjacentHTML(
          "beforeend",
          '<input type="password">',
        );

      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(16);

      expect(root.querySelector(".guide")).toBeNull();
      expect(root.querySelector('svg[class~="draw"]')).toBeNull();
    },
  );

  it("closes a tour before navigating to a target that became private", async () => {
    const { firstId, secondId } = await setup();
    expect(openGuide([firstId, secondId])).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    const target = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Second target",
    )!;
    target.setAttribute("data-private", "true");
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
      .click();

    expect(root.querySelector(".guide")).toBeNull();
    expect(root.querySelector('svg[class~="draw"]')).toBeNull();
  });

  it("skips collapsed responsive targets and restores their overview entries when visible", async () => {
    const { firstId, secondId } = await setup();
    const page = send<{ elements: Array<{ id: string; text: string }> }>(
      "glimpselet:guide-context",
    );
    const returnId = page.elements.find((e) => e.text === "Return focus")!.id;
    openGuide([firstId, secondId, returnId]);
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    const control = (name: string) =>
      root.querySelector<HTMLButtonElement>(`[data-guide-control="${name}"]`)!;
    const target = document.querySelectorAll<HTMLButtonElement>("button")[2];
    target.hidden = true;
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 1");
    control("next").click();
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 3");
    control("back").click();
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 1");
    control("overview").click();
    const collapsed = root.querySelector<HTMLButtonElement>(
      '.guide-overview [data-guide-index="1"]',
    )!;
    expect(collapsed.disabled).toBe(true);
    target.hidden = false;
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(collapsed.disabled).toBe(false);
    collapsed.click();
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 2");

    target.hidden = true;
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 3");
    // Collapsing a target must never exempt it from the privacy check.
    target.setAttribute("data-private", "true");
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(root.querySelector(".guide")).toBeNull();
  });

  it("keeps the focused nav control through scroll and resize repositioning", async () => {
    const { firstId, secondId } = await setup();
    expect(openGuide([firstId, secondId]).ok).toBe(true);

    const host = document.querySelector<HTMLElement>(
      "[data-glimpselet-overlay]",
    )!;
    const root = host.shadowRoot!;
    const initialInk = root.querySelector('svg[class~="draw"] ellipse.ink')!;
    expect(initialInk?.isConnected).toBe(true);
    expect(root.querySelectorAll('svg[class~="draw"] path.arrow')).toHaveLength(
      1,
    );
    const next = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="next"]')!;
    const initialNext = next();
    initialNext.focus();

    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(16);
    expect(next()).not.toBe(initialNext);
    expect(root.activeElement).toBe(next());
    expect(initialInk.isConnected).toBe(false);
    expect(
      root.querySelectorAll('svg[class~="draw"] ellipse.ink'),
    ).toHaveLength(1);
    expect(root.querySelectorAll('svg[class~="draw"] path.arrow')).toHaveLength(
      1,
    );

    next().click();
    const back = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="back"]')!;
    const initialBack = back();
    initialBack.focus();
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(16);
    expect(back()).not.toBe(initialBack);
    expect(root.activeElement).toBe(back());
    expect(
      root.querySelectorAll('svg[class~="draw"] ellipse.ink'),
    ).toHaveLength(1);
    expect(root.querySelectorAll('svg[class~="draw"] path.arrow')).toHaveLength(
      1,
    );

    back().click();
    expect(back().disabled).toBe(true);
    expect(root.activeElement).toBe(next());

    const overview = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="overview"]')!;
    overview().focus();
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(16);
    expect(root.activeElement).toBe(overview());
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

  it("outlines page regions, shows purpose and navigates a tour longer than twelve steps", async () => {
    document.body.innerHTML = `<main><h1>Read the paper</h1>${Array.from({ length: 20 }, (_, i) => `<section><h2>Section ${i}</h2><p>Paragraph ${i}</p></section>`).join("")}</main>`;
    await startContentScript();
    const page = send<{
      elements: Array<{ id: string; role: string; text: string }>;
    }>("glimpselet:guide-context");
    const regions = page.elements.filter((e) => e.role === "paragraph");
    expect(
      send("glimpselet:guide", {
        purpose: "Understand the research",
        steps: regions.map((e) => ({ elementId: e.id, note: e.text })),
      }),
    ).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    expect(root.querySelector("rect.ink")).not.toBeNull();
    expect(root.querySelector(".guide p")!.textContent).toContain(
      "Understand the research",
    );
    for (let i = 0; i < 19; i++)
      root
        .querySelector<HTMLButtonElement>('[data-guide-control="next"]')!
        .click();
    expect(root.querySelector(".guide p")!.textContent).toBe("Paragraph 19");
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="back"]')!
      .click();
    expect(root.querySelector(".guide p")!.textContent).toBe("Paragraph 18");
  });

  it("keeps requested targets when late content changes the bounded map", async () => {
    document.body.innerHTML = `<article>${Array.from({ length: 30 }, (_, i) => `<p>Original paragraph ${i}</p>`).join("")}</article>`;
    await startContentScript();
    const page = send<{
      elements: Array<{ id: string; role: string; text: string }>;
    }>("glimpselet:guide-context");
    const paragraphs = page.elements.filter((e) => e.role === "paragraph");
    document
      .querySelector("article")!
      .insertAdjacentHTML(
        "afterbegin",
        "<p>Late loaded article content.</p>".repeat(300),
      );
    const newPage = send<typeof page>("glimpselet:guide-context");
    expect(
      paragraphs.some((e) => !newPage.elements.some((n) => n.id === e.id)),
    ).toBe(true);
    expect(
      send("glimpselet:guide", {
        steps: paragraphs.map((e) => ({ elementId: e.id, note: e.text })),
      }),
    ).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="overview"]')!
      .click();
    expect(root.querySelectorAll(".guide-overview li")).toHaveLength(30);
    expect(root.querySelector(".guide-overview")!.textContent).toContain(
      "Original paragraph 29",
    );
  });

  it("keeps overview explanations, focus and scroll position through redraw and returns to a selected step", async () => {
    const { firstId, secondId } = await setup();
    openGuide([firstId, secondId]);
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="overview"]')!
      .click();
    const panel = root.querySelector<HTMLElement>(".guide-overview")!;
    expect(panel.querySelectorAll("li")).toHaveLength(2);
    expect(root.querySelector(".guide")).toBeNull();
    const second = panel.querySelector<HTMLButtonElement>(
      '[data-guide-index="1"]',
    )!;
    second.focus();
    panel.querySelector("ol")!.scrollTop = 40;
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(root.querySelector(".guide-overview")).toBe(panel);
    expect(root.activeElement).toBe(second);
    expect(panel.querySelector("ol")!.scrollTop).toBe(40);
    second.click();
    expect(root.querySelector(".guide-overview")).toBeNull();
    expect(root.querySelector(".guide p")!.textContent).toBe("Step 2");
    expect(root.querySelector(".guide")!.textContent).toContain("2/2");
  });

  it("clears every overview layer when any target becomes private", async () => {
    const { firstId, secondId } = await setup();
    openGuide([firstId, secondId]);
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    root
      .querySelector<HTMLButtonElement>('[data-guide-control="overview"]')!
      .click();
    document.querySelectorAll("button")[2].setAttribute("data-private", "true");
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(16);
    expect(
      root.querySelectorAll(".guide-overview,.guide-annotation,svg.draw"),
    ).toHaveLength(0);
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
          expect(root.querySelector('svg[class~="draw"]')).toBeNull();
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
