import { fullPageLayout } from "./full-page-layout";
import { hasSensitiveContent } from "./privacy";
import { planTiles, type TilePlan } from "./full-page-tiles";

export type FullPageResult = {
  images: string[];
  truncated: boolean;
  page: { url: string; title: string };
};
type Frame = {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  frameWidth: number;
  frameHeight: number;
  skipLeft: number;
  skipTop: number;
};
type Tab = { id: number; windowId: number; url?: string; title?: string };

const PAGE_PIXELS = 90_000_000;
/** Chrome lets an extension take two screenshots a second. */
const SCREENSHOT_GAP_MS = 550;
const SETTLE_MS = 80;
let lastShot = 0;

const aborted = () => new Error("capture_cancelled");
const check = (signal: AbortSignal) => {
  if (signal.aborted) throw aborted();
};
function wait(ms: number, signal: AbortSignal): Promise<void> {
  check(signal);
  return new Promise((resolve, reject) => {
    const done = () => {
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

async function toBase64(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Paints scrolled frames onto horizontal strips and encodes each strip as soon
 * as no later frame can touch it, so only a couple of canvases are alive. */
export class TileStrips {
  private readonly canvases = new Map<number, OffscreenCanvas>();
  private readonly encoded: Promise<string>[] = [];
  private next = 0;
  constructor(
    private readonly width: number,
    private readonly plan: TilePlan,
  ) {}
  private context(index: number): OffscreenCanvasRenderingContext2D {
    let canvas = this.canvases.get(index);
    if (!canvas) {
      const height = Math.min(
        this.plan.tileHeight,
        this.plan.capturedHeight - index * this.plan.tileHeight,
      );
      canvas = new OffscreenCanvas(
        Math.max(1, Math.round(this.width * this.plan.scale)),
        Math.max(1, Math.round(height * this.plan.scale)),
      );
      this.canvases.set(index, canvas);
    }
    const context = canvas.getContext("2d");
    if (!context) throw new Error("capture_failed");
    return context;
  }
  async draw(shot: Blob, frame: Frame): Promise<void> {
    const image = await createImageBitmap(shot);
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
          image,
          (image.width * frame.skipLeft) / frame.frameWidth,
          (image.height * (from - frame.y)) / frame.frameHeight,
          (image.width * visibleWidth) / frame.frameWidth,
          (image.height * (to - from)) / frame.frameHeight,
          (frame.x + frame.skipLeft) * scale,
          (from - index * tileHeight) * scale,
          visibleWidth * scale,
          (to - from) * scale,
        );
      }
    } finally {
      image.close();
    }
  }
  /** Everything above `row` (CSS pixels) is final. */
  finish(row: number): void {
    while (
      this.next < this.plan.count &&
      (row >= this.plan.capturedHeight ||
        (this.next + 1) * this.plan.tileHeight <= row)
    ) {
      const canvas = this.canvases.get(this.next);
      if (!canvas) throw new Error("capture_failed");
      this.encoded.push(toBase64(canvas));
      this.canvases.delete(this.next++);
    }
  }
  pieces(): Promise<string[]> {
    return Promise.all(this.encoded);
  }
}

async function shot(tab: Tab, signal: AbortSignal): Promise<Blob> {
  const gap = lastShot + SCREENSHOT_GAP_MS - Date.now();
  if (gap > 0) await wait(gap, signal);
  const [active] = await chrome.tabs.query({
    active: true,
    windowId: tab.windowId,
  });
  if (active?.id !== tab.id) throw new Error("tab_changed");
  lastShot = Date.now();
  const url = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  return (await fetch(url)).blob();
}

async function run<T>(
  tab: Tab,
  func: (...args: never[]) => T,
  args: unknown[] = [],
  documentId?: string,
) {
  const [result] = await chrome.scripting.executeScript({
    target: {
      tabId: tab.id,
      ...(documentId ? { documentIds: [documentId] } : {}),
    },
    func,
    args: args as never,
  });
  return result as { result?: Awaited<T>; documentId?: string } | undefined;
}

/** Scrolls the page, takes the visible frames and returns it as a few readable PNG tiles. */
export async function captureFullPage(
  tab: Tab,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<FullPageResult> {
  check(signal);
  const sensitive = () =>
    run(tab, hasSensitiveContent, [null, false]).then(
      (r) => r?.result === true,
    );
  if (await sensitive()) throw new Error("password_page");
  const original = await run(tab, () => ({
    x: scrollX,
    y: scrollY,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    frameWidth: innerWidth,
    frameHeight: innerHeight,
    devicePixelRatio,
    url: location.href,
    title: document.title,
  }));
  const metrics = original?.result;
  if (!metrics || metrics.width * metrics.height > PAGE_PIXELS)
    throw new Error("page_too_large");
  if (metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0)
    throw new Error("capture_failed");
  const plan = planTiles(
    metrics.width,
    metrics.height,
    metrics.devicePixelRatio,
  );
  const steps = (length: number, view: number, last: number) => [
    ...new Set(
      Array.from({ length: Math.ceil(length / view) }, (_, i) =>
        Math.min(i * view, Math.max(0, last - view)),
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
  const layoutId = crypto.randomUUID();
  const documentId = original?.documentId;
  const layout = (mode: "begin" | "next" | "end") =>
    run(tab, fullPageLayout, [mode, layoutId], documentId);
  let completed = 0;
  progress(0, total);
  try {
    for (const [row, y] of ys.entries())
      for (const [column, x] of xs.entries()) {
        check(signal);
        await run(
          tab,
          (px: number, py: number) =>
            scrollTo({ left: px, top: py, behavior: "instant" }),
          [x, y],
        );
        await layout(completed === 0 ? "begin" : "next");
        await wait(SETTLE_MS, signal);
        if (await sensitive()) throw new Error("password_page");
        const frame = await shot(tab, signal);
        check(signal);
        // The last viewport can overlap an earlier one: paint only new pixels, or
        // its hidden fixed header would erase the first tile's header.
        const left = column ? xs[column - 1]! + metrics.viewportWidth : 0;
        const top = row ? ys[row - 1]! + metrics.viewportHeight : 0;
        await tiles.draw(frame, {
          x,
          y,
          viewportWidth: metrics.viewportWidth,
          viewportHeight: metrics.viewportHeight,
          frameWidth: metrics.frameWidth,
          frameHeight: metrics.frameHeight,
          skipLeft: Math.max(0, left - x),
          skipTop: Math.max(0, top - y),
        });
        if (column === xs.length - 1)
          tiles.finish(
            row === ys.length - 1
              ? plan.capturedHeight
              : y + metrics.viewportHeight,
          );
        progress(++completed, total);
      }
  } finally {
    await layout("end").catch(() => {});
    await run(tab, (x: number, y: number) => scrollTo(x, y), [
      metrics.x,
      metrics.y,
    ]).catch(() => {});
  }
  check(signal);
  return {
    images: await tiles.pieces(),
    truncated: plan.truncated,
    page: { url: metrics.url, title: metrics.title },
  };
}
