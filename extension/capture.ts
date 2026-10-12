import { hasSensitiveContent } from "./privacy";

export type CaptureKind = "visible" | "full" | "region" | "element" | "screen";
export type CaptureResult = { image: string; label: string };
type Tab = chrome.tabs.Tab;
type ActiveTab = Tab & { id: number; windowId: number };

let currentTabId =
  Number(new URLSearchParams(location.search).get("sourceTab")) || undefined;
const ownOrigin = new URL(chrome.runtime.getURL("panel.html")).origin;

export function setCurrentActiveTab(tabId: number | undefined): void {
  if (Number.isInteger(tabId) && tabId! > 0) currentTabId = tabId;
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

export async function isSensitivePage(): Promise<boolean> {
  const tab = await activeTab();
  if (tab.url?.startsWith(chrome.runtime.getURL("reader.html"))) return false;
  try {
    await requireSiteAccess(tab);
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: hasSensitiveContent,
    });
    return result[0]?.result !== false;
  } catch (error) {
    if (error instanceof Error && error.message === "allow_site_access")
      throw error;
    return true;
  }
}

export async function getPageContext(): Promise<PageContext | undefined> {
  const tab = await activeTab();
  await requireSiteAccess(tab);
  // Check for password fields before requesting text from the content script.
  if (await isSensitivePage()) throw new Error("password_page");
  const context = await sendToPage(tab, { type: "glimpselet:context" });
  await assertStillActive(tab);
  if (await isSensitivePage()) throw new Error("password_page");
  return context as PageContext | undefined;
}

type PageContext = {
  url: string;
  title: string;
  text: string;
  hasPassword: boolean;
  elements: Array<{
    id: string;
    role: string;
    text: string;
    rect: [number, number, number, number];
  }>;
};
export async function captureWeb(
  kind: Exclude<CaptureKind, "screen">,
  selectedRect?: [number, number, number, number],
  labels?: Record<string, string>,
): Promise<{ capture: CaptureResult; page?: PageContext }> {
  const tab = await activeTab();
  await requireSiteAccess(tab);
  if (await isSensitivePage()) throw new Error("password_page");
  let page: PageContext | undefined;
  try {
    page = (await sendToPage(tab, {
      type: "glimpselet:context",
    })) as PageContext;
  } catch {
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
    await assertStillActive(tab);
    if (await isSensitivePage()) throw new Error("password_page");
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
    if (await isSensitivePage()) throw new Error("password_page");
    await assertStillActive(tab);
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
      page,
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
  const metrics = original[0]?.result;
  if (!metrics || metrics.width * metrics.height > 90_000_000)
    throw new Error("page_too_large");
  const frames: Array<{ image: string; x: number; y: number }> = [];
  try {
    const ys: number[] = [];
    for (let y = 0; y < metrics.height; y += metrics.viewportHeight)
      ys.push(
        Math.min(y, Math.max(0, metrics.height - metrics.viewportHeight)),
      );
    const xs: number[] = [];
    for (let x = 0; x < metrics.width; x += metrics.viewportWidth)
      xs.push(Math.min(x, Math.max(0, metrics.width - metrics.viewportWidth)));
    for (const y of [...new Set(ys)])
      for (const x of [...new Set(xs)]) {
        await assertStillActive(tab);
        if (frames.length)
          await new Promise((resolve) => setTimeout(resolve, 550));
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (px: number, py: number) =>
            window.scrollTo({ left: px, top: py, behavior: "instant" }),
          args: [x, y],
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        await assertStillActive(tab);
        if (await isSensitivePage()) throw new Error("password_page");
        const image = await chrome.tabs
          .captureVisibleTab(tab.windowId, {
            format: "png",
          })
          .catch(() => {
            throw new Error("capture_permission");
          });
        await assertStillActive(tab);
        if (await isSensitivePage()) throw new Error("password_page");
        frames.push({ image, x, y });
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
  const image = await stitch(
    frames,
    metrics.width,
    metrics.height,
    metrics.viewportWidth,
    metrics.viewportHeight,
    metrics.frameWidth,
    metrics.frameHeight,
  );
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
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("capture_failed"));
    img.src = image;
  });
}

async function stitch(
  frames: Array<{ image: string; x: number; y: number }>,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  frameWidth: number,
  frameHeight: number,
): Promise<string> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 4096 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("capture_failed");
  for (const frame of frames) {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("capture_failed"));
      img.src = frame.image;
    });
    const w = Math.min(viewportWidth, width - frame.x) * scale;
    const h = Math.min(viewportHeight, height - frame.y) * scale;
    ctx.drawImage(
      img,
      0,
      0,
      (img.width * Math.min(viewportWidth, width - frame.x)) / frameWidth,
      (img.height * Math.min(viewportHeight, height - frame.y)) / frameHeight,
      frame.x * scale,
      frame.y * scale,
      w,
      h,
    );
  }
  return canvas.toDataURL("image/png");
}

export async function captureScreen(): Promise<{
  stream: MediaStream;
  image: string;
}> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 2, displaySurface: "monitor" },
    audio: false,
    selfBrowserSurface: "exclude",
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions);
  const video = document.createElement("video");
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const scale = Math.min(
    1,
    1600 / Math.max(video.videoWidth, video.videoHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/png");
  video.srcObject = null;
  return { stream, image };
}
