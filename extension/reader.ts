import * as pdfjs from "pdfjs-dist";
import "./content";
import { buildPageContext } from "./page-context";
import { encodeCanvasPng } from "./png";
import {
  formatReaderText,
  readerLocales,
  type ReaderLocale,
  type ReaderStrings,
} from "./reader-locales";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist/types/src/display/api";

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const urlInput = document.querySelector<HTMLInputElement>("#pdf-url")!;
const urlForm = document.querySelector<HTMLFormElement>("#url-form")!;
const pageElement = document.querySelector<HTMLElement>("#page")!;
const pageLabel = document.querySelector<HTMLElement>("#page-label")!;
const status = document.querySelector<HTMLElement>("#status")!;
document.documentElement.classList.add("locale-loading");
let locale: ReaderLocale = "en";
let t: ReaderStrings = readerLocales.en;
let pdf: PDFDocumentProxy | undefined;
let loadingTask: PDFDocumentLoadingTask | undefined;
let pageNumber = 1;
let pageText = "";
let pageTitle = "PDF document";
let documentGeneration = 0;
let renderGeneration = 0;
let sourceIntent = 0;
let activeRender: RenderTask | undefined;
let activeTextLayer: InstanceType<typeof pdfjs.TextLayer> | undefined;
let resizeFrame = 0;
let currentStatusKey: keyof ReaderStrings = "choose";
let currentStatusValues: Record<string, string | number> = {};

