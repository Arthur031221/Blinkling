import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cropSharedScreen } from "./screen-crop";
import { selectCrop } from "./crop-selection";

vi.mock("./crop-selection", async (original) => ({
  ...(await original<typeof import("./crop-selection")>()),
  selectCrop: vi.fn(),
}));

const labels = {
  cropTitle: "Crop",
  cropHint: "Drag to select",
  cropConfirm: "Confirm",
  cropCancel: "Cancel",
};
let video: HTMLVideoElement;
let native: { id: number; state: string; width: number; height: number };
let draw: ReturnType<typeof vi.fn>;
let events: string[];
let fullscreen: Element | null;
let focusedWindow: number;
let chromeMock: {
  tabs: {
    getCurrent: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  windows: {
    getCurrent: ReturnType<typeof vi.fn>;
    getLastFocused: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  events = [];
  native = { id: 4, state: "normal", width: 1200, height: 900 };
  fullscreen = null;
  focusedWindow = 8;
  chromeMock = {
    tabs: {
      getCurrent: vi.fn(async () => ({ id: 17, windowId: 4, active: false })),
      query: vi.fn(async () => [{ id: 31, windowId: 4, active: true }]),
      update: vi.fn(async (id: number) => {
        events.push(`tab:${id}`);
      }),
    },
    windows: {
      getCurrent: vi.fn(async () => ({ ...native })),
      getLastFocused: vi.fn(async () => ({ id: focusedWindow, focused: true })),
      get: vi.fn(async (id: number) => ({
        ...(id === native.id ? native : { id }),
        focused: id === focusedWindow,
      })),
      update: vi.fn(
        async (id: number, update: { state?: string; focused?: boolean }) => {
          events.push(`window:${id}:${update.state || "focus"}`);
          if (update.focused) focusedWindow = id;
          if (id === native.id && update.state) {
            native = { ...native, ...update };
            if (update.state === "fullscreen") {
              native.width = 1440;
              native.height = 1000;
              vi.stubGlobal("innerWidth", 1440);
              vi.stubGlobal("innerHeight", 1000);
            }
          }
          return { ...native };
        },
      ),
    },
  };
  vi.stubGlobal("chrome", chromeMock);
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 813);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.spyOn(window.screen, "width", "get").mockReturnValue(1440);
  vi.spyOn(window.screen, "height", "get").mockReturnValue(1000);
  vi.spyOn(window, "focus").mockImplementation(() => {});
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreen,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreen = document.documentElement;
    }),
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreen = null;
    }),
  });
  draw = vi.fn((source) => {
    if (source === video) events.push("freeze");
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,eA==",
  );
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: vi.fn(async () => {}),
  });
  vi.spyOn(
    HTMLImageElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLImageElement) {
    return new DOMRect(
      0,
      0,
      parseFloat(this.style.width),
      parseFloat(this.style.height),
    );
  });
  video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { value: 1440 },
    videoHeight: { value: 1000 },
    requestVideoFrameCallback: {
      value: vi.fn((callback) => {
        setTimeout(
          () =>
            callback(performance.now(), {
              mediaTime: performance.now() / 1000,
            }),
          0,
        );
        return 1;
      }),
    },
    cancelVideoFrameCallback: { value: vi.fn() },
  });
  vi.mocked(selectCrop).mockResolvedValue({
    x: 1340,
    y: 900,
    width: 100,
    height: 100,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("foreground shared screen crop", () => {
  it("restores the compatibility bubble after freezing but before fullscreen consumes activation", async () => {
    const bubble = document.implementation.createHTMLDocument();
    Object.defineProperty(bubble, "defaultView", { value: { closed: false } });
    const clearBubble = {
      hide: vi.fn(async () => true),
      prepareSelection: vi.fn(async () => {
        events.push("prepare");
      }),
      relaySelection: vi.fn(),
      restore: vi.fn(async () => {}),
    };
    await cropSharedScreen(video, bubble, labels, { clearBubble });
    expect(events.indexOf("freeze")).toBeLessThan(events.indexOf("prepare"));
    expect(events.indexOf("prepare")).toBeLessThan(events.indexOf("tab:17"));
    expect(clearBubble.relaySelection).toHaveBeenCalledOnce();
    expect(clearBubble.restore).toHaveBeenCalledOnce();
  });

  it("crops a live shared track before the video decoder has metadata", async () => {
    video = document.createElement("video");
    const clone = {
      stop: vi.fn(),
      getConstraints: () => ({}),
      applyConstraints: vi.fn(async () => {}),
    };
    const track = Object.assign(new EventTarget(), {
      readyState: "live",
      getSettings: () => ({ displaySurface: "monitor" }),
      clone: vi.fn(() => clone),
    });
    video.srcObject = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    expect([video.videoWidth, video.videoHeight]).toEqual([0, 0]);
    const queued = { width: 1440, height: 1000, close: vi.fn() };
    const fresh = { width: 1440, height: 1000, close: vi.fn() };
    const grabFrame = vi
      .fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(fresh);
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { grabFrame };
      }),
    );
    await expect(cropSharedScreen(video, null, labels)).resolves.toBe(
      "data:image/png;base64,eA==",
    );
    expect(draw).toHaveBeenCalledWith(fresh, 0, 0);
    expect(draw).toHaveBeenLastCalledWith(
      expect.any(HTMLCanvasElement),
      1340,
      900,
      100,
      100,
      0,
      0,
      100,
      100,
    );
    expect(queued.close).toHaveBeenCalledOnce();
    expect(fresh.close).toHaveBeenCalledOnce();
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(track.readyState).toBe("live");
  });

  it.each(["browser", "window"])(
    "keeps the bubble present and dimmed during a %s-source crop even when clearance hooks are supplied",
    async (surface) => {
      const bubble = document.implementation.createHTMLDocument();
      bubble.body.style.opacity = "0.8";
      Object.defineProperty(bubble, "defaultView", {
        configurable: true,
        value: { closed: false },
      });
      const track = Object.assign(new EventTarget(), {
        readyState: "live",
        getSettings: () => ({ displaySurface: surface }),
      });
      Object.defineProperty(video, "srcObject", {
        configurable: true,
        value: { getVideoTracks: () => [track] },
      });
      const clearBubble = {
        hide: vi.fn(async () => {}),
        restore: vi.fn(async () => {}),
      };
      let selectionOpacity = "";
      vi.mocked(selectCrop).mockImplementation(async () => {
        selectionOpacity = bubble.body.style.opacity;
        return null;
      });
      expect(
        await cropSharedScreen(video, bubble, labels, { clearBubble }),
      ).toBeNull();
      expect(selectionOpacity).toBe("0.25");
      expect(clearBubble.hide).not.toHaveBeenCalled();
      expect(clearBubble.restore).not.toHaveBeenCalled();
      expect(bubble.body.style.opacity).toBe("0.8");
    },
  );

  it("freezes before activating the actual opener, then restores the previous tab and window", async () => {
    await cropSharedScreen(video, null, labels);
    expect(chromeMock.tabs.getCurrent).toHaveBeenCalled();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(17, { active: true });
    expect(events.indexOf("freeze")).toBeLessThan(events.indexOf("tab:17"));
    expect(chromeMock.tabs.update).toHaveBeenLastCalledWith(31, {
      active: true,
    });
    expect(chromeMock.windows.update).toHaveBeenLastCalledWith(8, {
      focused: true,
    });
  });

  it("preserves a Chrome window brought forward while selection is pending", async () => {
    chromeMock.windows.getLastFocused
      .mockResolvedValueOnce({ id: 8, focused: true })
      .mockResolvedValueOnce({ id: 11, focused: true });
    await cropSharedScreen(video, null, labels);
    expect(chromeMock.windows.update).toHaveBeenLastCalledWith(11, {
      focused: true,
    });
  });

  it("repairs late opener activation after native restoration acknowledges completion", async () => {
    chromeMock.windows.getLastFocused.mockResolvedValueOnce({
      id: 8,
      focused: true,
    });
    vi.mocked(selectCrop).mockImplementation(async () => {
      focusedWindow = 11;
      return null;
    });
    const update = chromeMock.windows.update.getMockImplementation()!;
    chromeMock.windows.update.mockImplementation(async (id, change) => {
      const result = await update(id, change);
      if (change.state === "normal")
        setTimeout(() => {
          focusedWindow = native.id;
        }, 120);
      return result;
    });
    expect(await cropSharedScreen(video, null, labels)).toBeNull();
    expect(focusedWindow).toBe(11);
    expect(
      chromeMock.windows.update.mock.calls.filter(
        ([id, change]) => id === 11 && change.focused,
      ),
    ).toHaveLength(2);
  });

  it("does not explicitly activate the old Chrome window after switching to another application", async () => {
    chromeMock.windows.getLastFocused
      .mockResolvedValueOnce({ id: 8, focused: true })
      .mockResolvedValueOnce({ id: 8, focused: false });
    await cropSharedScreen(video, null, labels);
    expect(chromeMock.windows.update).not.toHaveBeenCalledWith(8, {
      focused: true,
    });
  });

  it("restores the previous tab on cancellation and decode failure", async () => {
    vi.mocked(selectCrop).mockResolvedValue(null);
    expect(await cropSharedScreen(video, null, labels)).toBeNull();
    expect(chromeMock.tabs.update).toHaveBeenLastCalledWith(31, {
      active: true,
    });
    vi.mocked(HTMLImageElement.prototype.decode).mockRejectedValue(
      new Error("image_decode"),
    );
    await expect(cropSharedScreen(video, null, labels)).rejects.toThrow(
      "image_decode",
    );
    expect(chromeMock.tabs.update).toHaveBeenLastCalledWith(31, {
      active: true,
    });
    expect(document.querySelector("[data-glimpselet-frozen-crop]")).toBeNull();
  });
});

