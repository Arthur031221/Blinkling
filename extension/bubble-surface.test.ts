import { afterEach, describe, expect, it } from "vitest";
import { bindBubbleSurface, dockBlink, readBlinkDock } from "./bubble-surface";

afterEach(() => {
  document.body.innerHTML = "";
});
describe("bubble visibility", () => {
  it("marks the owning root for transparent product backgrounds and cleans up the marker", () => {
    const binding = bindBubbleSurface(document.body);
    expect(document.documentElement.dataset.bubbleSurface).toBe("true");
    binding.dispose();
    expect(document.documentElement.dataset.bubbleSurface).toBeUndefined();
    document.documentElement.dataset.bubbleSurface = "previous";
    const previous = bindBubbleSurface(document.body);
    previous.dispose();
    expect(document.documentElement.dataset.bubbleSurface).toBe("previous");
    delete document.documentElement.dataset.bubbleSurface;
  });
  it("fades to 35%, hovers at 75%, wakes on a click anywhere, then idles on exit", () => {
    const surface = document.createElement("main");
    const child = document.createElement("button");
    surface.append(child);
    document.body.append(surface);
    const binding = bindBubbleSurface(surface);
    expect(surface.style.opacity).toBe("0.35");
    surface.dispatchEvent(new Event("pointerenter"));
    expect(surface.style.opacity).toBe("0.75");
    child.click();
    expect(surface.style.opacity).toBe("1");
    surface.dispatchEvent(new Event("pointerleave"));
    expect(surface.style.opacity).toBe("0.35");
    surface.dispatchEvent(new Event("pointerenter"));
    expect(surface.style.opacity).toBe("0.75");
    binding.dispose();
  });
  it("keeps crop at 25% and releases DOM hit testing across hover, click and blur", () => {
    const binding = bindBubbleSurface(document.body);
    document.body.click();
    binding.setCropping(true);
    for (const event of ["pointerenter", "click", "pointerleave"]) {
      document.body.dispatchEvent(new Event(event));
      expect(document.body.style.opacity).toBe("0.25");
      expect(document.body.style.pointerEvents).toBe("none");
      expect(document.body.dataset.bubbleState).toBe("crop");
    }
    window.dispatchEvent(new Event("blur"));
    expect(document.body.style.opacity).toBe("0.25");
    binding.setCropping(false);
    expect(document.body.style.opacity).toBe("0.35");
    expect(document.body.style.pointerEvents).toBe("");
    binding.dispose();
    expect(document.body.style.opacity).toBe("");
  });
  it("restores the active state after crop and wakes for keyboard interaction", () => {
    const binding = bindBubbleSurface(document.body);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    binding.setCropping(true);
    binding.setCropping(false);
    expect(document.body.style.opacity).toBe("1");
    binding.dispose();
  });
});
describe("Blink docking", () => {
  it("snaps to bottom-right or a bounded right-edge peek", () => {
    expect(dockBlink(610, 650).edge).toBe("bottom");
    expect(dockBlink(250, 650)).toEqual({ edge: "right", y: 250 / 650 });
    expect(dockBlink(-100, 650)).toEqual({ edge: "right", y: 0.15 });
    expect(readBlinkDock({ edge: "right", y: 99 })).toEqual({
      edge: "right",
      y: 0.85,
    });
  });
  it.each([null, {}, { edge: "left", y: 0.5 }, { edge: "right", y: NaN }])(
    "uses the default for malformed stored docking %s",
    (value) => {
      expect(readBlinkDock(value)).toEqual({ edge: "bottom", y: 0.5 });
    },
  );
});