function message(
  key: keyof ReaderStrings,
  values: Record<string, string | number> = {},
): string {
  return formatReaderText(t[key], values);
}
function setStatus(
  key: keyof ReaderStrings,
  values: Record<string, string | number> = {},
): void {
  currentStatusKey = key;
  currentStatusValues = values;
  status.textContent = message(key, values);
}
function applyLocale(): void {
  document.documentElement.lang = locale;
  document.title = message("title");
  document
    .querySelectorAll<HTMLElement>("[data-reader-label]")
    .forEach((element) => {
      const key = element.dataset.readerLabel as keyof ReaderStrings;
      element.textContent = message(key);
    });
  document
    .querySelectorAll<HTMLInputElement>("[data-reader-placeholder]")
    .forEach((element) => {
      element.placeholder = message(
        element.dataset.readerPlaceholder as keyof ReaderStrings,
      );
    });
  document
    .querySelectorAll<HTMLElement>("[data-reader-aria]")
    .forEach((element) => {
      element.setAttribute(
        "aria-label",
        message(element.dataset.readerAria as keyof ReaderStrings),
      );
    });
  status.textContent = message(currentStatusKey, currentStatusValues);
  if (pdf) {
    pageLabel.textContent = message("pageLabel", {
      page: pageNumber,
      total: pdf.numPages,
    });
    document.title = `${pageTitle} · ${pageLabel.textContent}`;
  } else {
    pageLabel.textContent = message("noDocument");
  }
  document.documentElement.classList.remove("locale-loading");
}
async function initializeLocale(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get("locale");
    const candidate = stored.locale;
    if (typeof candidate === "string" && candidate in readerLocales)
      locale = candidate as ReaderLocale;
  } catch {
    /* The reader remains localized in English when extension storage is unavailable. */
  }
  t = readerLocales[locale];
  applyLocale();
}
chrome.storage.onChanged.addListener(
  (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    const candidate = changes.locale?.newValue;
    if (
      areaName === "local" &&
      typeof candidate === "string" &&
      candidate in readerLocales
    ) {
      locale = candidate as ReaderLocale;
      t = readerLocales[locale];
      applyLocale();
    }
  },
);
function stopRendering(): void {
  renderGeneration++;
  activeRender?.cancel();
  activeRender = undefined;
  activeTextLayer?.cancel();
  activeTextLayer = undefined;
}
async function loadDocument(
  source: string | Uint8Array,
  title: string,
  intent: number,
): Promise<void> {
  if (intent !== sourceIntent) return;
  const generation = ++documentGeneration;
  stopRendering();
  const oldTask = loadingTask;
  loadingTask = undefined;
  pdf = undefined;
  pageText = "";
  pageElement.replaceChildren();
  if (oldTask) void oldTask.destroy().catch(() => {});
  setStatus("loading");
  try {
    const task = pdfjs.getDocument(
      typeof source === "string"
        ? {
            url: source,
            cMapUrl: chrome.runtime.getURL("cmaps/"),
            cMapPacked: true,
            standardFontDataUrl: chrome.runtime.getURL("standard_fonts/"),
            wasmUrl: chrome.runtime.getURL("wasm/"),
          }
        : {
            data: source,
            cMapUrl: chrome.runtime.getURL("cmaps/"),
            cMapPacked: true,
            standardFontDataUrl: chrome.runtime.getURL("standard_fonts/"),
            wasmUrl: chrome.runtime.getURL("wasm/"),
          },
    );
    loadingTask = task;
    const loaded = await task.promise;
    if (generation !== documentGeneration) {
      void task.destroy().catch(() => {});
      return;
    }
    pdf = loaded;
    pageNumber = 1;
    pageTitle = title || "PDF document";
    await renderPage(generation);
    if (generation === documentGeneration && pdf === loaded)
      setStatus("ready", { count: loaded.numPages });
  } catch {
    if (generation === documentGeneration) setStatus("openError");
  }
}
async function renderPage(documentId = documentGeneration): Promise<void> {
  const doc = pdf;
  if (!doc || documentId !== documentGeneration) return;
  const number = pageNumber;
  const renderId = ++renderGeneration;
  activeRender?.cancel();
  activeRender = undefined;
  try {
    const page = await doc.getPage(number);
    if (
      renderId !== renderGeneration ||
      documentId !== documentGeneration ||
      doc !== pdf ||
      number !== pageNumber
    )
      return;
    const scale = Math.min(1.6, Math.max(0.8, (innerWidth - 300) / 780));
    const viewport = page.getViewport({ scale });
    const wrapper = document.createElement("section");
    wrapper.className = "pdf-page";
    wrapper.dataset.glimpseletReaderPage = "true";
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.setAttribute("aria-label", message("pdfPage"));
    const canvas = document.createElement("canvas");
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable");
    const render = page.render({
      canvasContext: context,
      viewport,
      canvas,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    activeRender = render;
    const text = await page.getTextContent();
    if (
      renderId !== renderGeneration ||
      documentId !== documentGeneration ||
      doc !== pdf ||
      number !== pageNumber
    ) {
      render.cancel();
      return;
    }
    const textLayer = document.createElement("div");
    textLayer.className = "pdf-text-layer";
    textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
    const layer = new pdfjs.TextLayer({
      textContentSource: text,
      container: textLayer,
      viewport,
    });
    activeTextLayer = layer;
    wrapper.append(canvas, textLayer);
    await Promise.all([render.promise, layer.render()]);
    if (
      renderId !== renderGeneration ||
      documentId !== documentGeneration ||
      doc !== pdf ||
      number !== pageNumber
    )
      return;
    pageElement.replaceChildren(wrapper);
    pageText = text.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 24_000);
    document.title = `${pageTitle} · ${message("pageLabel", { page: number, total: doc.numPages })}`;
    pageLabel.textContent = message("pageLabel", {
      page: number,
      total: doc.numPages,
    });
    await publishContext(documentId, renderId);
  } catch {
    if (renderId === renderGeneration && documentId === documentGeneration)
      setStatus("openError");
  } finally {
    if (renderId === renderGeneration) {
      activeRender = undefined;
      activeTextLayer = undefined;
    }
  }
}
async function publishContext(
  documentId: number,
  renderId: number,
): Promise<void> {
  if (
    !pdf ||
    documentId !== documentGeneration ||
    renderId !== renderGeneration
  )
    return;
  try {
    await chrome.runtime.sendMessage({
      type: "glimpselet:reader-context",
      context: buildPageContext(),
    });
  } catch {
    /* Opening the floating panel will publish the context on its next action. */
  }
}
function selectedText(): string {
  const selection = getSelection()?.toString().trim() || "";
  return selection.slice(0, 5000);
}
async function ask(
  action: "ask" | "translate" | "summary" | "guide",
): Promise<void> {
  if (!pdf) {
    setStatus("openFirst");
    return;
  }
  const selected = selectedText();
  const text = selected || pageText;
  const questions = {
    ask: selected
      ? "Help me understand this selected passage."
      : "Answer my question about this PDF page.",
    translate: selected
      ? "Translate this selected passage into my target language."
      : "Translate this PDF page into my target language.",
    summary: selected
      ? "Summarize this selected passage."
      : "Summarize this PDF page.",
    guide: selected
      ? "Guide me through this selected passage, explaining its steps in order."
      : "Guide me through this PDF page, explaining its key steps in order.",
  };
  try {
    const canvas = pageElement.querySelector("canvas");
    let image: string | undefined;
    if (canvas) {
      const thumbnail = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
      thumbnail.width = Math.round(canvas.width * scale);
      thumbnail.height = Math.round(canvas.height * scale);
      thumbnail
        .getContext("2d")
        ?.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
      image = encodeCanvasPng(thumbnail);
    }
    const response = (await chrome.runtime.sendMessage({
      type: "glimpselet:reader-action",
      action,
      question: questions[action],
      text,
      page: pageNumber,
      context: buildPageContext(),
      image,
    })) as { ok?: boolean; error?: string } | undefined;
    if (!response?.ok) {
      setStatus(response?.error === "busy" ? "actionBusy" : "actionError");
      return;
    }
    const statusKey =
      action === "summary"
        ? "summarySent"
        : action === "translate"
          ? "translationSent"
          : action === "guide"
            ? "guideSent"
            : "questionSent";
    setStatus("actionSent", { action: message(statusKey) });
  } catch {
    setStatus("actionError");
  }
}
function isHttpPdfUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
urlForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const intent = ++sourceIntent;
  const value = urlInput.value.trim();
  const parsed = isHttpPdfUrl(value);
  if (!parsed) {
    setStatus("badUrl");
    return;
  }
  const origin = `${parsed.protocol}//${parsed.host}/*`;
  // Request directly in this submit gesture so Chrome can show its site permission prompt.
  void chrome.permissions
    .request({ origins: [origin] })
    .then((granted: boolean) => {
      if (intent !== sourceIntent) return;
      if (!granted) {
        setStatus("permissionDenied");
        return;
      }
      const leaf =
        parsed.pathname.split("/").filter(Boolean).at(-1) || "PDF document";
      let title = leaf;
      try {
        title = decodeURIComponent(leaf);
      } catch {
        /* Keep the URL-encoded name. */
      }
      void loadDocument(parsed.href, title, intent);
    })
    .catch(() => {
      if (intent === sourceIntent) setStatus("permissionDenied");
    });
});
fileInput.addEventListener("change", () => {
  const intent = ++sourceIntent;
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) {
    setStatus("tooLarge");
    return;
  }
  void file
    .arrayBuffer()
    .then((buffer) => loadDocument(new Uint8Array(buffer), file.name, intent))
    .catch(() => {
      if (intent === sourceIntent) setStatus("openError");
    });
});
document
  .querySelector<HTMLButtonElement>("#prev")!
  .addEventListener("click", () => {
    if (pdf && pageNumber > 1) {
      pageNumber--;
      void renderPage();
    }
  });
document
  .querySelector<HTMLButtonElement>("#next")!
  .addEventListener("click", () => {
    if (pdf && pageNumber < pdf.numPages) {
      pageNumber++;
      void renderPage();
    }
  });
document
  .querySelectorAll<HTMLButtonElement>("[data-action]")
  .forEach((button) => {
    button.addEventListener(
      "click",
      () =>
        void ask(
          button.dataset.action as "ask" | "translate" | "summary" | "guide",
        ),
    );
  });
document
  .querySelector<HTMLButtonElement>("#open-panel")!
  .addEventListener("click", () => {
    void chrome.runtime
      .sendMessage({ type: "glimpselet:open" })
      .then((response?: { ok?: boolean }) => {
        if (response?.ok) setStatus("panelOpened");
        else setStatus("panelError");
      })
      .catch(() => setStatus("panelError"));
  });
window.addEventListener("resize", () => {
  if (!pdf) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => void renderPage());
});

void initializeLocale().then(() => {
  const initialUrl = new URL(location.href).searchParams.get("url");
  if (initialUrl) {
    urlInput.value = initialUrl;
    urlForm.requestSubmit();
  }
});
