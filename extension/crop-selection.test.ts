import { describe, it, expect } from "vitest";
import { selectionRect, imageRect, selectCrop } from "./crop-selection";
describe("crop geometry", () => {
  it("supports reverse drags and clamps all screen edges", () => {
    expect(
      selectionRect({ x: 470, y: 330 }, { x: -35, y: 83 }, 400, 300),
    ).toEqual({ x: 0, y: 83, width: 400, height: 217 });
  });
  it("maps display coordinates independently to native frame pixels", () => {
    expect(
      imageRect(
        { x: 31, y: 17, width: 173, height: 89 },
        { width: 800, height: 450 },
        { width: 1600, height: 900 },
      ),
    ).toEqual({ x: 62, y: 34, width: 346, height: 178 });
  });
  it("never reads past the final pixel at a rounded boundary", () => {
    expect(
      imageRect(
        { x: 99.8, y: 47.9, width: 0.2, height: 2.1 },
        { width: 100, height: 50 },
        { width: 333, height: 167 },
      ),
    ).toEqual({ x: 332, y: 160, width: 1, height: 7 });
  });
  it("keeps a one pixel crop when both coordinates round to the far edge", () => {
    expect(
      imageRect(
        { x: 99.99, y: 49.99, width: 0.01, height: 0.01 },
        { width: 100, height: 50 },
        { width: 333, height: 167 },
      ),
    ).toEqual({ x: 332, y: 166, width: 1, height: 1 });
  });
});

describe("keyboard crop", () => {
  const labels = {
    cropTitle: "Crop",
    cropHint: "Drag or use arrows",
    cropConfirm: "Confirm",
    cropCancel: "Cancel",
  };
  it("creates and resizes a selection without a pointer, then restores focus", async () => {
    const previous = document.createElement("button");
    const host = document.createElement("div");
    document.body.append(previous, host);
    previous.focus();
    const result = selectCrop(
      host,
      () => new DOMRect(0, 0, 800, 450),
      labels,
      2,
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(host.shadowRoot?.querySelector("output")?.textContent).toBe(
      "820 × 450 px",
    );
    expect(host.shadowRoot?.querySelectorAll("[data-handle]")).toHaveLength(8);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await expect(result).resolves.toEqual({
      x: 201,
      y: 113,
      width: 410,
      height: 225,
    });
    expect(host.isConnected).toBe(false);
    expect(document.activeElement).toBe(previous);
    previous.remove();
  });
  it("cancels without a selection and removes its keyboard handlers", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const result = selectCrop(host, () => new DOMRect(0, 0, 800, 450), labels);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(result).resolves.toBeNull();
    expect(host.isConnected).toBe(false);
    const key = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      cancelable: true,
    });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
  });
  it("keeps a scrolled selection attached to the same captured pixels", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let bounds = new DOMRect(0, 0, 1600, 1000);
    const result = selectCrop(host, () => bounds, labels, 2);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    const box = host.shadowRoot!.querySelector<HTMLElement>(".selection")!;
    const before = { left: box.style.left, top: box.style.top };
    bounds = new DOMRect(-600, -400, 1600, 1000);
    window.dispatchEvent(new Event("scroll"));
    expect(parseFloat(box.style.left)).toBe(parseFloat(before.left) - 600);
    expect(parseFloat(box.style.top)).toBe(parseFloat(before.top) - 400);
    expect(host.shadowRoot!.querySelector("output")!.textContent).toBe(
      "1600 × 1000 px",
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await expect(result).resolves.toEqual({
      x: 401,
      y: 250,
      width: 800,
      height: 500,
    });
  });
});
