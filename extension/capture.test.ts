import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("visible pixels versus explicit text privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["visible", "region", "element"] as const)(
    "%s capture can exclude a non-rendered opaque tracker without a text-only pixel exemption",
    async (kind) => {
      const { executeScript, captureVisibleTab } = setupChrome();
      executeScript.mockImplementation(async (details) => {
        if (details.args?.[0] === null)
          return [{ result: details.args[1] !== "visible-capture" }];
        return [{ result: 100 }];
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
        result: details.args?.[0] === null && details.args[1] !== true,
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
        if (details.args?.[0] === null)
          return [{ result: ++checks >= (when === "before" ? 2 : 3) }];
        return [{ result: 100 }];
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
