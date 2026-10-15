import { fullPageLayout } from "./full-page-layout";
import { planTiles } from "./full-page-tiles";
import { encodeCanvasPng } from "./png";
import { hasSensitiveContent } from "./privacy";
import type { TabTarget } from "./targets";

export type FullPageProgress = { completed: number; total: number };
export type FullPageResult = {
  images: string[];
  truncated: boolean;
  page: { url: string; title: string };
};
type Tab = TabTarget["tab"];

// Chrome allows two screenshots per second.
const SCREENSHOT_GAP_MS = 550;
const SETTLE_MS = 80;
let lastScreenshot = -Infinity;

const aborted = () => new Error("capture_cancelled");
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw aborted();
};
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  check(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

type FrameGeometry = {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  frameWidth: number;
  frameHeight: number;
  skipLeft: number;
  skipTop: number;
};

async function bitmap(source: string): Promise<ImageBitmap> {
  const response = await fetch(source);
  return createImageBitmap(await response.blob());
}

/** Paints scrolled frames onto horizontal strips of the page and encodes each
 * strip as soon as no later frame can touch it, so only a couple of canvases
 * are alive at once however long the page is. */
export class TileStrips {
  private readonly canvases = new Map<number, OffscreenCanvas>();
  private readonly encoded: string[] = [];
  private next = 0;
  constructor(
    private readonly width: number,
    private readonly plan: ReturnType<typeof planTiles>,
  ) {}
  private stripHeight(index: number): number {
    return Math.min(
      this.plan.tileHeight,
      this.plan.capturedHeight - index * this.plan.tileHeight,
    );
  }
  private context(index: number): OffscreenCanvasRenderingContext2D {
    let canvas = this.canvases.get(index);
    if (!canvas) {
      canvas = new OffscreenCanvas(
        Math.max(1, Math.round(this.width * this.plan.scale)),
        Math.max(1, Math.round(this.stripHeight(index) * this.plan.scale)),
      );
      this.canvases.set(index, canvas);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("capture_failed");
    return ctx;
  }
  async draw(source: string, frame: FrameGeometry): Promise<void> {
    const img = await bitmap(source).catch(() => {
      throw new Error("capture_failed");
    });
    try {
      const { scale, tileHeight, capturedHeight } = this.plan;
      const visibleWidth =
        Math.min(frame.viewportWidth, this.width - frame.x) - frame.skipLeft;
      const top = frame.y + frame.skipTop;
      const bottom = Math.min(frame.y + frame.viewportHeight, capturedHeight);
      for (
        let index = Math.floor(top / tileHeight);
        index * tileHeight < bottom && index < this.plan.count;
        index++
      ) {
        const from = Math.max(top, index * tileHeight);
        const to = Math.min(bottom, (index + 1) * tileHeight);
        if (to <= from) continue;
        this.context(index).drawImage(
          img,
          (img.width * frame.skipLeft) / frame.frameWidth,
          (img.height * (from - frame.y)) / frame.frameHeight,
          (img.width * visibleWidth) / frame.frameWidth,
          (img.height * (to - from)) / frame.frameHeight,
          (frame.x + frame.skipLeft) * scale,
          (from - index * tileHeight) * scale,
          visibleWidth * scale,
          (to - from) * scale,
        );
      }
    } finally {
      img.close();
    }
  }
  /** Everything above `row` (CSS pixels) is final. */
  async finish(row: number): Promise<void> {
    while (
      this.next < this.plan.count &&
      (this.next + 1) * this.plan.tileHeight <= row
    )
      await this.encodeNext();
    if (row >= this.plan.capturedHeight) await this.flush();
  }
  private async encodeNext(): Promise<void> {
    const canvas = this.canvases.get(this.next);
    if (!canvas) throw new Error("capture_failed");
    this.encoded.push(await encodeCanvasPng(canvas));
    this.canvases.delete(this.next++);
  }
  private async flush(): Promise<void> {
    while (this.next < this.plan.count) await this.encodeNext();
  }
  async pieces(): Promise<string[]> {
    await this.flush();
    return this.encoded;
  }
}

async function stillThere(tab: Tab): Promise<void> {
  const now = await chrome.tabs.get(tab.id).catch(() => undefined);
  if (!now?.active || now.url !== tab.url) throw new Error("tab_changed");
}

async function sensitive(tab: Tab): Promise<boolean> {
  const [result] = await chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: hasSensitiveContent,
      args: [null, false],
    })
    .catch(() => []);
  return result?.result !== false;
}

