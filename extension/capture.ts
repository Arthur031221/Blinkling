import { freezeSharedFrame, type SharedFrameOptions } from "./screen-frame";
import { hasSensitiveContent, type PrivacyReadMode } from "./privacy";
import { encodeCanvasPng } from "./png";
import { prepareCaptureBinding, type CaptureBinding } from "./capture-binding";
import type { PageContext } from "./page-context";

export type CaptureKind = "visible" | "full" | "region" | "element" | "screen";
export type CaptureResult = { image: string; label: string };
export type CaptureProgress = { completed: number; total: number };
export type CaptureWebOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: CaptureProgress) => void;
};
type Tab = chrome.tabs.Tab;
type ActiveTab = Tab & { id: number; windowId: number };

let currentTabId =
  Number(new URLSearchParams(location.search).get("sourceTab")) || undefined;
const ownOrigin = new URL(chrome.runtime.getURL("panel.html")).origin;

export function setCurrentActiveTab(tabId: number | undefined): void {
  currentTabId = Number.isInteger(tabId) && tabId! > 0 ? tabId : undefined;
}

function isOwnTab(tab: Tab | undefined): boolean {
  if (!tab?.url) return true;
  try {
    const url = new URL(tab.url);
    return url.origin === ownOrigin && url.pathname !== "/reader.html";
  } catch {
    return true;
  }
}

async function activeTab(): Promise<ActiveTab> {
  let tab: Tab | undefined;
  if (currentTabId)
    tab = await chrome.tabs.get(currentTabId).catch(() => undefined);
  if (!tab || isOwnTab(tab)) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (isOwnTab(tab)) throw new Error("no_active_tab");
    currentTabId = tab?.id;
  }
  if (tab?.id === undefined || tab.windowId === undefined)
    throw new Error("no_active_tab");
  if (
    /^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url || "") &&
    !tab.url?.startsWith(chrome.runtime.getURL("reader.html"))
  )
    throw new Error("unsupported_page");
  return { ...tab, id: tab.id, windowId: tab.windowId };
}

async function assertStillActive(tab: ActiveTab): Promise<void> {
  const now = await chrome.tabs.get(tab.id).catch(() => undefined);
  if (!now || now.url !== tab.url) throw new Error("tab_changed");
  const [focused] = await chrome.tabs.query({
    active: true,
    windowId: tab.windowId,
  });
  // The panel can briefly own focus while a capture control is used. Tab activation events
  // remain authoritative; a different web tab means the request must not read stale content.
  if (
    currentTabId !== tab.id ||
    (focused?.id !== tab.id && focused?.id !== undefined && !isOwnTab(focused))
  )
    throw new Error("tab_changed");
}

async function requireSiteAccess(tab: ActiveTab): Promise<void> {
  if (tab.url?.startsWith(chrome.runtime.getURL("reader.html"))) return;
  const origin = (() => {
    try {
      return new URL(tab.url || "").origin;
    } catch {
      return "";
    }
  })();
  if (
    !origin ||
    !(await chrome.permissions.contains({ origins: [`${origin}/*`] }))
  ) {
    // A toolbar click or command grants activeTab without persistent site access.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => true,
      });
    } catch {
      throw new Error("allow_site_access");
    }
  }
}

async function requireUnblockedPage(tab: ActiveTab): Promise<void> {
  const { blocklist } = await chrome.storage.local.get("blocklist");
  const host = new URL(tab.url!).hostname.toLowerCase();
  if (
    Array.isArray(blocklist) &&
    blocklist.some((entry: unknown) => {
      if (typeof entry !== "string") return false;
      const item = entry.trim().toLowerCase();
      return item && (host === item || host.endsWith(`.${item}`));
    })
  )
    throw new Error("blocked_page");
}

async function injectContent(tab: ActiveTab): Promise<void> {
  await requireSiteAccess(tab);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "glimpselet:context" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  }
}

async function sendToPage(tab: ActiveTab, message: unknown): Promise<unknown> {
  await injectContent(tab);
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error("allow_site_access");
  }
}

export async function isSensitivePage(
  binding?: CaptureBinding,
  mode: PrivacyReadMode = false,
): Promise<boolean> {
  const candidate = binding
    ? await chrome.tabs.get(binding.tabId).catch(() => undefined)
    : await activeTab();
  if (
    !candidate?.id ||
    candidate.windowId === undefined ||
    (binding && candidate.url !== binding.url)
  )
    return true;
  const tab = candidate as ActiveTab;
  if (tab.url?.startsWith(chrome.runtime.getURL("reader.html"))) return false;
  try {
    await requireSiteAccess(tab);
    const result = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        ...(binding ? { documentIds: [binding.documentId] } : {}),
      },
      func: hasSensitiveContent,
      args: [null, mode],
    });
    return (
      result[0]?.result !== false ||
      Boolean(binding && result[0]?.documentId !== binding.documentId)
    );
  } catch (error) {
    if (error instanceof Error && error.message === "allow_site_access")
      throw error;
    return true;
  }
}

