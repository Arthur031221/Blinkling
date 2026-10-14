import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeBubbleClearance, withScreenPicker } from "./native-bubble";

describe("native monitor clearance", () => {
  let native: chrome.windows.Window;
  let floating: Window;
  beforeEach(() => {
    vi.useFakeTimers();
    native = {
      id: 8,
      state: "normal",
      focused: true,
      alwaysOnTop: true,
      left: 500,
      top: 150,
      width: 420,
      height: 650,
      tabs: [{ id: 19, url: "about:blank", openerTabId: 2 } as chrome.tabs.Tab],
    };
    floating = {
      closed: false,
      screen: { availWidth: 1920 },
      outerWidth: 420,
    } as Window;
    vi.stubGlobal("chrome", {
      tabs: {
        getCurrent: vi.fn(async () => ({ id: 2 })),
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
      windows: {
        getAll: vi.fn(async () => [native]),
        get: vi.fn(async () => native),
        update: vi.fn(
          async (_id: number, change: chrome.windows.UpdateInfo) => {
            native = { ...native, ...change };
            return native;
          },
        ),
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("brings a separate opener forward for the picker, then returns to the working page", async () => {
    Object.assign(chrome.tabs, {
      get: vi.fn(async () => ({ id: 21, windowId: 4 })),
    });
    vi.mocked(chrome.tabs.getCurrent).mockResolvedValue({
      id: 2,
      windowId: 6,
    } as chrome.tabs.Tab);
    const openPicker = vi.fn(async () => {
      expect(chrome.windows.update).toHaveBeenCalledWith(6, { focused: true });
      return "stream";
    });
    await expect(withScreenPicker(floating, 21, openPicker)).resolves.toBe(
      "stream",
    );
    expect(chrome.windows.update).toHaveBeenLastCalledWith(4, {
      focused: true,
    });
  });

  it.each([
    [500, 150],
    [920, 330],
  ])(
    "restores pre-picker geometry at %s,%s on success and cancellation",
    async (left, top) => {
      Object.assign(native, { left, top });
      Object.assign(chrome.tabs, {
        get: vi.fn(async () => ({ id: 21, windowId: 4 })),
      });
      vi.mocked(chrome.tabs.getCurrent).mockResolvedValue({
        id: 2,
        windowId: 6,
      } as chrome.tabs.Tab);
      const before = { ...native };
      await withScreenPicker(floating, 21, async () => {
        native = { ...native, left: 100, top: 40 };
      });
      expect(native).toMatchObject({
        left: before.left,
        top: before.top,
        width: before.width,
        height: before.height,
      });
      const cancelled = new DOMException("Cancelled", "NotAllowedError");
      await expect(
        withScreenPicker(floating, 21, async () => {
          native = { ...native, left: 0, top: 0 };
          throw cancelled;
        }),
      ).rejects.toBe(cancelled);
      expect(native).toMatchObject({
        left: before.left,
        top: before.top,
        width: before.width,
        height: before.height,
      });
    },
  );

  it("preserves native identity, bounds and initial focus without a new PiP gesture", async () => {
    const before = { ...native };
    const hook = nativeBubbleClearance(floating);
    expect(await hook.hide()).toBe(true);
    expect(native.state).toBe("minimized");
    expect(floating.closed).toBe(false);
    await hook.restore();
    expect(native).toEqual(before);
    expect(chrome.windows.update).toHaveBeenCalledTimes(3);
  });

  it("waits for real native state transitions instead of trusting update completion", async () => {
    vi.mocked(chrome.windows.update).mockImplementation(async (_id, change) => {
      setTimeout(() => {
        native = { ...native, ...change };
      }, 120);
      return native;
    });
    const hook = nativeBubbleClearance(floating);
    const hide = hook.hide();
    await vi.advanceTimersByTimeAsync(80);
    expect(native.state).toBe("normal");
    await vi.advanceTimersByTimeAsync(80);
    expect(await hide).toBe(true);
    const restore = hook.restore();
    await vi.advanceTimersByTimeAsync(160);
    await restore;
    expect(native.state).toBe("normal");
  });

  it("requests deactivation when a background capture started with an unfocused bubble", async () => {
    native.focused = false;
    const hook = nativeBubbleClearance(floating);
    await hook.hide();
    await hook.restore();
    expect(native.state).toBe("normal");
    expect(native.focused).toBe(false);
  });

  it("rolls back a partial minimize and releases clearance after failure", async () => {
    vi.mocked(chrome.windows.update).mockImplementationOnce(
      async (_id, change) => {
        native = { ...native, ...change };
        throw new Error("Partial native failure");
      },
    );
    const hook = nativeBubbleClearance(floating);
    await expect(hook.hide()).rejects.toThrow("Partial native failure");
    await hook.restore();
    expect(native.state).toBe("normal");
    const next = nativeBubbleClearance(floating);
    expect(await next.hide()).toBe(true);
    await next.restore();
  });

  it("preserves a different foreground window across asynchronous native restoration", async () => {
    let foreground = {
      id: 4,
      state: "normal",
      focused: true,
    } as chrome.windows.Window;
    const hook = nativeBubbleClearance(floating);
    await hook.hide();
    native = { ...native, focused: false };
    vi.mocked(chrome.windows.getAll).mockImplementation(async () => [
      native,
      foreground,
    ]);
    vi.mocked(chrome.windows.update).mockImplementation(async (id, change) => {
      if (id === foreground.id) {
        foreground = { ...foreground, ...change };
        native = { ...native, focused: false };
        return foreground;
      }
      setTimeout(() => {
        native = { ...native, ...change, focused: true };
        foreground = { ...foreground, focused: false };
      }, 120);
      return native;
    });
    const restore = hook.restore();
    await vi.advanceTimersByTimeAsync(160);
    await restore;
    expect(native.state).toBe("normal");
    expect(native.focused).toBe(false);
    expect(foreground.focused).toBe(true);
  });

  it("releases native focus if the foreground window closes during restoration", async () => {
    const hook = nativeBubbleClearance(floating);
    await hook.hide();
    vi.mocked(chrome.windows.getAll).mockResolvedValue([
      { ...native, focused: false },
      { id: 4, focused: true } as chrome.windows.Window,
    ]);
    const update = vi.mocked(chrome.windows.update).getMockImplementation()!;
    vi.mocked(chrome.windows.update).mockImplementation(async (id, change) => {
      if (id === 4) throw new Error("Window closed");
      return update(id, change);
    });
    await hook.restore();
    expect(native.state).toBe("normal");
    expect(native.focused).toBe(false);
  });

  it("serializes concurrent snapshots so one cannot restore over another", async () => {
    const first = nativeBubbleClearance(floating);
    const second = nativeBubbleClearance(floating);
    await first.hide();
    const pending = second.hide();
    await vi.advanceTimersByTimeAsync(100);
    expect(chrome.windows.update).toHaveBeenCalledOnce();
    await first.restore();
    await pending;
    expect(native.state).toBe("minimized");
    await second.restore();
    expect(native.state).toBe("normal");
  });

  it("fails closed if minimizing is ineffective and still attempts restoration", async () => {
    vi.mocked(chrome.windows.update).mockResolvedValue(native);
    const hook = nativeBubbleClearance(floating);
    const rejected = expect(hook.hide()).rejects.toThrow(
      "capture_bubble_obstructed",
    );
    await vi.advanceTimersByTimeAsync(2040);
    await rejected;
    await hook.restore();
    expect(chrome.windows.update).toHaveBeenLastCalledWith(8, {
      focused: true,
    });
  });

  it("ignores unrelated always-on-top windows", async () => {
    native.tabs![0].openerTabId = 99;
    const hook = nativeBubbleClearance(floating);
    await expect(hook.hide()).rejects.toThrow("capture_bubble_obstructed");
    await hook.restore();
    expect(chrome.windows.update).not.toHaveBeenCalled();
  });

  function forbidMinimize() {
    vi.mocked(chrome.windows.update).mockRejectedValueOnce(
      new Error("Operation not allowed for picture-in-picture windows"),
    );
  }

  function replacement() {
    const doc = document.implementation.createHTMLDocument();
    doc.body.style.opacity = ".75";
    const next = { closed: false, document: doc } as Window;
    return {
      next,
      close: vi.fn(() => {
        Object.defineProperty(floating, "closed", { value: true });
      }),
      open: vi.fn(async () => {
        native = { ...native, id: 9 };
        return next;
      }),
    };
  }

  it("automatically reopens with the original placement when Chrome forbids minimizing", async () => {
    vi.stubGlobal("navigator", { userActivation: { isActive: true } });
    forbidMinimize();
    const fallback = replacement();
    const before = { ...native };
    const hook = nativeBubbleClearance(floating, fallback);
    expect(await hook.hide()).toBe(true);
    expect(floating.closed).toBe(true);
    await hook.restore();
    expect(fallback.open).toHaveBeenCalledOnce();
    expect(native).toMatchObject({ ...before, id: 9 });
    expect(fallback.next.document.body.style.opacity).toBe("0.75");
  });

  it("reopens before fullscreen and survives cancellation after activation expires", async () => {
    const activation = { isActive: true };
    vi.stubGlobal("navigator", { userActivation: activation });
    forbidMinimize();
    const fallback = replacement();
    const hook = nativeBubbleClearance(floating, fallback);
    await hook.hide();
    await hook.prepareSelection!();
    expect(fallback.open).toHaveBeenCalledOnce();
    expect(fallback.next.document.body.style.opacity).toBe("0.25");
    activation.isActive = false;
    await hook.restore();
    expect(fallback.open).toHaveBeenCalledOnce();
    expect(fallback.next.document.body.style.opacity).toBe("0.75");
  });

  it("keeps the bubble intact when neither minimizing nor automatic reopening is permitted", async () => {
    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    forbidMinimize();
    const fallback = replacement();
    const hook = nativeBubbleClearance(floating, fallback);
    await expect(hook.hide()).rejects.toThrow("capture_bubble_obstructed");
    await hook.restore();
    expect(fallback.close).not.toHaveBeenCalled();
    expect(fallback.open).not.toHaveBeenCalled();
    expect(chrome.windows.update).toHaveBeenCalledOnce();
    expect(floating.closed).toBe(false);
  });

  it("preserves the current Chrome foreground window after replacement", async () => {
    vi.stubGlobal("navigator", { userActivation: { isActive: true } });
    forbidMinimize();
    const fallback = replacement();
    const hook = nativeBubbleClearance(floating, fallback);
    await hook.hide();
    native.focused = false;
    vi.mocked(chrome.windows.getAll).mockImplementation(async () => [
      native,
      { id: 4, focused: true } as chrome.windows.Window,
    ]);
    await hook.restore();
    expect(chrome.windows.update).toHaveBeenLastCalledWith(4, {
      focused: true,
    });
  });

  it("does not recreate a bubble closed while capture was pending", async () => {
    const hook = nativeBubbleClearance(floating);
    await hook.hide();
    Object.defineProperty(floating, "closed", { value: true });
    await hook.restore();
    expect(chrome.windows.update).toHaveBeenCalledOnce();
    const next = nativeBubbleClearance(floating);
    await expect(next.hide()).rejects.toThrow("capture_bubble_obstructed");
    await next.restore();
    expect(chrome.windows.update).toHaveBeenCalledOnce();
  });
});
