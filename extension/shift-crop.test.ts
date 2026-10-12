// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForShiftCrop } from "./shift-crop";
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe("hold Shift crop", () => {
  it("starts after a hold and leaves Shift+Tab and short presses alone", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const stop = listenForShiftCrop(window, () => true, start);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    vi.advanceTimersByTime(100);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    vi.advanceTimersByTime(300);
    expect(start).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    vi.advanceTimersByTime(300);
    expect(start).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    vi.advanceTimersByTime(200);
    expect(start).toHaveBeenCalledTimes(1);
    stop();
  });
  it("skips editable descendants, other modifiers and disallowed pages", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    let allowed = true;
    const stop = listenForShiftCrop(window, () => allowed, start);
    document.body.innerHTML =
      "<div contenteditable><span>Write here</span></div>";
    document
      .querySelector("span")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Shift", bubbles: true }),
      );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", ctrlKey: true }),
    );
    vi.advanceTimersByTime(250);
    expect(start).not.toHaveBeenCalled();
    allowed = false;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    vi.advanceTimersByTime(250);
    expect(start).not.toHaveBeenCalled();
    stop();
  });
});
