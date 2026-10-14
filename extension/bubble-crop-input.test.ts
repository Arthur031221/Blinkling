import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { relayBubbleCropInput } from "./bubble-crop-input";
import { selectCrop } from "./crop-selection";

class TestPointer extends MouseEvent {
  pointerId: number;
  pointerType = "mouse";
  isPrimary = true;
  constructor(type: string, options: PointerEventInit) {
    super(type, options);
    this.pointerId = options.pointerId || 1;
  }
}

const labels = {
  cropTitle: "Crop",
  cropHint: "Drag",
  cropConfirm: "Confirm",
  cropCancel: "Cancel",
};
let floating: Window;
let host: HTMLElement;
let stop: () => void;
let result: ReturnType<typeof selectCrop>;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointer);
  vi.stubGlobal("screenX", 30);
  vi.stubGlobal("screenY", 50);
  vi.stubGlobal("outerWidth", 1200);
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("outerHeight", 900);
  vi.stubGlobal("innerHeight", 800);
  const frame = document.createElement("iframe");
  document.body.append(frame);
  floating = frame.contentWindow!;
  Object.assign(floating.document.body, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  host = document.createElement("div");
  document.body.append(host);
  result = selectCrop(host, () => new DOMRect(0, 0, 1000, 750), labels);
  host.shadowRoot!.elementFromPoint = vi.fn(() =>
    host.shadowRoot!.querySelector(".surface"),
  );
  stop = relayBubbleCropInput(floating, host);
});
afterEach(() => {
  stop();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function pointer(type: string, screenX: number, screenY: number) {
  floating.document.body.dispatchEvent(
    new TestPointer(type, {
      screenX,
      screenY,
      pointerId: 4,
      button: 0,
      bubbles: true,
      cancelable: true,
    }),
  );
}

it("selects pixels beneath the bubble using desktop coordinates and native pointer capture", async () => {
  pointer("pointerdown", 160, 300);
  pointer("pointermove", 240, 360);
  pointer("pointerup", 240, 360);
  expect(floating.document.body.setPointerCapture).toHaveBeenCalledWith(4);
  expect(floating.document.body.releasePointerCapture).toHaveBeenCalledWith(4);
  floating.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
  );
  await expect(result).resolves.toEqual({
    x: 130,
    y: 150,
    width: 80,
    height: 60,
  });
});

it("aligns native fullscreen pixels when Chrome reports frame gutters outside the display", async () => {
  vi.stubGlobal("screenX", -4);
  vi.stubGlobal("screenY", -4);
  vi.stubGlobal("outerWidth", 1448);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("outerHeight", 1008);
  vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("screen", { width: 1440, height: 1000 });
  pointer("pointerdown", 160, 300);
  pointer("pointermove", 240, 360);
  pointer("pointerup", 240, 360);
  floating.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await expect(result).resolves.toEqual({
    x: 160,
    y: 300,
    width: 80,
    height: 60,
  });
});

it("routes resize handles to the selector rather than beginning another region", async () => {
  pointer("pointerdown", 160, 300);
  pointer("pointermove", 240, 360);
  pointer("pointerup", 240, 360);
  vi.mocked(host.shadowRoot!.elementFromPoint).mockReturnValue(
    host.shadowRoot!.querySelector('[data-handle="se"]'),
  );
  pointer("pointerdown", 240, 360);
  pointer("pointermove", 280, 400);
  pointer("pointerup", 280, 400);
  floating.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
  );
  await expect(result).resolves.toEqual({
    x: 130,
    y: 150,
    width: 120,
    height: 100,
  });
});

it("blocks bubble actions during crop, forwards Escape and removes its listeners afterwards", async () => {
  const action = vi.fn();
  const button = floating.document.createElement("button");
  button.onclick = action;
  floating.document.body.append(button);
  button.click();
  expect(action).not.toHaveBeenCalled();
  floating.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
  );
  await expect(result).resolves.toBeNull();
  stop();
  button.click();
  expect(action).toHaveBeenCalledOnce();
});

it("shows the frozen pixels and selection beneath the native fallback, then removes the mirror", () => {
  stop();
  const image = document.createElement("img");
  image.src = "data:image/png;base64,eA==";
  image.style.width = "1000px";
  image.style.height = "750px";
  stop = relayBubbleCropInput(floating, host, image);
  const mirror = floating.document.querySelector(
    "[data-blinkling-crop-mirror]",
  )!;
  expect(mirror).not.toBeNull();
  expect(mirror.parentElement).toBe(floating.document.documentElement);
  expect(mirror.shadowRoot!.querySelector("img")!.src).toBe(image.src);
  expect(mirror.shadowRoot!.querySelector(".surface")).not.toBeNull();
  stop();
  expect(
    floating.document.querySelector("[data-blinkling-crop-mirror]"),
  ).toBeNull();
});

it("excludes the native bottom frame from the mirrored content origin", () => {
  stop();
  vi.stubGlobal("screenX", 0);
  vi.stubGlobal("screenY", 0);
  vi.stubGlobal("outerWidth", 1440);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("outerHeight", 1000);
  vi.stubGlobal("innerHeight", 1000);
  Object.assign(floating, {
    screenX: 0,
    screenY: 0,
    outerWidth: 380,
    innerWidth: 372,
    outerHeight: 318,
    innerHeight: 280,
  });
  const image = document.createElement("img");
  stop = relayBubbleCropInput(floating, host, image);
  const mirror = floating.document.querySelector(
    "[data-blinkling-crop-mirror]",
  )!;
  expect(
    (mirror.shadowRoot!.firstElementChild as HTMLElement).style.transform,
  ).toBe("translate(-4px,-34px)");
});
