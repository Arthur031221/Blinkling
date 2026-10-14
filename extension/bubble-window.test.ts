import { afterEach, describe, expect, it, vi } from "vitest";
import { placeBubbleWindow } from "./bubble-window";

afterEach(() => vi.unstubAllGlobals());
describe("native Blink placement", () => {
  function fixture() {
    const update = vi
      .fn()
      .mockResolvedValue({ id: 3, width: 248, height: 110 });
    vi.stubGlobal("chrome", {
      tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 10 }) },
      windows: {
        getAll: vi.fn().mockResolvedValue([
          {
            id: 1,
            alwaysOnTop: false,
            tabs: [{ url: "about:blank", openerTabId: 10 }],
          },
          {
            id: 2,
            alwaysOnTop: true,
            tabs: [{ url: "about:blank", openerTabId: 99 }],
          },
          {
            id: 3,
            alwaysOnTop: true,
            tabs: [{ url: "about:blank", openerTabId: 10 }],
          },
        ]),
        update,
      },
    });
    const floating = {
      closed: false,
      outerWidth: 428,
      innerWidth: 420,
      outerHeight: 638,
      innerHeight: 600,
      screen: {
        availLeft: 1000,
        availTop: 50,
        availWidth: 1000,
        availHeight: 800,
      },
    } as unknown as Window;
    return { floating, update };
  }
  it("positions only the opener's PiP using Chrome's clamped size and monitor work area", async () => {
    const { floating, update } = fixture();
    await placeBubbleWindow(floating, { edge: "bottom", y: 0.5 }, () => true);
    expect(update.mock.calls).toEqual([
      [3, { width: 80, height: 110 }],
      [3, { left: 1876, top: 740 }],
    ]);
    update.mockClear();
    await placeBubbleWindow(floating, { edge: "right", y: 0.4 }, () => true);
    expect(update).toHaveBeenLastCalledWith(3, { left: 1876, top: 315 });
  });
  it("tucks half the browser-clamped rectangle beyond the right work-area edge", async () => {
    const { floating, update } = fixture();
    await placeBubbleWindow(floating, { edge: "bottom", y: 0.5 }, () => true);
    expect(update).toHaveBeenLastCalledWith(3, { left: 1876, top: 740 });
  });
  it("restores the previous position without changing another window", async () => {
    const { floating, update } = fixture();
    await placeBubbleWindow(floating, { left: 1250, top: 200 }, () => true);
    expect(update.mock.calls).toEqual([[3, { left: 1250, top: 200 }]]);
  });
  it("rounds fractional drag coordinates for Chrome's integer bounds API", async () => {
    const { floating, update } = fixture();
    await placeBubbleWindow(
      floating,
      { edge: "right", y: 0.3960937261581421 },
      () => true,
    );
    expect(update).toHaveBeenLastCalledWith(3, { left: 1876, top: 312 });
    update.mockClear();
    await placeBubbleWindow(floating, { left: 1250.4, top: 200.7 }, () => true);
    expect(update).toHaveBeenLastCalledWith(3, { left: 1250, top: 201 });
  });
  it("discards a superseded docking request before moving the window", async () => {
    const { floating, update } = fixture();
    let current = true;
    update.mockImplementation(async () => {
      current = false;
      return { id: 3, width: 248, height: 110 };
    });
    await placeBubbleWindow(
      floating,
      { edge: "bottom", y: 0.5 },
      () => current,
    );
    expect(update).toHaveBeenCalledTimes(1);
    update.mockClear();
    await placeBubbleWindow(floating, { edge: "right", y: 0.4 }, () => false);
    expect(update).not.toHaveBeenCalled();
  });
});
