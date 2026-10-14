import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./privacy", () => ({ hasSensitiveContent: vi.fn(() => false) }));
vi.mock("./png", async (original) => ({
  ...(await original<typeof import("./png")>()),
  encodeCanvasPng: vi.fn(() => "stitched-png"),
}));

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
const viewportGeometry = {
  width: 100,
  height: 100,
  scrollX: 4,
  scrollY: 8,
  devicePixelRatio: 1,
};

describe("starting a shared screen without taking a snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupShare() {
    setupChrome();
    const track = { readyState: "live", stop: vi.fn() };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    };
    const getDisplayMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia },
    });
    return { stream, track, getDisplayMedia };
  }

  it("starts the native picker immediately and keeps sharing without freezing or closing PiP", async () => {
    const { stream, track, getDisplayMedia } = setupShare();
    let resolveTab!: (value: typeof tab) => void;
    vi.mocked(chrome.tabs.get).mockReturnValue(
      new Promise((resolve) => {
        resolveTab = resolve;
      }),
    );
    const freeze = vi.spyOn(
      await import("./screen-frame"),
      "freezeSharedFrame",
    );
    const { startScreenShare } = await import("./capture");

    const pending = startScreenShare(tab.id);
    expect(getDisplayMedia).toHaveBeenCalledOnce();
    resolveTab(tab);
    const result = await pending;

    expect(result.stream).toBe(stream);
    expect(result).not.toHaveProperty("image");
    expect(freeze).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("reports picker cancellation without taking a snapshot", async () => {
    const { track, getDisplayMedia } = setupShare();
    const cancelled = new DOMException("Picker cancelled", "NotAllowedError");
    getDisplayMedia.mockRejectedValue(cancelled);
    const { startScreenShare } = await import("./capture");

    await expect(startScreenShare(tab.id)).rejects.toBe(cancelled);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("sets conditional focus before starting the picker without waiting for source metadata", async () => {
    const { getDisplayMedia } = setupShare();
    const setFocusBehavior = vi.fn();
    const controller = { setFocusBehavior };
    vi.stubGlobal(
      "CaptureController",
      vi.fn(function () {
        return controller;
      }),
    );
    const { startScreenShare } = await import("./capture");
    await startScreenShare(tab.id);
    expect(setFocusBehavior).toHaveBeenCalledWith("no-focus-change");
    expect(getDisplayMedia.mock.calls[0][0]).toMatchObject({ controller });
    expect(setFocusBehavior.mock.invocationCallOrder[0]).toBeLessThan(
      getDisplayMedia.mock.invocationCallOrder[0],
    );
  });

  it("cleans up a share that ended while its source was being prepared", async () => {
    const { track } = setupShare();
    let resolveTab!: (value: typeof tab) => void;
    vi.mocked(chrome.tabs.get).mockReturnValue(
      new Promise((resolve) => {
        resolveTab = resolve;
      }),
    );
    const { startScreenShare } = await import("./capture");
    const pending = startScreenShare(tab.id);
    track.readyState = "ended";
    resolveTab(tab);

    await expect(pending).rejects.toThrow("share_ended");
    expect(track.stop).toHaveBeenCalledOnce();
  });
});

function setupChrome(captureVisibleTab = vi.fn(async () => "tile-png")) {
  const executeScript = vi.fn(
    async (details: { func: () => unknown; args?: unknown[] }) => {
      const source = details.func.toString();
      const result = source.includes("scrollWidth")
        ? metrics
        : source.includes("devicePixelRatio")
          ? viewportGeometry
          : details.args?.[0] === null
            ? false
            : undefined;
      return [{ result, documentId: "document-seven", frameId: 0 }];
    },
  );
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    tabs: {
      update: vi.fn(async () => tab),
      get: vi.fn(async () => tab),
      query: vi.fn(async () => [tab]),
      sendMessage: vi.fn(async () => ({})),
      captureVisibleTab,
    },
    windows: { update: vi.fn(async () => ({ id: tab.windowId })) },
    permissions: { contains: vi.fn(async () => true) },
    scripting: { executeScript },
    storage: { local: { get: vi.fn(async () => ({ blocklist: [] })) } },
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

  it("allows a visible capture answer only after independent pixel privacy checks", async () => {
    const { executeScript, captureVisibleTab } = setupChrome();
    const page = {
      url: tab.url,
      documentKey: "document-seven",
      title: "Public mug",
      text: "350 ml · ¥2,290",
      elements: [],
      hasPassword: false,
      textScope: "top-document-text" as const,
      excludedEmbeds: 2,
    };
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(page);
    const { encodeCanvasPng } = await import("./png");
    vi.mocked(encodeCanvasPng).mockReturnValueOnce(
      "data:image/png;base64,AAA=",
    );
    const { captureWeb } = await import("./capture");
    const { validateAsk } = await import("./api");
    const result = await captureWeb("visible");
    const request = {
      id: "answer-visible-capture",
      question: "What is the price and capacity?",
      kind: "ask" as const,
      model: "haiku" as const,
      effort: "low" as const,
      image: result.capture.image,
    };
    expect(() => validateAsk({ ...request, page })).toThrow(
      "explicit_text_only",
    );
    expect(() => validateAsk({ ...request, page: result.page })).not.toThrow();
    expect(result.page?.textScope).toBeUndefined();
    expect(result.page?.text).toBe(page.text);
    expect(page.textScope).toBe("top-document-text");
    expect(captureVisibleTab).toHaveBeenCalledOnce();
    expect(
      executeScript.mock.calls.filter(
        ([details]) => details.args?.[0] === null,
      ),
    ).toEqual([
      [expect.objectContaining({ args: [null, "visible-capture"] })],
      [expect.objectContaining({ args: [null, "visible-capture"] })],
      [expect.objectContaining({ args: [null, "visible-capture"] })],
    ]);
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

describe("web screenshot authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    drawImage.mockClear();
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, "userActivation");
  });

  const geometry = {
    width: 100,
    height: 100,
    scrollX: 4,
    scrollY: 8,
    devicePixelRatio: 1,
  };
  const rect: [number, number, number, number] = [10, 20, 30, 40];

  function setupAuthorization(
    captureVisibleTab = vi.fn(async () => "tile-png"),
  ) {
    const mocks = setupChrome(captureVisibleTab);
    let documentId = "document-seven";
    let currentGeometry = { ...geometry };
    mocks.executeScript.mockImplementation(async (details) => {
      if (details.func.toString().includes("devicePixelRatio"))
        return [{ result: currentGeometry, documentId, frameId: 0 }];
      if (details.args?.[0] === null)
        return [{ result: false, documentId, frameId: 0 }];
      return [{ result: 100, documentId, frameId: 0 }];
    });
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(
      async (_tabId, message) =>
        message.type === "glimpselet:select" ? { rect } : { url: tab.url },
    );
    return {
      ...mocks,
      setDocument: (next: string) => {
        documentId = next;
      },
      setGeometry: (next: typeof geometry) => {
        currentGeometry = next;
      },
    };
  }

  it.each(["grant", "deny", "navigation", "repeat-failure"])(
    "requests screenshot access on a capture gesture and handles %s without stale pixels",
    async (outcome) => {
      vi.useFakeTimers();
      const captureVisibleTab = vi
        .fn(async () => "tile-png")
        .mockRejectedValueOnce(new Error("Missing capture permission"));
      setupAuthorization(captureVisibleTab);
      Object.defineProperty(navigator, "userActivation", {
        configurable: true,
        value: { isActive: true },
      });
      const request = vi.fn(async () => {
        if (outcome === "navigation")
          vi.mocked(chrome.tabs.get).mockResolvedValue({
            ...tab,
            url: "https://public.test/changed",
          });
        return outcome !== "deny";
      });
      Object.assign(chrome.permissions, { request });
      if (outcome === "repeat-failure")
        captureVisibleTab.mockRejectedValue(new Error("Capture failed"));
      const { captureWeb } = await import("./capture");
      const capture = captureWeb("visible");
      const expected =
        outcome === "grant"
          ? expect(capture).resolves.toMatchObject({
              capture: { image: expect.any(String) },
            })
          : expect(capture).rejects.toThrow(
              outcome === "navigation" ? "tab_changed" : "capture_permission",
            );
      await vi.runAllTimersAsync();
      await expected;
      expect(request).toHaveBeenCalledExactlyOnceWith({
        origins: ["<all_urls>"],
      });
      expect(captureVisibleTab).toHaveBeenCalledTimes(
        ["grant", "repeat-failure"].includes(outcome) ? 2 : 1,
      );
    },
  );

  it.each(["region", "element"] as const)(
    "requires screenshot activation before opening the %s selector",
    async (kind) => {
      const captureVisibleTab = vi.fn(async () => {
        throw new Error("activeTab permission required");
      });
      setupAuthorization(captureVisibleTab);
      const { captureWeb } = await import("./capture");

      await expect(captureWeb(kind)).rejects.toThrow("capture_permission");

      expect(captureVisibleTab).toHaveBeenCalledTimes(1);
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        tab.id,
        expect.objectContaining({ type: "glimpselet:select" }),
      );
      expect(chrome.permissions.contains).toHaveBeenCalledWith({
        origins: ["https://public.test/*"],
      });
    },
  );

  it("spaces authorization and capture calls to respect Chrome's screenshot quota", async () => {
    vi.useFakeTimers();
    const capturedAt: number[] = [];
    const captureVisibleTab = vi.fn(async () => {
      capturedAt.push(Date.now());
      return "tile-png";
    });
    setupAuthorization(captureVisibleTab);
    const { captureWeb } = await import("./capture");

    const capture = captureWeb("region");
    await vi.runAllTimersAsync();
    await capture;

    expect(capturedAt).toHaveLength(2);
    expect(capturedAt[1] - capturedAt[0]).toBeGreaterThanOrEqual(550);
  });

  it.each([
    "source",
    "navigation",
    "same-url-reload",
    "scroll",
    "viewport",
    "pixel-ratio",
  ])(
    "rejects an externally selected rectangle after a %s change",
    async (change) => {
      const captureVisibleTab = vi.fn(async () => {
        throw new Error("activeTab permission required");
      });
      const { setDocument, setGeometry } =
        setupAuthorization(captureVisibleTab);
      const { captureWeb, setCurrentActiveTab } = await import("./capture");
      const selectedSource = {
        tabId: tab.id,
        url: tab.url,
        documentId: "document-seven",
        geometry: { ...geometry },
      };
      if (change === "source") {
        setCurrentActiveTab(8);
        vi.mocked(chrome.tabs.get).mockResolvedValue({ ...tab, id: 8 });
        vi.mocked(chrome.tabs.query).mockResolvedValue([{ ...tab, id: 8 }]);
      }
      if (change === "navigation") {
        const navigated = { ...tab, url: "https://public.test/another" };
        vi.mocked(chrome.tabs.get).mockResolvedValue(navigated);
        vi.mocked(chrome.tabs.query).mockResolvedValue([navigated]);
      }
      if (change === "same-url-reload") setDocument("replacement-document");
      if (change === "scroll") setGeometry({ ...geometry, scrollY: 9 });
      if (change === "viewport") setGeometry({ ...geometry, width: 101 });
      if (change === "pixel-ratio")
        setGeometry({ ...geometry, devicePixelRatio: 2 });

      const error = await captureWeb("region", rect, undefined, {
        selectedSource,
      }).catch((reason) => reason);

      expect(error.message).toBe("tab_changed");
      expect(error).not.toHaveProperty("pending");
      expect(captureVisibleTab).not.toHaveBeenCalled();
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
      expect(drawImage).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "pins an external selection before preserving and retrying it, with geometry: %s",
    async (includeGeometry) => {
      const captureVisibleTab = vi.fn(async () => {
        throw new Error("activeTab permission required");
      });
      const { executeScript } = setupAuthorization(captureVisibleTab);
      const { captureWeb, retryPendingWebCapture } = await import("./capture");
      const selectedSource = {
        tabId: tab.id,
        url: tab.url,
        documentId: "document-seven",
        ...(includeGeometry ? { geometry: { ...geometry } } : {}),
      };

      const error = await captureWeb("region", rect, undefined, {
        selectedSource,
      }).catch((reason) => reason);

      expect(error.message).toBe("capture_permission");
      expect(executeScript).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          target: { tabId: tab.id, documentIds: [selectedSource.documentId] },
        }),
      );
      expect(error.pending).toEqual({
        tabId: tab.id,
        url: tab.url,
        documentId: selectedSource.documentId,
        geometry,
        kind: "region",
        rect,
      });
      captureVisibleTab.mockResolvedValue("tile-png");

      const result = await retryPendingWebCapture(error.pending);

      expect(result.capture.image).toBe("stitched-png");
      expect(captureVisibleTab).toHaveBeenCalledTimes(2);
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        tab.id,
        expect.objectContaining({ type: "glimpselet:select" }),
      );
      expect(drawImage).toHaveBeenLastCalledWith(
        expect.anything(),
        10,
        20,
        30,
        40,
        0,
        0,
        30,
        40,
      );
    },
  );

  async function deniedSelectedCapture(
    kind: "region" | "element" | "visible" = "region",
  ) {
    const captureVisibleTab = vi.fn(async () => {
      throw new Error("activeTab permission required");
    });
    const mocks = setupAuthorization(captureVisibleTab);
    const capture = await import("./capture");
    const error = await capture
      .captureWeb(kind, kind === "visible" ? undefined : rect)
      .catch((reason) => reason);
    expect(error.message).toBe("capture_permission");
    expect(error.pending).toEqual(
      expect.objectContaining({
        kind,
        tabId: tab.id,
        url: tab.url,
        documentId: "document-seven",
        rect: kind === "visible" ? undefined : rect,
      }),
    );
    captureVisibleTab.mockResolvedValue("tile-png");
    return { ...mocks, ...capture, pending: error.pending };
  }

  it.each(["region", "element", "visible"] as const)(
    "retries the same %s capture after toolbar activation without another selection",
    async (kind) => {
      const { retryPendingWebCapture, pending, captureVisibleTab } =
        await deniedSelectedCapture(kind);

      const result = await retryPendingWebCapture(pending);

      expect(result.capture.image).toBe("stitched-png");
      expect(captureVisibleTab).toHaveBeenCalledTimes(2);
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        tab.id,
        expect.objectContaining({ type: "glimpselet:select" }),
      );
      if (kind !== "visible")
        expect(drawImage).toHaveBeenLastCalledWith(
          expect.anything(),
          10,
          20,
          30,
          40,
          0,
          0,
          30,
          40,
        );
    },
  );

  it.each(["source", "navigation", "same-url-reload", "scroll", "viewport"])(
    "invalidates saved coordinates after a %s change before reading pixels",
    async (change) => {
      const {
        retryPendingWebCapture,
        pending,
        captureVisibleTab,
        setCurrentActiveTab,
        setDocument,
        setGeometry,
      } = await deniedSelectedCapture();
      if (change === "source") {
        setCurrentActiveTab(8);
        vi.mocked(chrome.tabs.get).mockResolvedValue({ ...tab, id: 8 });
        vi.mocked(chrome.tabs.query).mockResolvedValue([{ ...tab, id: 8 }]);
      }
      if (change === "navigation")
        vi.mocked(chrome.tabs.get).mockResolvedValue({
          ...tab,
          url: "https://public.test/another",
        });
      if (change === "same-url-reload") setDocument("replacement-document");
      if (change === "scroll") setGeometry({ ...geometry, scrollY: 9 });
      if (change === "viewport") setGeometry({ ...geometry, width: 101 });

      await expect(retryPendingWebCapture(pending)).rejects.toThrow(
        "tab_changed",
      );

      expect(captureVisibleTab).toHaveBeenCalledTimes(1);
      expect(drawImage).not.toHaveBeenCalled();
    },
  );

  it("rechecks password privacy before retrying a saved selection", async () => {
    const {
      retryPendingWebCapture,
      pending,
      captureVisibleTab,
      executeScript,
    } = await deniedSelectedCapture();
    executeScript.mockImplementation(async (details) => [
      {
        result: details.func.toString().includes("devicePixelRatio")
          ? geometry
          : true,
        documentId: "document-seven",
        frameId: 0,
      },
    ]);

    await expect(retryPendingWebCapture(pending)).rejects.toThrow(
      "password_page",
    );

    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("does not retry into the extension opener while the source page is inactive", async () => {
    const { retryPendingWebCapture, pending, captureVisibleTab } =
      await deniedSelectedCapture();
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      {
        ...tab,
        id: 99,
        url: chrome.runtime.getURL("panel.html"),
      },
    ]);

    await expect(retryPendingWebCapture(pending)).rejects.toThrow(
      "tab_changed",
    );

    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe("visible pixels versus explicit text privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    drawImage.mockClear();
  });

  it.each(["visible", "region", "element"] as const)(
    "%s capture can exclude a non-rendered opaque tracker without a text-only pixel exemption",
    async (kind) => {
      const { executeScript, captureVisibleTab } = setupChrome();
      executeScript.mockImplementation(async (details) => {
        const result = details.func.toString().includes("devicePixelRatio")
          ? viewportGeometry
          : details.args?.[0] === null
            ? details.args[1] !== "visible-capture"
            : 100;
        return [{ result, documentId: "document-seven", frameId: 0 }];
      });
      const { captureWeb } = await import("./capture");
      const result = await captureWeb(kind, [0, 0, 80, 80]);
      expect(result.capture.image).toBe("stitched-png");
      expect(captureVisibleTab).toHaveBeenCalledOnce();
      const checks = executeScript.mock.calls.filter(
        ([details]) => details.args?.[0] === null,
      );
      expect(checks).toHaveLength(3);
      expect(
        checks.every(([details]) => details.args?.[1] === "visible-capture"),
      ).toBe(true);
    },
  );

  it("full-page capture keeps the strict guard on offscreen opaque embeds", async () => {
    const { executeScript, captureVisibleTab } = setupChrome();
    executeScript.mockImplementation(async (details) => [
      {
        result: details.func.toString().includes("devicePixelRatio")
          ? viewportGeometry
          : details.args?.[0] === null && details.args[1] !== true,
        documentId: "document-seven",
        frameId: 0,
      },
    ]);
    const { captureWeb } = await import("./capture");
    await expect(captureWeb("full")).rejects.toThrow("password_page");
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it.each(["before", "after"])(
    "visible capture fails closed if opaque pixels appear %s the screenshot",
    async (when) => {
      const { executeScript, captureVisibleTab } = setupChrome();
      let checks = 0;
      executeScript.mockImplementation(async (details) => {
        const result = details.func.toString().includes("devicePixelRatio")
          ? viewportGeometry
          : details.args?.[0] === null
            ? ++checks >= (when === "before" ? 2 : 3)
            : 100;
        return [{ result, documentId: "document-seven", frameId: 0 }];
      });
      const { captureWeb } = await import("./capture");
      await expect(captureWeb("visible")).rejects.toThrow("password_page");
      expect(captureVisibleTab).toHaveBeenCalledTimes(
        when === "before" ? 0 : 1,
      );
    },
  );

  it("does not treat a rejected explicit context as page data alongside captured pixels", async () => {
    const { captureVisibleTab } = setupChrome();
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      error: "password_page",
    });
    const { captureWeb } = await import("./capture");
    await expect(captureWeb("visible")).rejects.toThrow("password_page");
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it.each(["initial", "before-pixels", "after-pixels"])(
    "rejects a blocklisted capture %s",
    async (when) => {
      const { captureVisibleTab } = setupChrome();
      const reads = when === "initial" ? 1 : when === "before-pixels" ? 2 : 3;
      let checked = 0;
      vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({
        blocklist: ++checked >= reads ? ["PUBLIC.TEST"] : [],
      }));
      const { captureWeb } = await import("./capture");
      await expect(captureWeb("visible")).rejects.toThrow("blocked_page");
      expect(captureVisibleTab).toHaveBeenCalledTimes(
        when === "after-pixels" ? 1 : 0,
      );
    },
  );
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

  function setupExplicit() {
    const mocks = setupGuide();
    const page = {
      ...mocks.page,
      guideScope: undefined,
      textScope: "top-document-text" as const,
    };
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

  it("manual page reading uses the bounded pinned context protocol instead of unmarked default context", async () => {
    const { page, executeScript, captureVisibleTab } = setupExplicit();
    const { getPageContext } = await import("./capture");
    expect(await getPageContext(true)).toEqual(page);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      tab.id,
      { type: "glimpselet:explicit-context" },
      { documentId: "document-seven" },
    );
    expect(executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { tabId: tab.id, documentIds: ["document-seven"] },
        args: [null, true],
      }),
    );
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it("manual page reading rejects unmarked context and a newly blocklisted page", async () => {
    const { page } = setupExplicit();
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      ...page,
      textScope: undefined,
    });
    const { getPageContext } = await import("./capture");
    await expect(getPageContext(true)).rejects.toThrow("tab_changed");
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(page);
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      blocklist: ["PUBLIC.TEST"],
    });
    await expect(getPageContext(true)).rejects.toThrow("blocked_page");
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it("reads a bundled PDF reader through its document-bound listener without scripting or pixels", async () => {
    const { page, executeScript, captureVisibleTab } = setupGuide();
    page.url = chrome.runtime.getURL("reader.html");
    const reader = { ...tab, url: page.url };
    vi.mocked(chrome.tabs.get).mockResolvedValue(reader);
    vi.mocked(chrome.tabs.query).mockResolvedValue([reader]);
    const { getGuideContext } = await import("./capture");
    expect(await getGuideContext(page)).toEqual(page);
    expect(executeScript).not.toHaveBeenCalled();
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(tab.id, {
      type: "glimpselet:guide-context",
      documentKey: page.documentKey,
      url: page.url,
    });
  });

  it("discards a reader document changed during guide collection", async () => {
    const { page, executeScript } = setupGuide();
    page.url = chrome.runtime.getURL("reader.html");
    const reader = { ...tab, url: page.url };
    vi.mocked(chrome.tabs.get).mockResolvedValue(reader);
    vi.mocked(chrome.tabs.query).mockResolvedValue([reader]);
    vi.mocked(chrome.tabs.sendMessage)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, documentKey: "reloaded-reader" });
    const { getGuideContext } = await import("./capture");
    await expect(getGuideContext()).rejects.toThrow("tab_changed");
    expect(executeScript).not.toHaveBeenCalled();
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

