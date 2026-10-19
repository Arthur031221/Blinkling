import { captureFullPage } from "./full-page";
import type { HelperHandlers, Request } from "./helper-client";
import { isReaderPdfCandidate } from "./reader-url";
import {
  readablePage,
  targetTab,
  viewportFrame,
  type TabTarget,
} from "./targets";
import { restoreTab, translateTab } from "./translate";

type Tab = TabTarget["tab"];

/** What the helper connection offers the handlers. */
export type HandlerHelper = {
  call(
    message: { type: string; [key: string]: unknown },
    timeoutMs?: number,
  ): Promise<Record<string, unknown> | undefined>;
};

const point = (value: unknown) => {
  const raw = value as { x?: unknown; y?: unknown } | undefined;
  return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)
    ? { x: Number(raw.x), y: Number(raw.y) }
    : undefined;
};

/** Puts the page script into the tab; false for pages an extension cannot enter. */
export async function injectPageScript(tab: Tab): Promise<boolean> {
  if (!readablePage(tab.url)) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["page.js"],
    });
    return true;
  } catch {
    return false;
  }
}

const askPage = (tab: Tab) => (message: Record<string, unknown>) =>
  chrome.tabs
    .sendMessage(tab.id, message)
    .then((reply) => reply as Record<string, unknown>)
    .catch(() => undefined);

export function createHandlers(helper: HandlerHelper): HelperHandlers & {
  translating(tabId: number): boolean;
} {
  const translations = new Map<number, AbortController>();

  async function elements(request: Request) {
    const target = await targetTab(point(request.point));
    if (!target || !(await injectPageScript(target.tab)))
      return { ok: true, result: null };
    const zoom = await chrome.tabs.getZoom(target.tab.id).catch(() => 1);
    const [measured] = await chrome.scripting
      .executeScript({
        target: { tabId: target.tab.id },
        func: () => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          contentType: document.contentType,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
        }),
      })
      .catch(() => []);
    // The PDF viewer accepts a script but has no page structure to give.
    if (!measured?.result || measured.result.contentType === "application/pdf")
      return { ok: true, result: null };
    const frame = {
      ...viewportFrame(target.window, measured.result, zoom),
      // Where the viewport stands on the page: marks kept in page coordinates
      // follow a scroll with it.
      scrollX: measured.result.scrollX,
      scrollY: measured.result.scrollY,
      viewWidth: measured.result.innerWidth,
      viewHeight: measured.result.innerHeight,
      pageWidth: measured.result.pageWidth,
      pageHeight: measured.result.pageHeight,
    };
    const screen = point(request.point);
    const page = await askPage(target.tab)({
      type: "blinkling:elements",
      near: screen && {
        x: (screen.x - frame.screenX) / zoom,
        y: (screen.y - frame.screenY) / zoom,
      },
    });
    if (!page?.elements) return { ok: true, result: null };
    return {
      ok: true,
      result: {
        page: {
          url: page.url ?? target.tab.url,
          title: page.title ?? "",
          tabId: target.tab.id,
          incognito: target.tab.incognito === true,
        },
        frame,
        elements: page.elements,
        ...(page.selection ? { selection: page.selection } : {}),
      },
    };
  }

  async function fullPage(
    request: Request,
    context: { signal: AbortSignal; send(message: object): void },
  ) {
    const target = await targetTab();
    if (!target || !readablePage(target.tab.url))
      return { ok: false, error: "restricted_page" };
    try {
      const result = await captureFullPage(target.tab, {
        signal: context.signal,
        onProgress: (progress) =>
          context.send({
            type: "full-page-progress",
            id: request.id,
            ...progress,
          }),
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "capture_failed",
      };
    }
  }

  async function translatePage(
    request: Request,
    context: { signal: AbortSignal },
  ) {
    const target = await targetTab();
    if (!target) return { ok: false };
    const tab = target.tab;
    translations.get(tab.id)?.abort();
    translations.delete(tab.id);
    if (!(await injectPageScript(tab))) return { ok: false };
    const deps = {
      page: askPage(tab),
      language: chrome.i18n.getUILanguage(),
      ask: async (prompt: string) => {
        const reply = await helper.call(
          { type: "translate-batch", prompt },
          130_000,
        );
        return reply?.ok === true && typeof reply.answer === "string"
          ? reply.answer
          : undefined;
      },
    };
    if (request.on !== true) return { ok: await restoreTab(deps) };
    const controller = new AbortController();
    translations.set(tab.id, controller);
    context.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    try {
      return { ok: await translateTab(deps, controller.signal) };
    } finally {
      if (translations.get(tab.id) === controller) translations.delete(tab.id);
    }
  }

  async function openPdfReader() {
    const target = await targetTab();
    if (!target || !isReaderPdfCandidate(target.tab.url)) return { ok: false };
    const url = new URL(chrome.runtime.getURL("reader.html"));
    url.searchParams.set("url", target.tab.url);
    await chrome.tabs.create({
      url: url.toString(),
      windowId: target.tab.windowId,
      index: (target.tab.index ?? 0) + 1,
    });
    return { ok: true };
  }

  /** Scrolls the page under `point` so the viewport's top left stands at the
   * page coordinates `x`, `y` (a missing one stays where it is). */
  async function scrollPage(request: Request) {
    const target = await targetTab(point(request.point));
    if (!target || !(await injectPageScript(target.tab))) return { ok: false };
    const wanted = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const [done] = await chrome.scripting
      .executeScript({
        target: { tabId: target.tab.id },
        func: (x: number | null, y: number | null) => {
          window.scrollTo({
            left: x ?? window.scrollX,
            top: y ?? window.scrollY,
            behavior: "instant",
          });
          return true;
        },
        args: [wanted(request.x), wanted(request.y)],
      })
      .catch(() => []);
    return { ok: done?.result === true };
  }

  return {
    translating: (tabId) => translations.has(tabId),
    async handle(request, context) {
      switch (request.type) {
        case "elements":
          return elements(request);
        case "full-page":
          return fullPage(request, context);
        case "scroll-page":
          return scrollPage(request);
        case "translate-page":
          return translatePage(request, context);
        case "open-pdf-reader":
          return openPdfReader();
        default:
          return undefined;
      }
    },
  };
}