describe("native fullscreen shared screen crop", () => {
  it("ends an incomplete DOM fullscreen transition before requesting native fullscreen", async () => {
    const update = chromeMock.windows.update.getMockImplementation()!;
    chromeMock.windows.update.mockImplementation(async (id, change) => {
      const result = await update(id, change);
      // Chromium can report fullscreen but revert bounds when both DOM and
      // native fullscreen transitions overlap.
      if (change.state === "fullscreen" && fullscreen) {
        native.width = 1200;
        native.height = 900;
      }
      return result;
    });
    await cropSharedScreen(video, null, labels);
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(selectCrop).toHaveBeenCalledOnce();
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "normal",
    });
  });

  it("enforces native fullscreen even when DOM fullscreen resolves without changing native bounds", async () => {
    await cropSharedScreen(video, null, labels);
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "fullscreen",
      focused: true,
    });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "normal",
    });
    expect(draw).toHaveBeenLastCalledWith(
      expect.any(HTMLCanvasElement),
      1340,
      900,
      100,
      100,
      0,
      0,
      100,
      100,
    );
  });

  it("uses native fullscreen when the DOM request rejects", async () => {
    vi.mocked(document.documentElement.requestFullscreen).mockRejectedValue(
      new DOMException("No activation", "NotAllowedError"),
    );
    await cropSharedScreen(video, null, labels);
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "fullscreen",
      focused: true,
    });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "normal",
    });
  });

  it("preserves an already fullscreen native window and existing DOM fullscreen", async () => {
    native = { ...native, state: "fullscreen", width: 1440, height: 1000 };
    fullscreen = document.documentElement;
    vi.stubGlobal("innerWidth", 1440);
    vi.stubGlobal("innerHeight", 1000);
    await cropSharedScreen(video, null, labels);
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    expect(
      chromeMock.windows.update.mock.calls.filter(([, change]) => change.state),
    ).toEqual([]);
    expect(
      chromeMock.windows.update.mock.calls.every(
        ([, update]) => !update.state || update.state === "fullscreen",
      ),
    ).toBe(true);
  });

  it("returns a recoverable error and restores state when native fullscreen is refused", async () => {
    chromeMock.windows.update.mockImplementation(async (_id, update) => {
      if (update.state === "fullscreen")
        throw new Error("Window manager refused fullscreen");
      return { ...native };
    });
    await expect(cropSharedScreen(video, null, labels)).rejects.toThrow(
      "crop_fullscreen_denied",
    );
    expect(document.querySelector("[data-glimpselet-frozen-crop]")).toBeNull();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(chromeMock.tabs.update).toHaveBeenLastCalledWith(31, {
      active: true,
    });
  });

  it("maps far-edge HiDPI selections to the exact captured pixels", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    vi.mocked(selectCrop).mockResolvedValue({
      x: 670,
      y: 450,
      width: 50,
      height: 50,
    });
    await cropSharedScreen(video, null, labels);
    expect(vi.mocked(selectCrop).mock.calls[0][3]).toBe(2);
    expect(draw).toHaveBeenLastCalledWith(
      expect.any(HTMLCanvasElement),
      1340,
      900,
      100,
      100,
      0,
      0,
      100,
      100,
    );
  });

  it("rejects a resolved native request whose window still has clipped bounds", async () => {
    chromeMock.windows.update.mockImplementation(async (id, update) => {
      if (id === native.id && update.state) native.state = update.state;
      return { ...native };
    });
    await expect(cropSharedScreen(video, null, labels)).rejects.toThrow(
      "crop_fullscreen_denied",
    );
    expect(selectCrop).not.toHaveBeenCalled();
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "normal",
    });
    expect(document.querySelector("[data-glimpselet-frozen-crop]")).toBeNull();
  });

  it("cancels a visible selector and restores the native window when sharing ends", async () => {
    const track = Object.assign(new EventTarget(), {
      readyState: "live",
      getSettings: () => ({ displaySurface: "monitor" }),
    });
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      value: { getVideoTracks: () => [track] },
    });
    vi.mocked(selectCrop).mockImplementation(
      () =>
        new Promise((resolve) => {
          window.addEventListener(
            "keydown",
            (event) => {
              if (event.key === "Escape") resolve(null);
            },
            { once: true },
          );
          track.dispatchEvent(new Event("ended"));
        }),
    );
    await expect(cropSharedScreen(video, null, labels)).rejects.toThrow(
      "share_ended",
    );
    expect(chromeMock.windows.update).toHaveBeenCalledWith(4, {
      state: "normal",
    });
    expect(chromeMock.tabs.update).toHaveBeenLastCalledWith(31, {
      active: true,
    });
    expect(document.querySelector("[data-glimpselet-frozen-crop]")).toBeNull();
  });
});
