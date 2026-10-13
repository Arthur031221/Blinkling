import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listeners: Array<{
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}> = [];
const observers: MutationObserver[] = [];
let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  Reflect.deleteProperty(globalThis, "glimpseletContentReady");
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (listener) listeners.push({ target, type, listener, options });
        add(type, listener, options);
      },
    );
  }
  vi.stubGlobal(
    "MutationObserver",
    class extends window.MutationObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        observers.push(this);
      }
    },
  );
  sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: vi.fn().mockResolvedValue({ shiftCropEnabled: true }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage,
    },
  });
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal("scrollX", 12);
  vi.stubGlobal("scrollY", 25);
  vi.stubGlobal("devicePixelRatio", 2);
  document.body.innerHTML = "<p>A readable page</p>";
  await import("./content");
  await Promise.resolve();
});

afterEach(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  for (let i = 0; i < 15; i++) await Promise.resolve();
  for (const { target, type, listener, options } of listeners.splice(0))
    target.removeEventListener(type, listener, options);
  for (const observer of observers.splice(0)) observer.disconnect();
  document
    .querySelectorAll("[data-glimpselet-crop], [data-glimpselet-overlay]")
    .forEach((element) => element.remove());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "glimpseletContentReady");
  document.body.innerHTML = "";
});

function pointer(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

async function shiftCrop() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
  await vi.advanceTimersByTimeAsync(200);
  const host = document.querySelector<HTMLElement>("[data-glimpselet-crop]")!;
  expect(host.style.getPropertyValue("display")).toBe("block");
  expect(host.style.getPropertyPriority("display")).toBe("important");
  return host.shadowRoot!.querySelector<HTMLElement>(".surface")!;
}

describe("Shift crop source metadata", () => {
  it("sends the confirmed live-page rectangle with completion viewport, scroll and DPR", async () => {
    const surface = await shiftCrop();
    pointer(surface, "pointerdown", 20, 30);
    pointer(window, "pointermove", 100, 90);
    pointer(window, "pointerup", 100, 90);
    // Geometry is recorded at confirmation, rather than when Shift was held.
    vi.stubGlobal("scrollX", 30);
    vi.stubGlobal("scrollY", 50);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    const selections = sendMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "glimpselet:crop-selected");
    expect(selections).toEqual([
      {
        type: "glimpselet:crop-selected",
        rect: [20, 30, 80, 60],
        url: location.href,
        geometry: {
          width: 1024,
          height: 768,
          scrollX: 30,
          scrollY: 50,
          devicePixelRatio: 2,
        },
      },
    ]);
    expect(document.querySelector("[data-glimpselet-crop]")).toBeNull();
  });

  it("does not send a selected rectangle when Shift crop is cancelled", async () => {
    const surface = await shiftCrop();
    pointer(surface, "pointerdown", 20, 30);
    pointer(window, "pointermove", 100, 90);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(
      sendMessage.mock.calls.some(
        ([message]) => message.type === "glimpselet:crop-selected",
      ),
    ).toBe(false);
    expect(document.querySelector("[data-glimpselet-crop]")).toBeNull();
  });
});
