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
