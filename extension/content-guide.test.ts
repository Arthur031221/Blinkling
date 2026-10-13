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
});
