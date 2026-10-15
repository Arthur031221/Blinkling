import * as pdfjs from "pdfjs-dist";
import { bundles, chooseLocale, fill } from "./i18n";
import { parseReaderPdfUrl, readerUrlOriginPattern } from "./reader-url";

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");
const strings =
  bundles[chooseLocale(navigator.languages ?? [navigator.language])];
const pagesElement = document.querySelector<HTMLElement>("#pages")!;
const status = document.querySelector<HTMLElement>("#status")!;
const allow = document.querySelector<HTMLButtonElement>("#allow")!;
const label = document.querySelector<HTMLElement>("#page-label")!;
document.querySelector<HTMLElement>("#title")!.textContent =
  strings.readerTitle;
document.title = strings.readerTitle;
allow.textContent = strings.readerAllow;
/** Pages this close to the viewport (in viewport heights) are drawn. */
const NEAR = 1.5;
const RENDER_WIDTH_LIMIT = 900;

async function render(
  pdf: pdfjs.PDFDocumentProxy,
  number: number,
  holder: HTMLElement,
): Promise<void> {
  const page = await pdf.getPage(number);
  const scale = Math.min(
    1.6,
    Math.max(0.8, (innerWidth - 40) / RENDER_WIDTH_LIMIT),
  );
  const viewport = page.getViewport({ scale });
  const ratio = devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas");
  const painting = page.render({
    canvasContext: context,
    viewport,
    canvas,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
  const textLayer = document.createElement("div");
  textLayer.className = "pdf-text-layer";
  textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
  const layer = new pdfjs.TextLayer({
    textContentSource: await page.getTextContent(),
    container: textLayer,
    viewport,
  });
  await Promise.all([painting.promise, layer.render()]);
  holder.replaceChildren(canvas, textLayer);
}

async function open(source: string): Promise<void> {
  status.textContent = strings.readerLoading;
  try {
    const pdf = await pdfjs.getDocument({
      url: source,
      cMapUrl: chrome.runtime.getURL("cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL("standard_fonts/"),
      wasmUrl: chrome.runtime.getURL("wasm/"),
    }).promise;
    status.textContent = "";
    const first = await pdf.getPage(1);
    const size = first.getViewport({
      scale: Math.min(
        1.6,
        Math.max(0.8, (innerWidth - 40) / RENDER_WIDTH_LIMIT),
      ),
    });
    const drawn = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const holder = entry.target as HTMLElement;
          const number = Number(holder.dataset.page);
          if (!entry.isIntersecting) continue;
          label.textContent = fill(strings.readerPage, { n: number });
          if (drawn.has(number)) continue;
          drawn.add(number);
          void render(pdf, number, holder).catch(() => {
            drawn.delete(number);
            status.textContent = strings.readerFailed;
          });
        }
      },
      { rootMargin: `${NEAR * 100}% 0px` },
    );
    for (let number = 1; number <= pdf.numPages; number++) {
      const holder = document.createElement("section");
      holder.className = "pdf-page";
      holder.dataset.page = String(number);
      holder.style.width = `${size.width}px`;
      holder.style.height = `${size.height}px`;
      holder.setAttribute(
        "aria-label",
        fill(strings.readerPage, { n: number }),
      );
      pagesElement.append(holder);
      observer.observe(holder);
    }
  } catch {
    status.textContent = strings.readerFailed;
  }
}

const source = new URL(location.href).searchParams.get("url") ?? "";
const parsed = parseReaderPdfUrl(source);
if (!parsed) status.textContent = strings.readerFailed;
else {
  const origins = [readerUrlOriginPattern(parsed)];
  void chrome.permissions.contains({ origins }).then((granted: boolean) => {
    if (granted) return open(parsed.href);
    allow.hidden = false;
    // Chrome shows its prompt only for a click.
    allow.addEventListener("click", () => {
      void chrome.permissions.request({ origins }).then((ok: boolean) => {
        if (!ok) return;
        allow.hidden = true;
        void open(parsed.href);
      });
    });
  });
}
