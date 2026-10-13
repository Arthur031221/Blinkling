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
      getLastFocused: vi.fn(async () => ({ id: 8 })),
      get: vi.fn(async () => ({ ...native })),
      update: vi.fn(
        async (id: number, update: { state?: string; focused?: boolean }) => {
          events.push(`window:${id}:${update.state || "focus"}`);
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
});
