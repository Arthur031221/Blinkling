import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./privacy", () => ({ hasSensitiveContent: vi.fn(() => false) }));
vi.mock("./png", () => ({ encodeCanvasPng: vi.fn(() => "stitched-png") }));

const tab = { id: 7, windowId: 1, url: "https://public.test/" };
const metrics = {
  x: 4,
  y: 8,
  width: 200,
  height: 100,
  viewportWidth: 100,
  viewportHeight: 100,
  frameWidth: 100,
  frameHeight: 100,
};
const drawImage = vi.fn();

function setupChrome(captureVisibleTab = vi.fn(async () => "tile-png")) {
  const executeScript = vi.fn(
    async (details: { func: () => unknown; args?: unknown[] }) => {
      const source = details.func.toString();
      if (source.includes("scrollWidth")) return [{ result: metrics }];
      if (details.args?.[0] === null) return [{ result: false }];
      return [{ result: undefined }];
    },
  );
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    tabs: {
      get: vi.fn(async () => tab),
      query: vi.fn(async () => [tab]),
      sendMessage: vi.fn(async () => ({})),
      captureVisibleTab,
    },
    permissions: { contains: vi.fn(async () => true) },
    scripting: { executeScript },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  class FakeImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      if (value) queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return { executeScript, captureVisibleTab };
}

describe("full-page capture progress and cancellation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    drawImage.mockClear();
  });

  it("reports the initial and completed tile counts", async () => {
    setupChrome();
    const { captureWeb } = await import("./capture");
    const progress = vi.fn();

    const result = await captureWeb("full", undefined, undefined, {
      onProgress: progress,
    });

    expect(result.capture.image).toBe("stitched-png");
    expect(progress.mock.calls).toEqual([
      [{ completed: 0, total: 2 }],
      [{ completed: 1, total: 2 }],
      [{ completed: 2, total: 2 }],
    ]);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  it("cancels after an in-flight tile and restores the original scroll", async () => {
    let markCaptureStarted!: () => void;
    const captureStarted = new Promise<void>((resolve) => {
      markCaptureStarted = resolve;
    });
    let resolveCapture!: (image: string) => void;
    const captureVisibleTab = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveCapture = resolve;
          markCaptureStarted();
        }),
    );
    const { executeScript } = setupChrome(captureVisibleTab);
    const { captureWeb } = await import("./capture");
    const controller = new AbortController();
    const progress = vi.fn();

    const capture = captureWeb("full", undefined, undefined, {
      signal: controller.signal,
      onProgress: progress,
    });
    await captureStarted;
    controller.abort();
    resolveCapture("tile-png");

    await expect(capture).rejects.toThrow("capture_cancelled");
    expect(progress.mock.calls).toEqual([[{ completed: 0, total: 2 }]]);
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ args: [metrics.x, metrics.y] }),
    );
  });
});

describe("explicit guide context", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupGuide() {
    const mocks = setupChrome();
    const page = {
      url: tab.url,
      documentKey: "content-seven",
      title: "Public",
      text: "Export",
      elements: [],
      hasPassword: false,
      guideScope: "top-document-text",
      excludedEmbeds: 1,
    };
    Object.assign(chrome, {
      storage: {
        local: { get: vi.fn(async () => ({ blocklist: [] as string[] })) },
      },
    });
    mocks.executeScript.mockImplementation(async () => [
      { result: false, documentId: "document-seven", frameId: 0 },
    ]);
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(page);
    return { ...mocks, page };
  }

  it("requests text and map with document pinning and no screenshot", async () => {
    const { page, executeScript, captureVisibleTab } = setupGuide();
    const { getGuideContext } = await import("./capture");
    expect(await getGuideContext()).toEqual(page);
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      tab.id,
      { type: "glimpselet:guide-context" },
      { documentId: "document-seven" },
    );
    expect(executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { tabId: tab.id, documentIds: ["document-seven"] },
        args: [null, true],
      }),
    );
  });

  it.each([
    "initial-password",
    "later-password",
    "reloaded",
    "url-changed",
    "content-error",
    "wrong-context",
    "blocked",
    "later-blocked",
    "password-during-blocklist",
    "expected-document-changed",
  ])("rejects an explicit guide when %s", async (reason) => {
    const { page, executeScript } = setupGuide();
    if (reason === "blocked")
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        blocklist: ["test", "PUBLIC.TEST"],
      });
    if (reason === "later-blocked")
      vi.mocked(chrome.storage.local.get)
        .mockResolvedValueOnce({ blocklist: [] })
        .mockResolvedValue({ blocklist: ["PUBLIC.TEST"] });
    if (reason === "password-during-blocklist")
      vi.mocked(chrome.storage.local.get)
        .mockResolvedValueOnce({ blocklist: [] })
        .mockImplementation(async () => {
          executeScript.mockResolvedValue([
            { result: true, documentId: "document-seven", frameId: 0 },
          ]);
          return { blocklist: [] };
        });
    if (reason === "initial-password")
      executeScript.mockResolvedValue([
        { result: true, documentId: "document-seven", frameId: 0 },
      ]);
    if (reason === "content-error")
      vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
        error: "password_page",
      });
    if (reason === "wrong-context") page.url = "https://another.test/";
    if (["later-password", "reloaded", "url-changed"].includes(reason)) {
      vi.mocked(chrome.tabs.sendMessage).mockImplementation(
        async (_id, message) => {
          if (message.type === "glimpselet:guide-context") {
            if (reason === "later-password")
              executeScript.mockResolvedValue([
                { result: true, documentId: "document-seven", frameId: 0 },
              ]);
            if (reason === "reloaded")
              executeScript.mockResolvedValue([
                {
                  result: false,
                  documentId: "replacement-document",
                  frameId: 0,
                },
              ]);
            if (reason === "url-changed")
              vi.mocked(chrome.tabs.get).mockResolvedValue({
                ...tab,
                url: "https://public.test/login",
              });
          }
          return page;
        },
      );
    }
    const { getGuideContext } = await import("./capture");
    await expect(
      getGuideContext(
        reason === "expected-document-changed"
          ? { documentKey: "previous-content", url: page.url }
          : undefined,
      ),
    ).rejects.toThrow(
      reason.includes("password") || reason === "content-error"
        ? "password_page"
        : reason.includes("blocked")
          ? "blocked_page"
          : "tab_changed",
    );
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });
});
