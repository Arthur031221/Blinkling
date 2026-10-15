import { collectElements } from "./elements";
import { PageTranslation } from "./translate";

/** Injected on demand into the page the user points at. Answers the service worker; nothing runs on its own. */
type Request =
  | { type: "blinkling:elements" }
  | { type: "blinkling:texts" }
  | { type: "blinkling:apply"; from: number; texts: string[] }
  | { type: "blinkling:restore" };
type Page = { __blinklingPage?: true };

const marker = globalThis as unknown as Page;
if (!marker.__blinklingPage) {
  marker.__blinklingPage = true;
  const translation = new PageTranslation();
  chrome.runtime.onMessage.addListener((message: Request, _sender, respond) => {
    if (message?.type === "blinkling:elements") {
      respond({
        elements: collectElements(),
        page: { url: location.href, title: document.title },
        frame: {
          innerWidth,
          innerHeight,
          devicePixelRatio,
          pdf: document.contentType === "application/pdf",
        },
      });
    } else if (message?.type === "blinkling:texts") {
      respond({ texts: translation.collect(), translated: translation.active });
    } else if (message?.type === "blinkling:apply") {
      respond({ written: translation.apply(message.from, message.texts) });
    } else if (message?.type === "blinkling:restore") {
      translation.restore();
      respond({ ok: true });
    }
    return false;
  });
}
