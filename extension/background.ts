import {
  bridgeUrl,
  connectWelcome,
  saveToken,
  storedCredentials,
} from "./connection";
import { captureFullPage } from "./full-page";
import { HelperLink, type Request, type RequestContext } from "./link";
import { isReaderPdfCandidate } from "./reader-url";

type BrowserTab = {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
  incognito?: boolean;
};
type Point = { x: number; y: number };
type PageReply = {
  elements: unknown[];
  page: { url: string; title: string };
  frame: { innerWidth: number; innerHeight: number; devicePixelRatio: number };
};
const READABLE = /^(https?|file):/i;
const BATCH_TEXTS = 60;
const BATCH_CHARS = 2000;
const BATCH_TOTAL_CHARS = 8000;
let url = "";

const link: HelperLink = new HelperLink(
  (request, context) => handle(request, context),
  (token) => saveToken(url, token),
);

async function normalWindows() {
  const windows = (await chrome.windows.getAll({
    windowTypes: ["normal"],
  })) as {
    id?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    focused?: boolean;
    state?: string;
  }[];
  return windows.filter((w) => w.state !== "minimized" && w.id !== undefined);
}

/** The browser window under a screen point (DIP), else the focused one. */
async function windowAt(point?: Point) {
  const windows = await normalWindows();
  const under = point
    ? windows.filter(
        (w) =>
          point.x >= (w.left ?? 0) &&
          point.x < (w.left ?? 0) + (w.width ?? 0) &&
          point.y >= (w.top ?? 0) &&
          point.y < (w.top ?? 0) + (w.height ?? 0),
      )
    : windows;
  return under.find((w) => w.focused) ?? under[0];
}

async function tabAt(point?: Point) {
  const win = await windowAt(point);
  if (!win) return undefined;
  const [tab] = (await chrome.tabs.query({
    active: true,
    windowId: win.id,
  })) as BrowserTab[];
  return tab?.id === undefined ? undefined : { win, tab };
}

async function ensurePage(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["page.js"],
  });
}

async function ask<T>(tabId: number, message: unknown): Promise<T> {
  await ensurePage(tabId);
  return (await chrome.tabs.sendMessage(tabId, message)) as T;
}

async function elements(point?: Point) {
  const found = await tabAt(point);
  if (!found || !found.tab.url || !READABLE.test(found.tab.url)) return null;
  const { win, tab } = found;
  const reply = await ask<PageReply>(tab.id!, {
    type: "blinkling:elements",
  }).catch(() => undefined);
  if (!reply) return null;
  const zoom = await chrome.tabs.getZoom(tab.id!).catch(() => 1);
  // The window's outer box is in screen DIPs; the page sits below the toolbar and
  // between equal side borders.
  const viewportWidth = reply.frame.innerWidth * zoom;
  const viewportHeight = reply.frame.innerHeight * zoom;
  return {
    page: {
      url: reply.page.url,
      title: reply.page.title,
      tabId: tab.id!,
      incognito: Boolean(tab.incognito),
    },
    frame: {
      screenX: (win.left ?? 0) + ((win.width ?? 0) - viewportWidth) / 2,
      screenY: (win.top ?? 0) + (win.height ?? 0) - viewportHeight,
      devicePixelRatio: reply.frame.devicePixelRatio,
      zoom,
    },
    elements: reply.elements,
  };
}

function languageName(): string {
  const tag = navigator.language || "en";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

async function translate(on: boolean, context: RequestContext) {
  const found = await tabAt();
  if (!found || !found.tab.url || !READABLE.test(found.tab.url))
    throw new Error("restricted");
  const tabId = found.tab.id!;
  if (!on) {
    await ask(tabId, { type: "blinkling:restore" });
    return {};
  }
  const { texts } = await ask<{ texts: string[] }>(tabId, {
    type: "blinkling:texts",
  });
  const batches: { from: number; texts: string[] }[] = [];
  let chars = 0;
  texts.forEach((text, index) => {
    const piece = text.slice(0, BATCH_CHARS);
    const last = batches.at(-1);
    if (
      !last ||
      last.texts.length >= BATCH_TEXTS ||
      chars + piece.length > BATCH_TOTAL_CHARS
    ) {
      batches.push({ from: index, texts: [piece] });
      chars = piece.length;
    } else {
      last.texts.push(piece);
      chars += piece.length;
    }
  });
  const target = languageName();
  for (const [done, batch] of batches.entries()) {
    if (context.signal.aborted) break;
    context.progress(done, batches.length);
    const reply = await link.call({
      type: "translate-batch",
      target,
      texts: batch.texts,
    });
    if (context.signal.aborted) break;
    await ask(tabId, {
      type: "blinkling:apply",
      from: batch.from,
      texts: reply.texts,
    });
  }
  return {};
}

async function openPdfReader() {
  const found = await tabAt();
  const source = found?.tab.url;
  if (!source || !isReaderPdfCandidate(source)) return false;
  const reader = new URL(chrome.runtime.getURL("reader.html"));
  reader.searchParams.set("url", source);
  await chrome.tabs.create({ url: reader.toString() });
  return true;
}

async function handle(request: Request, context: RequestContext) {
  switch (request.op) {
    case "full-page": {
      const found = await tabAt();
      if (!found || !found.tab.url || !READABLE.test(found.tab.url))
        throw new Error("restricted");
      return captureFullPage(
        { id: found.tab.id!, windowId: found.win.id!, ...found.tab },
        context.signal,
        context.progress,
      );
    }
    case "elements":
      return { elements: await elements(request.point as Point | undefined) };
    case "translate":
      return translate(request.on === true, context);
    case "pdf-reader":
      if (!(await openPdfReader())) throw new Error("not_a_pdf");
      return {};
    default:
      throw new Error("unknown_op");
  }
}

async function resume(): Promise<void> {
  if (link.connected) return;
  const credentials = await storedCredentials();
  if (!credentials) return;
  url = credentials.url;
  link.keep(credentials);
}

async function status() {
  await resume();
  let blink = false;
  if (link.connected)
    blink =
      (await link.call({ type: "status" }, 4000).catch(() => undefined))
        ?.desktop === true;
  return { link: link.connected, blink };
}

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; port?: number; code?: string },
    sender: { id?: string; tab?: { url?: string } },
    respond: (value: unknown) => void,
  ) => {
    if (sender.id !== chrome.runtime.id) return false;
    const fromInstall =
      /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/install/.test(
        sender.tab?.url ?? "",
      );
    if (message?.type === "blinkling:status") {
      void status().then(respond, () => respond({ link: false, blink: false }));
      return true;
    }
    if (message?.type === "blinkling:wake") {
      void resume()
        .then(() => link.call({ type: "wake" }, 20_000))
        .then(
          (reply) => respond({ ok: reply.ok === true }),
          () => respond({ ok: false }),
        );
      return true;
    }
    if (message?.type === "blinkling:pair" && fromInstall) {
      const port = Number(message.port);
      url = bridgeUrl(port);
      void connectWelcome(link, port, String(message.code)).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    }
    return false;
  },
);
chrome.runtime.onStartup.addListener(() => void resume());
chrome.runtime.onInstalled.addListener(() => {
  void resume();
  void chrome.tabs
    .query({ url: ["http://127.0.0.1/install*", "http://localhost/install*"] })
    .then((tabs: BrowserTab[]) => {
      for (const tab of tabs)
        if (tab.id !== undefined)
          void chrome.scripting
            .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
            .catch(() => {});
    });
});
void resume();
