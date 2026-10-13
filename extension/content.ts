import { selectCrop, type CropLabels } from "./crop-selection";
import { listenForShiftCrop } from "./shift-crop";
import {
  buildPageContext,
  buildExplicitPageContext,
  buildGuideContext,
  contextRangeText,
  contextTextNode,
  restorableTextNode,
  stableElementId,
  pageDocumentKey,
  resolveGuideTargets,
  guideElementAvailable,
  guideElementSafe,
} from "./page-context";
import { pageRevision } from "./page-revision";
import { validateGuideSteps } from "./page-tools";
import { hasSensitiveContent } from "./privacy";

const contentScope = globalThis as typeof globalThis & {
  glimpseletContentReady?: boolean;
};
if (!contentScope.glimpseletContentReady) {
  contentScope.glimpseletContentReady = true;
  type Labels = { explain: string; translate: string; ask: string };
  type GuideStep = { elementId: string; note: string; action?: string };
  const originals = new Map<
    string,
    { node: Text; text: string; lastWritten?: string }
  >();
  const nodeIds = new WeakMap<Text, string>();
  let nextTextId = 1;
  let labels: Labels = {
    explain: "Explain",
    translate: "Translate",
    ask: "Ask",
  };
  let observer: MutationObserver | undefined;
  let overlayHost: HTMLDivElement | undefined;
  let overlayRoot: ShadowRoot | undefined;
  let selectionPopover: HTMLDivElement | undefined;
  let selectionTimer = 0;
  let currentGuide:
    | {
        steps: GuideStep[];
        index: number;
        purpose?: string;
        url: string;
        overview: boolean;
        targets: Map<string, { element: Element; role: string }>;
        labels: {
          next: string;
          back: string;
          close: string;
          done: string;
          title: string;
          overview: string;
          tour: string;
        };
      }
    | undefined;
  let guideReturnFocus: HTMLElement | undefined;
  let lastUrl = location.href;
  let lastRevision = "";
  let lastSensitive = false;
  let pageTimer = 0;
  let selecting = false;
  let cropLabels: CropLabels = {
    cropTitle: "Crop",
    cropHint: "Drag to select. Enter to confirm. Esc to cancel.",
    cropConfirm: "Confirm",
    cropCancel: "Cancel",
  };
  let selectionMode: "region" | "element" | undefined;
  let shiftCropEnabled = true;
  void chrome.storage.local
    .get(["shiftCropEnabled"])
    .then((stored: { shiftCropEnabled?: boolean }) => {
      shiftCropEnabled = stored.shiftCropEnabled !== false;
    });
  chrome.storage.onChanged.addListener(
    (changes: { shiftCropEnabled?: { newValue?: boolean } }, area: string) => {
      if (area === "local" && changes.shiftCropEnabled)
        shiftCropEnabled = changes.shiftCropEnabled.newValue !== false;
    },
  );
  let selectionResolve: ((result: unknown) => void) | undefined;
  let renderedStep = "";
  let guideFrame = 0;

  const send = (message: unknown) =>
    chrome.runtime.sendMessage(message).catch(() => undefined);
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      location.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(location.hostname) ||
      location.pathname !== "/install"
    )
      return;
    const value = event.data;
    if (
      !value ||
      value.type !== "glimpselet:pair" ||
      typeof value.code !== "string" ||
      !/^[A-F0-9]{16}$/.test(value.code) ||
      Number(value.port) !== Number(location.port || 80)
    )
      return;
    void send({
      type: "glimpselet:pair",
      port: Number(value.port),
      code: value.code,
      locale:
        value.locale === "en" || value.locale === "zh-TW"
          ? value.locale
          : undefined,
    });
  });

  window.addEventListener("glimpselet:tutorial-action", (event) => {
    if (
      location.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(location.hostname) ||
      location.pathname !== "/assets/glimpselet-welcome-sample.html"
    )
      return;
    const value = (event as CustomEvent).detail;
    if (
      value?.version !== 1 ||
      ![
        "float",
        "capture",
        "suggest",
        "passive",
        "guide",
        "translate",
        "selection",
        "pdf",
      ].includes(value.action) ||
      !Number.isInteger(value.step) ||
      value.step < 1 ||
      value.step > 8
    )
      return;
    void send({
      type: "glimpselet:tutorial",
      action: value.action,
      step: value.step,
      locale:
        value.locale === "en" || value.locale === "zh-TW"
          ? value.locale
          : undefined,
    });
  });
  if (
    location.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(location.hostname) &&
    location.pathname === "/assets/glimpselet-welcome-sample.html"
  ) {
    window.postMessage(
      { type: "glimpselet:tutorial:content-ready", version: 1 },
      location.origin,
    );
  }
  if (
    location.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(location.hostname) &&
    location.pathname === "/install"
  ) {
    window.postMessage({ type: "glimpselet:extension-ready" }, location.origin);
  }

  function ensureOverlay(): ShadowRoot {
    if (overlayRoot) return overlayRoot;
    overlayHost = document.createElement("div");
    overlayHost.dataset.glimpseletOverlay = "true";
    overlayHost.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    overlayRoot = overlayHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}.surface{position:fixed;inset:0;pointer-events:none;font:14px system-ui,sans-serif;color:#312922}.shade{position:fixed;inset:0;background:#20181012;pointer-events:auto;cursor:crosshair}.draw{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;overflow:visible}.popover{position:fixed;z-index:4;display:flex;gap:4px;padding:5px;background:#fffaf0;border:1px solid #d9c6a8;border-radius:12px;box-shadow:0 5px 20px #22190d30;pointer-events:auto}.popover button,.guide button,.cancel{border:0;border-radius:8px;padding:6px 9px;background:#f2e8d6;color:#30271d;font:600 12px system-ui;cursor:pointer}.cancel{position:fixed;top:12px;right:12px;pointer-events:auto}.guide{position:fixed;display:flex;flex-direction:column;box-sizing:border-box;width:269px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);padding:10px 12px;background:#fffaf0;border:1px solid #d9b98b;border-radius:12px;box-shadow:0 5px 22px #22190d30;pointer-events:auto}.guide p{margin:0 0 8px;line-height:1.4;min-height:0;overflow:auto;overflow-wrap:anywhere}.guide nav{display:flex;flex-wrap:wrap;flex-shrink:0;justify-content:space-between;gap:6px}.guide nav button{max-width:100%;overflow-wrap:anywhere}.ink{fill:none;stroke:#cc704e;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:900;stroke-dashoffset:900;animation:draw .65s ease-out forwards;filter:drop-shadow(0 1px 0 #fff)}.arrow{stroke:#cc704e;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:800;stroke-dashoffset:800;animation:draw .55s .16s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}`;
    overlayRoot.append(style);
    style.textContent += `.guide button:focus-visible,.popover button:focus-visible,.cancel:focus-visible{outline:2px solid #86513d;outline-offset:2px}@media(prefers-reduced-motion:reduce){.ink,.arrow{animation:none;stroke-dashoffset:0}}`;
    style.textContent += `.guide-overview{position:fixed;z-index:3;right:8px;top:8px;width:300px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;box-sizing:border-box;padding:12px;border:1px solid #d9b98b;border-radius:12px;background:#fffaf0;box-shadow:0 5px 22px #22190d30;pointer-events:auto;font:14px system-ui;color:#312922}.guide-overview header{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-shrink:0}.guide-overview strong{width:100%}.guide-overview p{line-height:1.4;flex-shrink:0}.guide-overview ol{overflow:auto;min-height:0;margin:10px 0 0;padding-left:25px}.guide-overview li{padding:4px 0}.guide-overview button,.guide-annotation{font:600 12px system-ui;color:#30271d;border:0;border-radius:8px;background:#f2e8d6;padding:6px 9px;cursor:pointer}.guide-overview li button{width:100%;text-align:left;line-height:1.4;overflow-wrap:anywhere}.guide-overview [aria-current]{box-shadow:inset 3px 0 #cc704e}.guide-annotation{position:fixed;z-index:2;box-sizing:border-box;height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;pointer-events:auto;box-shadow:0 2px 8px #22190d25}.guide-overview button:focus-visible,.guide-annotation:focus-visible{outline:2px solid #86513d;outline-offset:2px}.guide button:disabled,.guide-overview button:disabled{opacity:.45;cursor:default}`;
    const surface = document.createElement("div");
    surface.className = "surface";
    overlayRoot.append(surface);
    (document.documentElement || document).append(overlayHost);
    return overlayRoot;
  }

  function guidePoint(elementId: string): {
    x: number;
    y: number;
    width: number;
    height: number;
    element: Element;
  } | null {
    const element = currentGuide?.targets.get(elementId)?.element;
    if (!element || !guideElementAvailable(element)) return null;
    const r = element.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, element };
  }

  function renderGuide(): void {
    if (!currentGuide) return;
    const step = currentGuide.steps[currentGuide.index];
    if (
      hasSensitiveContent(document, true) ||
      currentGuide.url !== location.href ||
      [...currentGuide.targets.values()].some(
        ({ element }) => !guideElementSafe(element),
      )
    ) {
      closeGuide();
      return;
    }
    const root = ensureOverlay();
    const hadFocus = document.hasFocus();
    if (currentGuide.overview) {
      renderOverview();
      return;
    }
    root
      .querySelectorAll("[data-guide-overview]")
      .forEach((element) => element.remove());
    const activeControl = root
      .querySelector(".guide")
      ?.contains(root.activeElement)
      ? (root.activeElement as HTMLElement).dataset.guideControl
      : undefined;
    root.querySelector(".guide")?.remove();
    root.querySelector('svg[class~="draw"]')?.remove();
    let point = guidePoint(step.elementId);
    if (!point) {
      const index = Math.max(adjacentGuideStep(1), adjacentGuideStep(-1));
      if (index < 0) closeGuide();
      else {
        currentGuide.index = index;
        renderGuide();
      }
      return;
    }
    const changed = renderedStep !== step.elementId;
    if (
      changed &&
      (point.y < 0 ||
        point.y + point.height > innerHeight ||
        point.x < 0 ||
        point.x > innerWidth)
    ) {
      point.element.scrollIntoView({
        block: point.height > innerHeight - 16 ? "start" : "center",
        inline: "nearest",
        behavior: "instant",
      });
      point = guidePoint(step.elementId)!;
    }
    renderedStep = step.elementId;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("draw");
    svg.setAttribute("aria-hidden", "true");
    const pad = 8;
    const x = Math.max(4, point.x - pad);
    const y = Math.max(4, point.y - pad);
    const w = Math.max(24, point.width + pad * 2);
    const h = Math.max(24, point.height + pad * 2);
    drawRegion(
      svg,
      point,
      currentGuide.targets.get(step.elementId)?.role || "",
      x,
      y,
      w,
      h,
    );
    const callout = document.createElement("div");
    callout.className = "guide";
    callout.setAttribute("role", "region");
    callout.setAttribute("aria-label", currentGuide.labels.title);
    const blink = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    blink.setAttribute("viewBox", "0 0 38 24");
    blink.setAttribute("width", "38");
    blink.setAttribute("height", "24");
    blink.setAttribute("aria-label", "Blink guide");
    for (const [cx, cy, rx, ry] of [
      [11, 11, 8, 9],
      [25, 11, 8, 9],
    ] as const) {
      const eye = document.createElementNS(blink.namespaceURI, "ellipse");
      eye.setAttribute("cx", String(cx));
      eye.setAttribute("cy", String(cy));
      eye.setAttribute("rx", String(rx));
      eye.setAttribute("ry", String(ry));
      eye.setAttribute("fill", "#f4bb62");
      eye.setAttribute("stroke", "#49362a");
      eye.setAttribute("stroke-width", "1.6");
      blink.append(eye);
      const pupil = document.createElementNS(blink.namespaceURI, "circle");
      pupil.setAttribute("cx", String(cx + 2));
      pupil.setAttribute("cy", String(cy));
      pupil.setAttribute("r", "2.5");
      pupil.setAttribute("fill", "#30271d");
      blink.append(pupil);
    }
    const wink = document.createElementNS(blink.namespaceURI, "path");
    wink.setAttribute("d", "M29 21 Q34 20 36 16");
    wink.setAttribute("fill", "none");
    wink.setAttribute("stroke", "#cc704e");
    wink.setAttribute("stroke-width", "2");
    blink.append(wink);
    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;flex-wrap:wrap;flex-shrink:0;align-items:center;gap:6px;margin-bottom:5px;font:700 11px system-ui;color:#86513d";
    const title = document.createElement("span");
    title.textContent = currentGuide.labels.title;
    head.append(blink, title);
    const overview = document.createElement("button");
    overview.dataset.guideControl = "overview";
    overview.textContent = currentGuide.labels.overview;
    overview.style.cssText =
      "margin-left:auto;padding:3px 5px;font-size:11px;flex-shrink:0";
    overview.onclick = () => {
      if (!currentGuide) return;
      currentGuide.overview = true;
      renderGuide();
      overlayRoot
        ?.querySelector<HTMLButtonElement>('[data-guide-control="tour"]')
        ?.focus({ preventScroll: true });
    };
    head.append(overview);
    callout.append(head);
    const note = document.createElement("p");
    note.textContent =
      (currentGuide.index === 0 && currentGuide.purpose
        ? `${currentGuide.purpose}\n\n`
        : "") +
      step.note +
      (step.action ? ` · ${step.action}` : "");
    note.style.whiteSpace = "pre-line";
    note.setAttribute("aria-live", "polite");
    callout.append(note);
    const nav = document.createElement("nav");
    const back = document.createElement("button");
    back.dataset.guideControl = "back";
    back.textContent = currentGuide.labels.back;
    back.disabled = adjacentGuideStep(-1) < 0;
    back.onclick = () => {
      const index = adjacentGuideStep(-1);
      if (currentGuide && index >= 0) {
        currentGuide.index = index;
        renderGuide();
      }
    };
    const counter = document.createElement("span");
    counter.textContent = `${currentGuide.index + 1}/${currentGuide.steps.length}`;
    counter.style.cssText = "align-self:center;font-size:12px;color:#766957";
    const next = document.createElement("button");
    next.dataset.guideControl = "next";
    next.textContent =
      adjacentGuideStep(1) < 0
        ? currentGuide.labels.done
        : currentGuide.labels.next;
    next.onclick = () => {
      if (!currentGuide) return;
      const index = adjacentGuideStep(1);
      if (index < 0) closeGuide();
      else {
        currentGuide.index = index;
        renderGuide();
      }
    };
    const close = document.createElement("button");
    close.dataset.guideControl = "close";
    close.textContent = currentGuide.labels.close;
    close.onclick = closeGuide;
    nav.append(back, counter, next, close);
    callout.append(nav);
    // Measure the real note and localized controls before choosing a clear side.
    // Only the passage scrolls when space is tight; navigation stays visible.
    callout.style.visibility = "hidden";
    root.append(callout);
    const margin = 8;
    const viewportWidth = innerWidth - margin * 2;
    const viewportHeight = innerHeight - margin * 2;
    const naturalWidth = callout.getBoundingClientRect().width || 269;
    // Compare fractional rendered heights so rounding cannot admit a clipped
    // first line of the note.
    const minimumNoteHeight = Number.parseFloat(
      getComputedStyle(note).lineHeight,
    );
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, max));
    const spaces = (gap: number) => [
      {
        x: margin,
        y: margin,
        width: viewportWidth,
        height: clamp(point.y - gap - margin, 0, viewportHeight),
        side: "above",
      },
      {
        x: margin,
        y: Math.max(margin, point.y + point.height + gap),
        width: viewportWidth,
        height: clamp(
          innerHeight - margin - point.y - point.height - gap,
          0,
          viewportHeight,
        ),
        side: "below",
      },
      {
        x: Math.max(margin, point.x + point.width + gap),
        y: margin,
        width: clamp(
          innerWidth - margin - point.x - point.width - gap,
          0,
          viewportWidth,
        ),
        height: viewportHeight,
        side: "right",
      },
      {
        x: margin,
        y: margin,
        width: clamp(point.x - gap - margin, 0, viewportWidth),
        height: viewportHeight,
        side: "left",
      },
    ];
    let placement:
      | { x: number; y: number; width: number; height: number; score: number }
      | undefined;
    for (const compact of [false, true]) {
      if (compact) {
        // A short viewport can fit a full line and all controls above the
        // target when the counter shares the header and navigation fits a row.
        // Keep the normal layout whenever any clear side can accommodate it.
        head.append(counter);
        blink.style.display = "none";
        title.style.display = "none";
        callout.style.padding = "6px 8px";
        note.style.marginBottom = "4px";
        counter.style.marginLeft = "auto";
        head.style.marginBottom = "3px";
        blink.style.flexShrink = "0";
        for (const button of [back, next, close])
          button.style.padding = "4px 4px";
      }
      for (const [index, space] of spaces(compact ? 8 : 18).entries()) {
        if (space.width <= 0 || space.height <= 0) continue;
        const width = Math.min(
          compact ? viewportWidth : naturalWidth,
          space.width,
        );
        callout.style.width = `${width}px`;
        callout.style.maxHeight = `${space.height}px`;
        const bounds = callout.getBoundingClientRect();
        // A side too small for the header, full note line or localized
        // controls cannot be used, even if the outer card fits there.
        if (
          bounds.height > space.height ||
          bounds.width > space.width ||
          (note.scrollHeight > 0 &&
            note.getBoundingClientRect().height < minimumNoteHeight) ||
          [back, next, close].some((button) => {
            const control = button.getBoundingClientRect();
            return (
              control.left < bounds.left ||
              control.right > bounds.right ||
              control.top < bounds.top ||
              control.bottom > bounds.bottom
            );
          })
        )
          continue;
        const x =
          space.side === "left"
            ? space.x + space.width - bounds.width
            : clamp(point.x, space.x, space.x + space.width - bounds.width);
        const y =
          space.side === "above"
            ? space.y + space.height - bounds.height
            : clamp(point.y, space.y, space.y + space.height - bounds.height);
        const visibleNote = note.scrollHeight
          ? Math.min(1, note.clientHeight / note.scrollHeight)
          : 1;
        const score = visibleNote * 1000 - index;
        if (!placement || score > placement.score)
          placement = { x, y, width, height: space.height, score };
      }
      if (placement) break;
    }
    // Very large page regions can leave no clear side. Keep controls in the
    // viewport even in that case rather than letting the note leave the screen.
    placement ??= {
      x: margin,
      y: margin,
      width: viewportWidth,
      height: viewportHeight,
      score: 0,
    };
    callout.style.width = `${placement.width}px`;
    callout.style.maxHeight = `${placement.height}px`;
    const cardX = placement.x;
    const cardY = placement.y;
    callout.style.left = `${cardX}px`;
    callout.style.top = `${cardY}px`;
    callout.style.visibility = "visible";
    const card = callout.getBoundingClientRect();
    const startX = point.x + point.width / 2;
    const startY = point.y + point.height / 2;
    const endX = clamp(startX, cardX, cardX + card.width);
    const endY = clamp(startY, cardY, cardY + card.height);
    const arrow = document.createElementNS(svg.namespaceURI, "path");
    arrow.setAttribute("class", "arrow");
    arrow.setAttribute(
      "d",
      `M${startX} ${startY} Q${(startX + endX) / 2 + 22} ${(startY + endY) / 2} ${endX} ${endY} m-7 -4 l7 4 l-7 4`,
    );
    svg.append(arrow);
    root.append(svg, callout);
    if (!changed)
      for (const ink of svg.querySelectorAll<SVGElement>(".ink,.arrow")) {
        ink.style.animation = "none";
        ink.style.strokeDashoffset = "0";
      }
    if (!hadFocus) return;
    if (changed || (activeControl === "back" && back.disabled))
      next.focus({ preventScroll: true });
    else if (activeControl === "back") back.focus({ preventScroll: true });
    else if (activeControl === "next") next.focus({ preventScroll: true });
    else if (activeControl === "close") close.focus({ preventScroll: true });
    else if (activeControl === "overview")
      overview.focus({ preventScroll: true });
  }

  function drawRegion(
    svg: SVGSVGElement,
    point: NonNullable<ReturnType<typeof guidePoint>>,
    role: string,
    x = point.x - 6,
    y = point.y - 6,
    width = point.width + 12,
    height = point.height + 12,
  ): void {
    const region = document.createElementNS(
      svg.namespaceURI,
      role === "section" || role === "paragraph" ? "rect" : "ellipse",
    );
    region.setAttribute("class", "ink");
    region.setAttribute("data-guide-target", stableElementId(point.element));
    region.setAttribute("pathLength", "900");
    if (region.tagName === "rect") {
      for (const [key, value] of Object.entries({
        x,
        y,
        width,
        height,
        rx: 10,
      }))
        region.setAttribute(key, String(value));
    } else {
      for (const [key, value] of Object.entries({
        cx: x + width / 2,
        cy: y + height / 2,
        rx: width / 2,
        ry: height / 2,
      }))
        region.setAttribute(key, String(value));
    }
    svg.append(region);
  }

  function renderOverview(): void {
    if (!currentGuide || !overlayRoot) return;
    const hadFocus = document.hasFocus();
    const root = overlayRoot;
    const focusedAnnotation = root.activeElement?.matches(".guide-annotation")
      ? (root.activeElement as HTMLElement).dataset.guideIndex
      : undefined;
    root.querySelector(".guide")?.remove();
    root.querySelector('svg[class~="draw"]')?.remove();
    root
      .querySelectorAll('[data-guide-overview="annotation"]')
      .forEach((element) => element.remove());
    let panel = root.querySelector<HTMLElement>(
      '[data-guide-overview="panel"]',
    );
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "guide-overview";
      panel.dataset.guideOverview = "panel";
      panel.setAttribute("aria-label", currentGuide.labels.overview);
      const header = document.createElement("header");
      const title = document.createElement("strong");
      title.textContent = currentGuide.labels.overview;
      const tour = document.createElement("button");
      tour.dataset.guideControl = "tour";
      tour.textContent = currentGuide.labels.tour;
      tour.onclick = () => {
        if (!currentGuide) return;
        if (!guidePoint(currentGuide.steps[currentGuide.index].elementId)) {
          const index = Math.max(adjacentGuideStep(1), adjacentGuideStep(-1));
          if (index < 0) {
            closeGuide();
            return;
          }
          currentGuide.index = index;
        }
        currentGuide.overview = false;
        renderedStep = "";
        renderGuide();
      };
      const close = document.createElement("button");
      close.dataset.guideControl = "close";
      close.textContent = currentGuide.labels.close;
      close.onclick = closeGuide;
      header.append(title, tour, close);
      panel.append(header);
      if (currentGuide.purpose) {
        const purpose = document.createElement("p");
        purpose.textContent = currentGuide.purpose;
        panel.append(purpose);
      }
      const list = document.createElement("ol");
      for (const [index, step] of currentGuide.steps.entries()) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.dataset.guideIndex = String(index);
        button.textContent =
          step.note + (step.action ? ` · ${step.action}` : "");
        button.onclick = () => visitGuideStep(index);
        item.append(button);
        list.append(item);
      }
      panel.append(list);
      root.append(panel);
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("draw");
    svg.setAttribute("aria-hidden", "true");
    const occupied: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    const panelRect = panel.getBoundingClientRect();
    occupied.push(panelRect);
    for (const [index, step] of currentGuide.steps.entries()) {
      const point = guidePoint(step.elementId);
      if (
        !point ||
        point.y >= innerHeight ||
        point.y + point.height <= 0 ||
        point.x >= innerWidth ||
        point.x + point.width <= 0
      )
        continue;
      const isRegion = point.element.matches(
        "main,article,section,form,[role=main],[role=region],[role=form],p,li,dt,dd,blockquote,.pdf-text-layer>span",
      );
      drawRegion(svg, point, isRegion ? "section" : "control");
      const annotation = document.createElement("button");
      annotation.className = "guide-annotation";
      annotation.dataset.guideOverview = "annotation";
      annotation.dataset.guideIndex = String(index);
      annotation.textContent = `${index + 1}. ${step.note}`;
      annotation.title = step.note;
      annotation.onclick = () => visitGuideStep(index);
      const width = Math.min(220, innerWidth - 16);
      const x = Math.max(8, Math.min(innerWidth - width - 8, point.x));
      let y = Math.max(8, Math.min(innerHeight - 36, point.y));
      // Compact callouts share a number with the full explanation in the list.
      // Avoid piling labels on top of neighboring sections and paragraphs.
      while (
        y < innerHeight - 36 &&
        occupied.some(
          (r) =>
            x < r.x + r.width &&
            x + width > r.x &&
            y < r.y + r.height &&
            y + 28 > r.y,
        )
      )
        y += 32;
      if (y >= innerHeight - 36) continue;
      annotation.style.cssText = `left:${x}px;top:${y}px;width:${width}px`;
      occupied.push({ x, y, width, height: 28 });
      root.append(annotation);
    }
    for (const ink of svg.querySelectorAll<SVGElement>(".ink")) {
      ink.style.animation = "none";
      ink.style.strokeDashoffset = "0";
    }
    root.append(svg);
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-guide-index]",
    )) {
      button.disabled = !guidePoint(
        currentGuide.steps[Number(button.dataset.guideIndex)].elementId,
      );
      if (Number(button.dataset.guideIndex) === currentGuide.index)
        button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    if (hadFocus && focusedAnnotation !== undefined)
      (
        root.querySelector<HTMLButtonElement>(
          `.guide-annotation[data-guide-index="${focusedAnnotation}"]`,
        ) ||
        panel.querySelector<HTMLButtonElement>(
          `[data-guide-index="${focusedAnnotation}"]`,
        )
      )?.focus({ preventScroll: true });
  }

  function visitGuideStep(index: number): void {
    if (
      !currentGuide ||
      !currentGuide.steps[index] ||
      !guidePoint(currentGuide.steps[index].elementId)
    )
      return;
    currentGuide.index = index;
    currentGuide.overview = false;
    renderedStep = "";
    renderGuide();
  }

  function adjacentGuideStep(direction: 1 | -1): number {
    if (!currentGuide) return -1;
    for (
      let index = currentGuide.index + direction;
      index >= 0 && index < currentGuide.steps.length;
      index += direction
    )
      if (guidePoint(currentGuide.steps[index].elementId)) return index;
    return -1;
  }

  function closeGuide(): void {
    const hadFocus = document.hasFocus();
    const returnFocus = currentGuide ? guideReturnFocus : undefined;
    currentGuide = undefined;
    guideReturnFocus = undefined;
    renderedStep = "";
    overlayRoot?.querySelector(".guide")?.remove();
    overlayRoot?.querySelector('svg[class~="draw"]')?.remove();
    overlayRoot
      ?.querySelectorAll("[data-guide-overview]")
      .forEach((element) => element.remove());
    if (hadFocus && returnFocus?.isConnected)
      returnFocus.focus({ preventScroll: true });
  }

  function closeSelectionPopover(): void {
    window.clearTimeout(selectionTimer);
    selectionTimer = 0;
    selectionPopover?.remove();
    selectionPopover = undefined;
  }

  function showSelectionPopover(): void {
    closeSelectionPopover();
    if (currentGuide) return;
    const selection = getSelection();
    if (selection?.rangeCount !== 1) return;
    const range = selection.getRangeAt(0).cloneRange();
    const text = contextRangeText(range);
    if (!text) return;
    const rect = range.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "popover";
    selectionPopover = pop;
    for (const [action, label] of [
      ["explain", labels.explain],
      ["translate", labels.translate],
      ["ask", labels.ask],
    ] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () => {
        closeSelectionPopover();
        const current = getSelection();
        if (current?.rangeCount !== 1) return;
        const currentRange = current.getRangeAt(0);
        if (
          currentRange.startContainer !== range.startContainer ||
          currentRange.startOffset !== range.startOffset ||
          currentRange.endContainer !== range.endContainer ||
          currentRange.endOffset !== range.endOffset
        )
          return;
        if (contextRangeText(range) !== text) return;
        send({
          type: "glimpselet:selection",
          text,
          url: location.href,
          action,
        });
      };
      pop.append(button);
    }
    pop.style.left = `${Math.max(8, Math.min(innerWidth - 250, rect.left))}px`;
    pop.style.top = `${Math.max(8, rect.top - 45)}px`;
    ensureOverlay().append(pop);
  }

  function onSelectionChange(): void {
    closeSelectionPopover();
    if (currentGuide) return;
    selectionTimer = window.setTimeout(() => {
      selectionTimer = 0;
      showSelectionPopover();
    }, 40);
  }

  function updateGuidePosition(): void {
    if (!guideFrame && currentGuide)
      guideFrame = requestAnimationFrame(() => {
        guideFrame = 0;
        renderGuide();
      });
  }

  function reportPageChange(checkContent = false): void {
    const url = location.href;
    if (url === lastUrl && !checkContent) return;
    const context = buildPageContext();
    lastSensitive = context.hasPassword;
    const revision = pageRevision(context);
    if (url !== lastUrl || (checkContent && revision !== lastRevision)) {
      lastUrl = url;
      lastRevision = revision;
      send({ type: "glimpselet:page-changed", url, revision });
    }
  }

  function relevantMutation(record: MutationRecord): boolean {
    const target =
      record.target instanceof Element
        ? record.target
        : record.target.parentElement;
    if (!target) return false;
    if (
      record.type === "attributes" &&
      [
        "type",
        "data-private",
        "data-sensitive",
        "contenteditable",
        "aria-hidden",
        "hidden",
      ].includes(record.attributeName ?? "")
    )
      return true;
    if (
      target.closest(
        "[data-glimpselet-overlay], [data-glimpselet-crop], [data-private], [data-sensitive], [contenteditable]:not([contenteditable=false])",
      )
    )
      return false;
    if (
      target instanceof HTMLInputElement &&
      /^(password|hidden|file)$/i.test(target.type)
    )
      return false;
    if (record.type === "characterData")
      return target.tagName === "TITLE" || contextTextNode(record.target);
    return true;
  }

  function initObserver(): void {
    observer?.disconnect();
    const context = buildPageContext();
    lastSensitive = context.hasPassword;
    lastRevision = pageRevision(context);
    observer = new MutationObserver((records) => {
      if (!records.some(relevantMutation)) return;
      updateGuidePosition();
      window.clearTimeout(pageTimer);
      pageTimer = window.setTimeout(() => reportPageChange(true), 250);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-hidden",
        "class",
        "contenteditable",
        "data-private",
        "data-sensitive",
        "hidden",
        "role",
        "style",
        "title",
        "type",
        "autocomplete",
      ],
    });
    window.setInterval(() => {
      // MutationObserver cannot see changes inside shadow roots or frame documents.
      reportPageChange(hasSensitiveContent() !== lastSensitive);
    }, 650);
    window.addEventListener("popstate", () => reportPageChange());
    window.addEventListener("hashchange", () => reportPageChange());
    window.addEventListener("scroll", updateGuidePosition, { passive: true });
    window.addEventListener("resize", updateGuidePosition, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    listenForShiftCrop(
      window,
      () =>
        shiftCropEnabled &&
        !selecting &&
        !hasSensitiveContent(document, "visible-capture"),
      (initialPointer) => {
        void select("region", cropLabels.cropCancel, initialPointer).then(
          (result) => {
            const value = result as { rect?: number[] };
            if (value.rect)
              void send({
                type: "glimpselet:crop-selected",
                rect: value.rect,
                url: location.href,
                geometry: {
                  width: innerWidth,
                  height: innerHeight,
                  scrollX,
                  scrollY,
                  devicePixelRatio,
                },
              });
          },
        );
      },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          closeGuide();
          closeSelectionPopover();
        }
      },
      true,
    );
  }

  function select(
    mode: "region" | "element",
    cancelLabel: string,
    initialPointer?: PointerEvent,
  ): Promise<unknown> {
    if (hasSensitiveContent(document, "visible-capture"))
      return Promise.resolve({ error: "password_page" });
    if (selecting) return Promise.resolve({ cancelled: true });
    selecting = true;
    selectionMode = mode;
    if (mode === "region") {
      const host = document.createElement("div");
      host.dataset.glimpseletCrop = "true";
      // Host-page styles outrank ordinary shadow :host rules and can hide it.
      host.style.setProperty("display", "block", "important");
      document.documentElement.append(host);
      void send({ type: "glimpselet:crop-mode", active: true });
      return selectCrop(
        host,
        () => new DOMRect(0, 0, innerWidth, innerHeight),
        cropLabels,
        devicePixelRatio,
        initialPointer,
      )
        .then((rect) =>
          rect
            ? { rect: [rect.x, rect.y, rect.width, rect.height] }
            : { cancelled: true },
        )
        .finally(() => {
          selecting = false;
          selectionMode = undefined;
          void send({ type: "glimpselet:crop-mode", active: false });
        });
    }
    return new Promise((resolve) => {
      selectionResolve = resolve;
      const root = ensureOverlay();
      const shade = document.createElement("div");
      shade.className = "shade";
      shade.setAttribute("role", "button");
      shade.setAttribute("aria-label", cancelLabel);
      root.append(shade);
      const cancelButton = document.createElement("button");
      cancelButton.className = "cancel";
      cancelButton.textContent = cancelLabel;
      cancelButton.onclick = () => finishSelection({ cancelled: true });
      root.append(cancelButton);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("draw");
      root.append(svg);
      const cancel = () => finishSelection({ cancelled: true });
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") cancel();
      };
      const finish = (rect: [number, number, number, number]) =>
        finishSelection({ rect });
      const click = (event: MouseEvent) => {
        if (selectionMode === "element") {
          event.preventDefault();
          event.stopPropagation();
          shade.style.pointerEvents = "none";
          const target = document.elementFromPoint(
            event.clientX,
            event.clientY,
          );
          shade.style.pointerEvents = "auto";
          if (!target || target.closest("[data-glimpselet-overlay]")) return;
          const r = target.getBoundingClientRect();
          finish([
            Math.round(r.left),
            Math.round(r.top),
            Math.round(r.width),
            Math.round(r.height),
          ]);
        }
      };
      shade.addEventListener("click", click);
      window.addEventListener("keydown", key, true);
      const cleanup = () => {
        window.removeEventListener("keydown", key, true);
      };
      (shade as HTMLDivElement & { cleanup?: () => void }).cleanup = cleanup;
    });
  }

  function finishSelection(result: unknown): void {
    const shade = overlayRoot?.querySelector(".shade") as
      | (HTMLDivElement & { cleanup?: () => void })
      | null;
    shade?.cleanup?.();
    shade?.remove();
    overlayRoot?.querySelector(".cancel")?.remove();
    overlayRoot?.querySelector('svg[class~="draw"]')?.remove();
    selecting = false;
    selectionMode = undefined;
    const resolve = selectionResolve;
    selectionResolve = undefined;
    resolve?.(result);
  }

  function textNodeId(node: Text): string {
    let id = nodeIds.get(node);
    if (!id) {
      id = `t${nextTextId++}`;
      nodeIds.set(node, id);
    }
    return id;
  }

  chrome.runtime.onMessage.addListener(
    (
      message: Record<string, unknown>,
      _sender: unknown,
      respond: (value: unknown) => void,
    ) => {
      if (!message || typeof message.type !== "string") return;
      if (
        [
          "glimpselet:guide-context",
          "glimpselet:explicit-context",
          "glimpselet:guide",
          "glimpselet:text-nodes",
          "glimpselet:translate",
          "glimpselet:restore",
        ].includes(message.type) &&
        typeof message.documentKey === "string" &&
        (message.documentKey !== pageDocumentKey() ||
          message.url !== location.href)
      ) {
        respond({ error: "tab_changed" });
        return;
      }
      if (
        message.type === "glimpselet:tutorial-select" &&
        location.pathname === "/assets/glimpselet-welcome-sample.html"
      ) {
        const paragraph = document.querySelector("main p, article p, p");
        if (paragraph) {
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        }
        respond({ ok: true });
        return;
      }
      if (
        message.type === "glimpselet:tutorial-done" &&
        location.pathname === "/assets/glimpselet-welcome-sample.html" &&
        Number.isInteger(message.step) &&
        Number(message.step) >= 1 &&
        Number(message.step) <= 8
      ) {
        window.opener?.postMessage(
          { type: "glimpselet:tutorial:done", version: 1, step: message.step },
          location.origin,
        );
        respond({ ok: true });
        return;
      }
      if (message.type === "glimpselet:sensitive") {
        respond({
          hasPassword: hasSensitiveContent(),
        });
        return;
      }
      if (message.type === "glimpselet:context") {
        respond(buildPageContext());
        return;
      }
      if (
        message.type === "glimpselet:guide-context" ||
        message.type === "glimpselet:explicit-context"
      ) {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        respond(
          message.type === "glimpselet:guide-context"
            ? buildGuideContext()
            : buildExplicitPageContext(),
        );
        return;
      }
      if (message.type === "glimpselet:identity") {
        respond({
          documentKey: pageDocumentKey(),
          url: location.href,
          translated: [...originals.values()].some(
            (entry) =>
              entry.node.isConnected &&
              entry.lastWritten !== undefined &&
              entry.node.nodeValue === entry.lastWritten &&
              restorableTextNode(entry.node),
          ),
        });
        return;
      }
      if (
        message.type === "glimpselet:labels" &&
        message.labels &&
        typeof message.labels === "object"
      ) {
        const incoming = message.labels as Partial<Labels> &
          Partial<CropLabels>;
        for (const key of [
          "cropTitle",
          "cropHint",
          "cropConfirm",
          "cropCancel",
        ] as const) {
          if (typeof incoming[key] === "string")
            cropLabels[key] = incoming[key]!;
        }
        labels = {
          explain: incoming.explain || labels.explain,
          translate: incoming.translate || labels.translate,
          ask: incoming.ask || labels.ask,
        };
        respond({ ok: true });
        return;
      }
      if (
        message.type === "glimpselet:select" &&
        (message.mode === "region" || message.mode === "element")
      ) {
        const requestLabels = message.labels as
          | (Partial<CropLabels> & { cancel?: string })
          | undefined;
        if (requestLabels) cropLabels = { ...cropLabels, ...requestLabels };
        void select(message.mode, requestLabels?.cancel || "Cancel").then(
          respond,
        );
        return true;
      }
      if (message.type === "glimpselet:guide" && Array.isArray(message.steps)) {
        if (hasSensitiveContent(document, true)) {
          closeGuide();
          respond({ error: "password_page" });
          return;
        }
        // Keep the IDs from the requested map even when late content changes
        // which regions would fit in a newly sampled map.
        const availableTargets = resolveGuideTargets();
        const valid = validateGuideSteps(
          { steps: message.steps },
          new Set(availableTargets.keys()),
        );
        const targets = new Map(
          valid.map((step) => [
            step.elementId,
            availableTargets.get(step.elementId)!,
          ]),
        );
        if (valid.length) {
          closeSelectionPopover();
          if (!currentGuide) {
            const active = document.activeElement;
            guideReturnFocus =
              active &&
              active !== document.body &&
              !overlayHost?.contains(active)
                ? (active as HTMLElement)
                : undefined;
          }
          const guideLabels = (message.labels || {}) as {
            next?: string;
            back?: string;
            close?: string;
            done?: string;
            title?: string;
            overview?: string;
            tour?: string;
          };
          currentGuide = {
            steps: valid,
            index: 0,
            overview: false,
            targets,
            url: location.href,
            purpose:
              typeof message.purpose === "string"
                ? message.purpose.trim().slice(0, 360)
                : undefined,
            labels: {
              next: guideLabels.next || "Next",
              back: guideLabels.back || "Back",
              close: guideLabels.close || "Close guide",
              done: guideLabels.done || "Done",
              title: guideLabels.title || "Glimpselet",
              overview: guideLabels.overview || "Overview",
              tour: guideLabels.tour || "Step by step",
            },
          };
          renderedStep = "";
          renderGuide();
          respond({ ok: true });
        } else {
          closeGuide();
          respond({ ok: false });
        }
        return;
      }
      if (message.type === "glimpselet:text-nodes") {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        const nodes: Array<{ id: string; text: string }> = [];
        const cursor = Math.max(0, Math.floor(Number(message.cursor) || 0));
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node: Node | null;
        let size = 0;
        let index = 0;
        let hasMore = false;
        while ((node = walker.nextNode())) {
          if (!(node instanceof Text)) continue;
          const retainedId = nodeIds.get(node);
          let original = retainedId ? originals.get(retainedId) : undefined;
          const retainedEmpty =
            original?.node === node &&
            original.lastWritten === "" &&
            node.nodeValue === "";
          if (!contextTextNode(node, retainedEmpty)) continue;
          if (index < cursor) {
            index++;
            continue;
          }
          let id = retainedId ?? textNodeId(node);
          if (
            original &&
            node.nodeValue !== (original.lastWritten ?? original.text)
          ) {
            originals.delete(id);
            nodeIds.delete(node);
            id = textNodeId(node);
            original = undefined;
          }
          const sourceText = original?.text ?? node.nodeValue!;
          if (sourceText.length > 12_000) {
            respond({ error: "translation_incomplete" });
            return;
          }
          if (nodes.length >= 160 || size + sourceText.length > 24_000) {
            hasMore = true;
            break;
          }
          if (!original) originals.set(id, { node, text: sourceText });
          nodes.push({ id, text: sourceText });
          size += sourceText.length;
          index++;
        }
        respond({ nodes, ...(hasMore ? { nextCursor: index } : {}) });
        return;
      }
      if (
        message.type === "glimpselet:translate" &&
        Array.isArray(message.nodes)
      ) {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        let applied = 0;
        let changed = 0;
        let rejected = 0;
        const skipped = { disconnected: 0, sourceChanged: 0, ineligible: 0 };
        for (const entry of (
          message.nodes as Array<{ id?: string; text?: string }>
        ).slice(0, 160)) {
          if (
            !entry ||
            typeof entry.id !== "string" ||
            typeof entry.text !== "string"
          ) {
            rejected++;
            continue;
          }
          const original = originals.get(entry.id);
          if (!original || entry.text.length > 12_000) {
            rejected++;
            continue;
          }
          if (!original.node.isConnected) {
            skipped.disconnected++;
            continue;
          }
          if (
            !contextTextNode(
              original.node,
              original.lastWritten === "" && original.node.nodeValue === "",
            )
          ) {
            skipped.ineligible++;
            continue;
          }
          if (
            original.node.nodeValue !== (original.lastWritten ?? original.text)
          ) {
            originals.delete(entry.id);
            nodeIds.delete(original.node);
            skipped.sourceChanged++;
            continue;
          }
          if (original.node.nodeValue !== entry.text) {
            original.node.nodeValue = entry.text;
            original.lastWritten = entry.text;
            changed++;
            original.node.parentElement?.setAttribute(
              "data-glimpselet-translated",
              "true",
            );
          }
          applied++;
        }
        respond({ applied, changed, skipped, rejected });
        return;
      }
      if (message.type === "glimpselet:restore") {
        let restored = 0;
        for (const [id, entry] of originals) {
          if (
            entry.node.isConnected &&
            restorableTextNode(entry.node) &&
            entry.lastWritten !== undefined &&
            entry.node.nodeValue === entry.lastWritten
          ) {
            entry.node.nodeValue = entry.text;
            entry.node.parentElement?.removeAttribute(
              "data-glimpselet-translated",
            );
            restored++;
          }
          originals.delete(id);
          nodeIds.delete(entry.node);
        }
        respond({ restored });
        return;
      }
    },
  );

  initObserver();
}
