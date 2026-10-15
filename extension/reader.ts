import * as pdfjs from "pdfjs-dist";
import { parseReaderPdfUrl } from "./reader-url";
import {
  formatReaderText,
  readerLocales,
  type ReaderLocale,
  type ReaderStrings,
} from "./reader-locales";
import { pickLocale } from "./strings";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist/types/src/display/api";

/** A plain PDF reader for the page Blink was woken on: render, text layer, page turns. */
pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const urlInput = document.querySelector<HTMLInputElement>("#pdf-url")!;
const urlForm = document.querySelector<HTMLFormElement>("#url-form")!;
const pageElement = document.querySelector<HTMLElement>("#page")!;
const pageLabel = document.querySelector<HTMLElement>("#page-label")!;
const status = document.querySelector<HTMLElement>("#status")!;
document.documentElement.classList.add("locale-loading");
const locale: ReaderLocale = pickLocale(
  chrome.i18n.getUILanguage(),
) as ReaderLocale;
const t: ReaderStrings = readerLocales[locale];
let pdf: PDFDocumentProxy | undefined;
let loadingTask: PDFDocumentLoadingTask | undefined;
let pageNumber = 1;
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
    document.title = `${pageTitle} · ${message("pageLabel", { page: number, total: doc.numPages })}`;
    pageLabel.textContent = message("pageLabel", {
      page: number,
      total: doc.numPages,
    });
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

function openUrl(value: string, intent: number): void {
  const parsed = parseReaderPdfUrl(value);
  if (!parsed) {
    setStatus("badUrl");
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
}
urlForm.addEventListener("submit", (event) => {
  event.preventDefault();
  openUrl(urlInput.value.trim(), ++sourceIntent);
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
window.addEventListener("resize", () => {
  if (!pdf) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => void renderPage());
});

applyLocale();
const initialUrl = new URL(location.href).searchParams.get("url");
if (initialUrl) {
  urlInput.value = initialUrl;
  openUrl(initialUrl.trim(), sourceIntent);
}
