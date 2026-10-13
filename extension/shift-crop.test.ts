// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForShiftCrop } from "./shift-crop";
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe("hold Shift crop", () => {
  it("claims the first Shift pointerdown before 200 ms instead of cancelling crop", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const stop = listenForShiftCrop(window, () => true, start);
    const app = document.createElement("div");
    document.body.append(app);
    const operate = vi.fn();
    app.addEventListener("pointerdown", operate);
    app.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", bubbles: true }),
    );
    vi.advanceTimersByTime(100);
    const pointer = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      button: 0,
      clientX: 748,
      clientY: 157,
    });
    app.dispatchEvent(pointer);
    expect(start).toHaveBeenCalledExactlyOnceWith(pointer);
    expect(pointer.defaultPrevented).toBe(true);
    expect(operate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(start).toHaveBeenCalledOnce();
    stop();
  });

  it.each([
    "typing",
    "Tab",
    "Control",
    "Alt",
    "Meta",
    "editable",
    "disabled",
    "right-click",
  ])("does not claim a Shift drag following %s", (reason) => {
    vi.useFakeTimers();
    const start = vi.fn();
    let allowed = true;
    const stop = listenForShiftCrop(window, () => allowed, start);
    const app = document.createElement("div");
    document.body.append(app);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    if (["typing", "Tab", "Control", "Alt", "Meta"].includes(reason))
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: reason === "typing" ? "A" : reason,
          shiftKey: true,
        }),
      );
    if (reason === "editable") app.contentEditable = "true";
    if (reason === "editable") app.setAttribute("contenteditable", "true");
    if (reason === "disabled") allowed = false;
    const pointer = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      button: reason === "right-click" ? 2 : 0,
    });
    app.dispatchEvent(pointer);
    vi.advanceTimersByTime(300);
    expect(start).not.toHaveBeenCalled();
    expect(pointer.defaultPrevented).toBe(false);
    stop();
  });

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