async function screenshot(tab: Tab, signal?: AbortSignal): Promise<string> {
  const gap = lastScreenshot + SCREENSHOT_GAP_MS - Date.now();
  if (gap > 0) await wait(gap, signal);
  await stillThere(tab);
  lastScreenshot = Date.now();
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch {
    throw new Error("capture_failed");
  }
}

/**
 * The whole page, top to bottom, as readable PNG pieces. The tab must stay the
 * active one and must not hold a password field while it is captured.
 */
export async function captureFullPage(
  tab: Tab,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: FullPageProgress) => void;
  } = {},
): Promise<FullPageResult> {
  const { signal } = options;
  check(signal);
  await stillThere(tab);
  if (await sensitive(tab)) throw new Error("password_page");
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
      devicePixelRatio,
      title: document.title,
    }),
  });
  check(signal);
  const metrics = original[0]?.result;
  if (!metrics || metrics.width * metrics.height > 90_000_000)
    throw new Error("page_too_large");
  if (metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0)
    throw new Error("capture_failed");
  const plan = planTiles(
    metrics.width,
    metrics.height,
    metrics.devicePixelRatio,
  );
  const steps = (length: number, view: number, total: number) => [
    ...new Set(
      Array.from({ length: Math.ceil(length / view) }, (_, i) =>
        Math.min(i * view, Math.max(0, total - view)),
      ),
    ),
  ];
  const ys = steps(
    plan.capturedHeight,
    metrics.viewportHeight,
    plan.capturedHeight,
  );
  const xs = steps(metrics.width, metrics.viewportWidth, metrics.width);
  const total = xs.length * ys.length;
  const tiles = new TileStrips(metrics.width, plan);
  let completed = 0;
  const layoutId = crypto.randomUUID();
  const documentId = original[0]?.documentId;
  const layout = (mode: "begin" | "next" | "end") =>
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        ...(documentId ? { documentIds: [documentId] } : {}),
      },
      func: fullPageLayout,
      args: [mode, layoutId],
    });
  options.onProgress?.({ completed, total });
  try {
    for (const [row, y] of ys.entries())
      for (const [column, x] of xs.entries()) {
        check(signal);
        await stillThere(tab);
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (px: number, py: number) =>
            window.scrollTo({ left: px, top: py, behavior: "instant" }),
          args: [x, y],
        });
        check(signal);
        await layout(completed === 0 ? "begin" : "next");
        await wait(SETTLE_MS, signal);
        if (await sensitive(tab)) throw new Error("password_page");
        const image = await screenshot(tab, signal);
        check(signal);
        await stillThere(tab);
        if (await sensitive(tab)) throw new Error("password_page");
        // The last viewport can overlap an earlier tile. Only paint new pixels,
        // otherwise its hidden fixed header would erase the first tile's header.
        const left = column ? xs[column - 1]! + metrics.viewportWidth : 0;
        const top = row ? ys[row - 1]! + metrics.viewportHeight : 0;
        await tiles.draw(image, {
          x,
          y,
          viewportWidth: metrics.viewportWidth,
          viewportHeight: metrics.viewportHeight,
          frameWidth: metrics.frameWidth,
          frameHeight: metrics.frameHeight,
          skipLeft: Math.max(0, left - x),
          skipTop: Math.max(0, top - y),
        });
        // Rows above the next row of frames are final: encode and free them now.
        if (column === xs.length - 1)
          await tiles.finish(
            row === ys.length - 1
              ? plan.capturedHeight
              : y + metrics.viewportHeight,
          );
        check(signal);
        completed++;
        options.onProgress?.({ completed, total });
      }
  } finally {
    await layout("end").catch(() => {});
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: (x: number, y: number) => window.scrollTo(x, y),
        args: [metrics.x, metrics.y],
      })
      .catch(() => {});
  }
  check(signal);
  const images = await tiles.pieces();
  await stillThere(tab);
  if (await sensitive(tab)) throw new Error("password_page");
  return {
    images,
    truncated: plan.truncated,
    page: { url: tab.url, title: metrics.title },
  };
}
