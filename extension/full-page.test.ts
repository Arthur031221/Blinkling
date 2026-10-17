import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encoded: string[] = [];
vi.mock("./png", () => ({
  encodeCanvasPng: vi.fn(async (canvas: { width: number; height: number }) => {
    encoded.push(`${canvas.width}x${canvas.height}`);
    return `tile-${encoded.length}`;
  }),
}));
vi.mock("./privacy", () => ({ hasSensitiveContent: vi.fn(() => false) }));
vi.mock("./full-page-layout", () => ({ fullPageLayout: vi.fn() }));

import { fullPageLayout } from "./full-page-layout";
import { hasSensitiveContent } from "./privacy";
import { captureFullPage } from "./full-page";

const tab = {
  id: 7,
  windowId: 3,
  active: true,
  url: "https://example.test/article",
} as chrome.tabs.Tab & { id: number; windowId: number; url: string };
const base = {
  x: 0,
  y: 120,
  width: 1280,
  height: 1500,
  viewportWidth: 1280,
  viewportHeight: 800,
  frameWidth: 1280,
  frameHeight: 800,
  devicePixelRatio: 1,
  title: "Article",
};

class FakeCanvas {
  drawn = 0;
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { drawImage: () => this.drawn++ };
  }
}

function setup(metrics = base, options: { onShot?: () => void } = {}) {
  const scrolls: Array<[number, number]> = [];
  const sensitive = hasSensitiveContent as unknown as ReturnType<typeof vi.fn>;
  const captureVisibleTab = vi.fn(async () => {
    options.onShot?.();
    return "data:image/png;base64,AAA=";
  });
  const executeScript = vi.fn(async (details: { files?: string[] }) => {
    if (details.func === hasSensitiveContent)
      return [{ result: sensitive(), frameId: 0 }];
    if (details.func === fullPageLayout) return [{ result: undefined }];
    if (details.args?.length === 2) {
      scrolls.push(details.args);
      return [{ result: undefined }];
    }
    return [{ result: metrics, documentId: "doc" }];
  });
  vi.stubGlobal("chrome", {
    tabs: {
      get: vi.fn(async () => tab),
      captureVisibleTab,
    },
    scripting: { executeScript },
  });
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: metrics.frameWidth,
      height: metrics.frameHeight,
      close: () => {},
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ blob: async () => new Blob(["x"]) })),
  );
  return { scrolls, captureVisibleTab, executeScript, sensitive };
}

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = (await settled) as { value?: T; error?: unknown };
  if ("error" in result) throw result.error;
  return result.value as T;
}

beforeEach(() => {
  encoded.length = 0;
  vi.useFakeTimers();
  vi.mocked(hasSensitiveContent).mockReset().mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("full-page capture", () => {
  it("reports the initial and completed frame counts and returns the page tile", async () => {
    setup();
    const progress = vi.fn();
    const result = await run(captureFullPage(tab, { onProgress: progress }));
    expect(progress.mock.calls).toEqual([
      [{ completed: 0, total: 2 }],
      [{ completed: 1, total: 2 }],
      [{ completed: 2, total: 2 }],
    ]);
    expect(result).toEqual({
      images: ["tile-1"],
      truncated: false,
      page: { url: tab.url, title: "Article" },
    });
    expect(encoded).toEqual(["1280x1500"]);
  });

  it("sends a long page as readable tiles at 1x or better, not one squeezed image", async () => {
    setup({ ...base, height: 20_000 });
    const progress = vi.fn();
    const result = await run(captureFullPage(tab, { onProgress: progress }));
    expect(result.images).toHaveLength(8);
    expect(result.truncated).toBe(false);
    expect(encoded).toEqual(Array(8).fill("1280x2500"));
    expect(progress).toHaveBeenLastCalledWith({ completed: 25, total: 25 });
  });

  it("keeps readable tiles and says so when the page is longer than they can hold", async () => {
    setup({ ...base, height: 60_000, viewportHeight: 1000, frameHeight: 1000 });
    const result = await run(captureFullPage(tab));
    expect(result.images).toHaveLength(8);
    expect(result.truncated).toBe(true);
    expect(encoded).toEqual(Array(8).fill("1280x4096"));
  });

  it("cuts a very long page at the tile limit instead of refusing it", async () => {
    // A long specification: 977 x 130386 is over the area limit as a whole, but
    // only the first eight tiles are ever drawn.
    setup({
      ...base,
      width: 977,
      height: 130_386,
      viewportWidth: 977,
      frameWidth: 977,
      viewportHeight: 669,
      frameHeight: 669,
    });
    const result = await run(captureFullPage(tab));
    expect(result.images).toHaveLength(8);
    expect(result.truncated).toBe(true);
  });

  it("still refuses a page whose captured part is too big to draw", async () => {
    setup({ ...base, width: 40_000, height: 4000 });
    await expect(run(captureFullPage(tab))).rejects.toThrow("page_too_large");
  });

  it("restores the layout and the original scroll when it is done", async () => {
    const { scrolls, executeScript } = setup();
    await run(captureFullPage(tab));
    expect(scrolls.at(-1)).toEqual([0, 120]);
    const modes = executeScript.mock.calls
      .filter(([d]) => d.func === fullPageLayout)
      .map(([d]) => d.args[0]);
    expect(modes[0]).toBe("begin");
    expect(modes.at(-1)).toBe("end");
  });

  it("spaces screenshots to respect Chrome's quota", async () => {
    const times: number[] = [];
    setup(base, { onShot: () => times.push(Date.now()) });
    await run(captureFullPage(tab));
    expect(times).toHaveLength(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(550);
  });

  it("cancels after an in-flight tile and restores the original scroll", async () => {
    const controller = new AbortController();
    const { scrolls, captureVisibleTab } = setup(base, {
      onShot: () => controller.abort(),
    });
    const progress = vi.fn();
    await expect(
      run(
        captureFullPage(tab, {
          signal: controller.signal,
          onProgress: progress,
        }),
      ),
    ).rejects.toThrow("capture_cancelled");
    expect(progress.mock.calls).toEqual([[{ completed: 0, total: 2 }]]);
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(scrolls.at(-1)).toEqual([0, 120]);
  });

  it("refuses a page with a password field, before and during capture", async () => {
    const first = setup();
    first.sensitive.mockReturnValue(true);
    await expect(run(captureFullPage(tab))).rejects.toThrow("password_page");
    expect(first.captureVisibleTab).not.toHaveBeenCalled();

    const later = setup();
    later.sensitive
      .mockReturnValueOnce(false) // before starting
      .mockReturnValueOnce(false) // before the first screenshot
      .mockReturnValue(true); // after it
    await expect(run(captureFullPage(tab))).rejects.toThrow("password_page");
    expect(later.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(later.scrolls.at(-1)).toEqual([0, 120]);
  });

  it("stops when the user switches tabs", async () => {
    const { captureVisibleTab } = setup();
    vi.mocked(chrome.tabs.get).mockResolvedValue({ ...tab, active: false });
    await expect(run(captureFullPage(tab))).rejects.toThrow("tab_changed");
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });
});
