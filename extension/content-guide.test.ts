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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document
      .querySelectorAll("[data-glimpselet-overlay]")
      .forEach((overlay) => overlay.remove());
    vi.clearAllTimers();
    vi.useRealTimers();
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

  it("clears a previous tour when a text-only unavailable result has no steps", async () => {
    const { firstId } = await setup();
    expect(openGuide([firstId])).toEqual({ ok: true });
    const root = document.querySelector(
      "[data-glimpselet-overlay]",
    )!.shadowRoot!;
    expect(root.querySelector(".guide")).not.toBeNull();
    expect(send("glimpselet:guide", { steps: [] })).toEqual({ ok: false });
    expect(root.querySelector(".guide")).toBeNull();
    expect(root.querySelector("svg.draw")).toBeNull();
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
    expect(root.querySelector("svg.draw")).toBeNull();
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

      expect(root.querySelector(".guide")).toBeNull();
      expect(root.querySelector("svg.draw")).toBeNull();
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
    expect(root.querySelector("svg.draw")).toBeNull();
  });

  it("keeps the focused nav control through scroll and resize repositioning", async () => {
    const { firstId, secondId } = await setup();
    expect(openGuide([firstId, secondId]).ok).toBe(true);

    const host = document.querySelector<HTMLElement>(
      "[data-glimpselet-overlay]",
    )!;
    const root = host.shadowRoot!;
    const next = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="next"]')!;
    next().focus();

    window.dispatchEvent(new Event("scroll"));
    expect(root.activeElement).toBe(next());

    next().click();
    const back = () =>
      root.querySelector<HTMLButtonElement>('[data-guide-control="back"]')!;
    back().focus();
    window.dispatchEvent(new Event("resize"));
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