export async function getDocumentIdentity(): Promise<
  Pick<PageContext, "documentKey" | "url"> & { translated?: boolean }
> {
  const tab = await activeTab();
  await requireSiteAccess(tab);
  const identity = await sendToPage(tab, { type: "glimpselet:identity" });
  await assertStillActive(tab);
  return identity as Pick<PageContext, "documentKey" | "url"> & {
    translated?: boolean;
  };
}

export async function getPageContext(
  manualTextOnly = false,
): Promise<PageContext | undefined> {
  if (manualTextOnly) return getExplicitPageContext();
  const tab = await activeTab();
  await requireSiteAccess(tab);
  // Check for password fields before requesting text from the content script.
  if (await isSensitivePage(undefined, manualTextOnly))
    throw new Error("password_page");
  const context = await sendToPage(tab, { type: "glimpselet:context" });
  await assertStillActive(tab);
  if (await isSensitivePage(undefined, manualTextOnly))
    throw new Error("password_page");
  return context as PageContext | undefined;
}

/** Explicit guide read: no pixels, no embedded-document text, pinned to one document. */
export async function getGuideContext(
  expected?: Pick<PageContext, "documentKey" | "url">,
): Promise<PageContext> {
  return getScopedPageContext("glimpselet:guide-context", expected);
}

/** Explicit ask/translation read, with the same document and privacy protections as guides. */
export async function getExplicitPageContext(
  expected?: Pick<PageContext, "documentKey" | "url">,
): Promise<PageContext> {
  return getScopedPageContext("glimpselet:explicit-context", expected);
}

async function getScopedPageContext(
  type: "glimpselet:guide-context" | "glimpselet:explicit-context",
  expected?: Pick<PageContext, "documentKey" | "url">,
): Promise<PageContext> {
  const tab = await activeTab();
  await requireSiteAccess(tab);
  const checkBlocklist = () => requireUnblockedPage(tab);
  await checkBlocklist();
  if (tab.url?.startsWith(chrome.runtime.getURL("reader.html"))) {
    // Chrome rejects scripting injection into extension pages. The bundled
    // reader already owns the content listener and enforces its document key.
    const read = async (bound = expected): Promise<PageContext> => {
      const page = (await chrome.tabs
        .sendMessage(tab.id, {
          type,
          ...(bound ? { documentKey: bound.documentKey, url: bound.url } : {}),
        })
        .catch(() => {
          throw new Error("tab_changed");
        })) as PageContext & { error?: string };
      if (page?.error) throw new Error(page.error);
      if (page?.hasPassword) throw new Error("password_page");
      if (
        !page?.documentKey ||
        page.url !== tab.url ||
        (type === "glimpselet:guide-context"
          ? page.guideScope
          : page.textScope) !== "top-document-text" ||
        (bound &&
          (page.documentKey !== bound.documentKey || page.url !== bound.url))
      )
        throw new Error("tab_changed");
      return page;
    };
    const page = await read();
    await assertStillActive(tab);
    await checkBlocklist();
    await assertStillActive(tab);
    return read(page);
  }
  const inspect = async (documentId?: string): Promise<string> => {
    const [result] = await chrome.scripting
      .executeScript({
        target: {
          tabId: tab.id,
          ...(documentId ? { documentIds: [documentId] } : {}),
        },
        func: hasSensitiveContent,
        args: [null, true],
      })
      .catch(() => {
        throw new Error("tab_changed");
      });
    if (
      !result?.documentId ||
      result.frameId !== 0 ||
      (documentId && result.documentId !== documentId)
    )
      throw new Error("tab_changed");
    if (result.result !== false) throw new Error("password_page");
    return result.documentId;
  };
  const documentId = await inspect();
  await injectContent(tab);
  const page = (await chrome.tabs
    .sendMessage(tab.id, { type }, { documentId })
    .catch(() => {
      throw new Error("tab_changed");
    })) as PageContext & { error?: string };
  if (page?.error) throw new Error(page.error);
  if (page?.hasPassword) throw new Error("password_page");
  if (
    !page?.documentKey ||
    page.url !== tab.url ||
    (type === "glimpselet:guide-context" ? page.guideScope : page.textScope) !==
      "top-document-text" ||
    (expected &&
      (page.documentKey !== expected.documentKey || page.url !== expected.url))
  )
    throw new Error("tab_changed");
  await assertStillActive(tab);
  await checkBlocklist();
  await assertStillActive(tab);
  // Finish with the pinned privacy check, after all storage/tab reads.
  await inspect(documentId);
  return page;
}