describe("automatic page privacy explanations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const binding = {
    tabId: tab.id,
    url: tab.url,
    origin: "https://public.test",
    handle: "bound",
    documentId: "document-seven",
  };
  it.each(["password", "uninspectable", "inspection-limit", undefined])(
    "returns the inspected document's %s reason",
    async (reason) => {
      const { executeScript } = setupChrome();
      executeScript.mockResolvedValue([
        { result: reason, frameId: 0, documentId: binding.documentId },
      ]);
      const { getPagePrivacyReason } = await import("./capture");
      expect(await getPagePrivacyReason(binding)).toBe(reason);
      expect(executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: tab.id, documentIds: [binding.documentId] },
          args: [null, false, true],
        }),
      );
    },
  );
  it.each([
    "stale document",
    "wrong frame",
    "missing result",
    "failed inspection",
    "navigated tab",
  ])("reports unavailable for a %s", async (failure) => {
    const { executeScript } = setupChrome();
    if (failure === "failed inspection")
      executeScript.mockRejectedValue(new Error("No access"));
    else if (failure === "missing result") executeScript.mockResolvedValue([]);
    else
      executeScript.mockResolvedValue([
        {
          result: "password",
          frameId: failure === "wrong frame" ? 1 : 0,
          documentId:
            failure === "stale document"
              ? "other-document"
              : binding.documentId,
        },
      ]);
    if (failure === "navigated tab")
      vi.mocked(chrome.tabs.get).mockResolvedValue({
        ...tab,
        url: "https://other.test/",
      });
    const { getPagePrivacyReason } = await import("./capture");
    expect(await getPagePrivacyReason(binding)).toBe("unavailable");
  });
});