export async function captureWeb(
  kind: Exclude<CaptureKind, "screen">,
  selectedRect?: [number, number, number, number],
  labels?: Record<string, string>,
  options: CaptureWebOptions = {},
): Promise<{ capture: CaptureResult; page?: PageContext }> {
  throwIfAborted(options.signal);
  const tab = await activeTab();
  await requireSiteAccess(tab);
  await requireUnblockedPage(tab);
  const privacyMode = kind === "full" ? false : "visible-capture";
  if (await isSensitivePage(undefined, privacyMode))
    throw new Error("password_page");
  let page: PageContext | undefined;
  try {
    const context = (await sendToPage(tab, {
      type:
        kind === "full" ? "glimpselet:context" : "glimpselet:explicit-context",
    })) as (PageContext & { error?: string }) | undefined;
    if (context?.error) throw new Error(context.error);
    if (context?.hasPassword) throw new Error("password_page");
    page = context;
  } catch (error) {
    if (
      error instanceof Error &&
      ["password_page", "blocked_page", "tab_changed"].includes(error.message)
    )
      throw error;
    /* visible capture remains available */
  }
  let rect: [number, number, number, number] | undefined = selectedRect;
  if (!rect && (kind === "region" || kind === "element")) {
    const selected = (await sendToPage(tab, {
      type: "glimpselet:select",
      mode: kind,
      labels: labels || {
        cancel: "Cancel",
        cropTitle: "Crop",
        cropHint: "Drag to select. Enter to confirm. Esc to cancel.",
        cropConfirm: "Confirm",
        cropCancel: "Cancel",
      },
    })) as
      | { cancelled?: boolean; rect?: [number, number, number, number] }
      | undefined;
    if (selected?.cancelled) throw new Error("capture_cancelled");
    rect = selected?.rect;
  }
  if (kind !== "full") {
    await requireUnblockedPage(tab);
    await assertStillActive(tab);
    if (await isSensitivePage(undefined, privacyMode))
      throw new Error("password_page");
    const data = await chrome.tabs
      .captureVisibleTab(tab.windowId, {
        format: "png",
      })
      .catch(() => {
        throw new Error("capture_permission");
      });
    await assertStillActive(tab);
    const dimensions = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => innerWidth,
    });
    const image = await crop(data, rect, dimensions[0]?.result || 1280);
    await requireUnblockedPage(tab);
    if (await isSensitivePage(undefined, privacyMode))
      throw new Error("password_page");
    await assertStillActive(tab);
    // The explicit text read did not authorize these pixels. Only the completed
    // capture and its separate privacy checks permit attaching this context.
    const capturedPage = page ? { ...page } : undefined;
    if (capturedPage) delete capturedPage.textScope;
    return {
      capture: {
        image,
        label:
          kind === "visible"
            ? "Visible tab"
            : kind === "region"
              ? "Selected region"
              : "Selected element",
      },
      page: capturedPage,
    };
  }
  const original = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      x: scrollX,
      y: scrollY,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      frameWidth: innerWidth,
      frameHeight: innerHeight,
    }),
  });
  throwIfAborted(options.signal);
  const metrics = original[0]?.result;
  if (!metrics || metrics.width * metrics.height > 90_000_000)
    throw new Error("page_too_large");
  if (metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0)
    throw new Error("capture_failed");
  const ys = [
    ...new Set(
      Array.from(
        { length: Math.ceil(metrics.height / metrics.viewportHeight) },
        (_, i) =>
          Math.min(
            i * metrics.viewportHeight,
            Math.max(0, metrics.height - metrics.viewportHeight),
          ),
      ),
    ),
  ];
  const xs = [
    ...new Set(
      Array.from(
        { length: Math.ceil(metrics.width / metrics.viewportWidth) },
        (_, i) =>
          Math.min(
            i * metrics.viewportWidth,
            Math.max(0, metrics.width - metrics.viewportWidth),
          ),
      ),
    ),
  ];
  const total = xs.length * ys.length;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 4096 / Math.max(metrics.width, metrics.height));
  canvas.width = Math.round(metrics.width * scale);
  canvas.height = Math.round(metrics.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("capture_failed");
  let completed = 0;
  options.onProgress?.({ completed, total });
  try {
    for (const y of ys)
      for (const x of xs) {
        throwIfAborted(options.signal);
        await assertStillActive(tab);
        throwIfAborted(options.signal);
        if (completed) await waitForCaptureDelay(550, options.signal);
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (px: number, py: number) =>
            window.scrollTo({ left: px, top: py, behavior: "instant" }),
          args: [x, y],
        });
        throwIfAborted(options.signal);
        await waitForCaptureDelay(80, options.signal);
        throwIfAborted(options.signal);
        await requireUnblockedPage(tab);
        await assertStillActive(tab);
        throwIfAborted(options.signal);
        if (await isSensitivePage()) throw new Error("password_page");
        throwIfAborted(options.signal);
        const image = await chrome.tabs
          .captureVisibleTab(tab.windowId, {
            format: "png",
          })
          .catch(() => {
            throw new Error("capture_permission");
          });
        throwIfAborted(options.signal);
        await assertStillActive(tab);
        throwIfAborted(options.signal);
        await requireUnblockedPage(tab);
        if (await isSensitivePage()) throw new Error("password_page");
        throwIfAborted(options.signal);
        await drawFrame(
          ctx,
          image,
          x,
          y,
          metrics.width,
          metrics.height,
          metrics.viewportWidth,
          metrics.viewportHeight,
          metrics.frameWidth,
          metrics.frameHeight,
          scale,
        );
        throwIfAborted(options.signal);
        completed++;
        options.onProgress?.({ completed, total });
      }
  } finally {
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: (x: number, y: number) => window.scrollTo(x, y),
        args: [metrics.x, metrics.y],
      })
      .catch(() => {});
  }
  throwIfAborted(options.signal);
  const image = encodeCanvasPng(canvas);
  await requireUnblockedPage(tab);
  if (await isSensitivePage()) throw new Error("password_page");
  await assertStillActive(tab);
  return {
    capture: {
      image,
      label: "Full page",
    },
    page,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("capture_cancelled");
}

function waitForCaptureDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("capture_cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: string,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  frameWidth: number,
  frameHeight: number,
  scale: number,
): Promise<void> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("capture_failed"));
    img.src = source;
  });
  const visibleWidth = Math.min(viewportWidth, width - x);
  const visibleHeight = Math.min(viewportHeight, height - y);
  ctx.drawImage(
    img,
    0,
    0,
    (img.width * visibleWidth) / frameWidth,
    (img.height * visibleHeight) / frameHeight,
    x * scale,
    y * scale,
    visibleWidth * scale,
    visibleHeight * scale,
  );
  img.src = "";
}

function crop(
  image: string,
  rect: [number, number, number, number] | undefined,
  viewportWidth: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dpr = img.width / Math.max(1, viewportWidth);
      const [x, y, w, h] = rect || [0, 0, viewportWidth, img.height / dpr];
      const sx = Math.round(x * dpr);
      const sy = Math.round(y * dpr);
      const sw = Math.max(1, Math.min(img.width - sx, Math.round(w * dpr)));
      const sh = Math.max(1, Math.min(img.height - sy, Math.round(h * dpr)));
      const downscale = Math.min(1, 2048 / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw * downscale));
      canvas.height = Math.max(1, Math.round(sh * downscale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("capture_failed"));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      try {
        resolve(encodeCanvasPng(canvas));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("capture_failed"));
    img.src = image;
  });
}

export async function captureScreen(
  sourceTabId?: number,
  bubble: Document | null = null,
  options: (video: HTMLVideoElement) => SharedFrameOptions = () => ({}),
): Promise<{
  stream: MediaStream;
  image: string;
  binding?: CaptureBinding;
}> {
  const bindingPromise = (
    sourceTabId ? chrome.tabs.get(sourceTabId) : activeTab()
  )
    .then(prepareCaptureBinding)
    .catch(() => undefined);
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 2, displaySurface: "monitor" },
    audio: false,
    selfBrowserSurface: "exclude",
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions);
  const binding = await bindingPromise;
  const video = document.createElement("video");
  try {
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const frame = await freezeSharedFrame(video, bubble, options(video));
    let image: string;
    try {
      image = encodeCanvasPng(frame);
    } finally {
      frame.width = 0;
      frame.height = 0;
    }
    return { stream, image, binding };
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  } finally {
    video.srcObject = null;
  }
}
