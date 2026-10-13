import { selectCrop, type CropLabels } from "./crop-selection";
import { listenForShiftCrop } from "./shift-crop";
import {
  buildPageContext,
  buildGuideContext,
  contextRangeText,
  contextTextNode,
  restorableTextNode,
  stableElementId,
  pageDocumentKey,
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
  let currentGuide:
    | {
        steps: GuideStep[];
        index: number;
        labels: {
          next: string;
          back: string;
          close: string;
          done: string;
          title: string;
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
    });
  });
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
    style.textContent = `:host{all:initial}.surface{position:fixed;inset:0;pointer-events:none;font:14px system-ui,sans-serif;color:#312922}.shade{position:fixed;inset:0;background:#20181012;pointer-events:auto;cursor:crosshair}.draw{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;overflow:visible}.popover{position:fixed;z-index:4;display:flex;gap:4px;padding:5px;background:#fffaf0;border:1px solid #d9c6a8;border-radius:12px;box-shadow:0 5px 20px #22190d30;pointer-events:auto}.popover button,.guide button,.cancel{border:0;border-radius:8px;padding:6px 9px;background:#f2e8d6;color:#30271d;font:600 12px system-ui;cursor:pointer}.cancel{position:fixed;top:12px;right:12px;pointer-events:auto}.guide{position:fixed;max-width:245px;padding:10px 12px;background:#fffaf0;border:1px solid #d9b98b;border-radius:12px;box-shadow:0 5px 22px #22190d30;pointer-events:auto}.guide p{margin:0 0 8px;line-height:1.4}.guide nav{display:flex;justify-content:space-between;gap:6px}.ink{fill:none;stroke:#cc704e;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:900;stroke-dashoffset:900;animation:draw .65s ease-out forwards;filter:drop-shadow(0 1px 0 #fff)}.arrow{stroke:#cc704e;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:800;stroke-dashoffset:800;animation:draw .55s .16s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}`;
    overlayRoot.append(style);
    style.textContent += `.guide button:focus-visible,.popover button:focus-visible,.cancel:focus-visible{outline:2px solid #86513d;outline-offset:2px}@media(prefers-reduced-motion:reduce){.ink,.arrow{animation:none;stroke-dashoffset:0}}`;
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
    const element = Array.from(
      document.querySelectorAll(
        "a,button,input,select,textarea,[role],h1,h2,h3,h4,h5,h6,.pdf-text-layer>span",
      ),
    ).find((candidate) => stableElementId(candidate) === elementId);
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, element };
  }

  function renderGuide(): void {
    if (!currentGuide) return;
    const root = ensureOverlay();
    const activeControl = root
      .querySelector(".guide nav")
      ?.contains(root.activeElement)
      ? (root.activeElement as HTMLElement).dataset.guideControl
      : undefined;
    root.querySelector(".guide")?.remove();
    root.querySelector("svg.draw")?.remove();
    const step = currentGuide.steps[currentGuide.index];
    let point = guidePoint(step.elementId);
    if (!point) return;
    const changed = renderedStep !== step.elementId;
    if (
      changed &&
      (point.y < 0 ||
        point.y + point.height > innerHeight ||
        point.x < 0 ||
        point.x > innerWidth)
    ) {
      point.element.scrollIntoView({
        block: "center",
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
    const ellipse = document.createElementNS(svg.namespaceURI, "ellipse");
    ellipse.setAttribute("class", "ink");
    ellipse.setAttribute("cx", String(x + w / 2));
    ellipse.setAttribute("cy", String(y + h / 2));
    ellipse.setAttribute("rx", String(w / 2));
    ellipse.setAttribute("ry", String(h / 2));
    svg.append(ellipse);
    const callout = document.createElement("div");
    callout.className = "guide";
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
      "display:flex;align-items:center;gap:6px;margin-bottom:5px;font:700 11px system-ui;color:#86513d";
    head.append(blink, document.createTextNode(currentGuide.labels.title));
    callout.append(head);
    const note = document.createElement("p");
    note.textContent = step.note + (step.action ? ` · ${step.action}` : "");
    callout.append(note);
    const nav = document.createElement("nav");
    const back = document.createElement("button");
    back.dataset.guideControl = "back";
    back.textContent = currentGuide.labels.back;
    back.disabled = currentGuide.index === 0;
    back.onclick = () => {
      if (currentGuide && currentGuide.index > 0) {
        currentGuide.index--;
        renderGuide();
      }
    };
    const counter = document.createElement("span");
    counter.textContent = `${currentGuide.index + 1}/${currentGuide.steps.length}`;
    counter.style.cssText = "align-self:center;font-size:12px;color:#766957";
    const next = document.createElement("button");
    next.dataset.guideControl = "next";
    next.textContent =
      currentGuide.index === currentGuide.steps.length - 1
        ? currentGuide.labels.done
        : currentGuide.labels.next;
    next.onclick = () => {
      if (!currentGuide) return;
      if (currentGuide.index + 1 >= currentGuide.steps.length) closeGuide();
      else {
        currentGuide.index++;
        renderGuide();
      }
    };
    const close = document.createElement("button");
    close.dataset.guideControl = "close";
    close.textContent = currentGuide.labels.close;
    close.onclick = closeGuide;
    nav.append(back, counter, next, close);
    callout.append(nav);
    const top =
      point.y > 115
        ? point.y - 110
        : Math.min(innerHeight - 90, point.y + point.height + 18);
    const cardX = Math.max(8, Math.min(Math.max(8, point.x), innerWidth - 269));
    const cardY = Math.max(8, Math.min(top, innerHeight - 130));
    callout.style.left = `${cardX}px`;
    callout.style.top = `${cardY}px`;
    const startX = point.x + point.width / 2;
    const startY = point.y + point.height / 2;
    const endX = Math.min(Math.max(startX, cardX), cardX + 245);
    const endY = cardY + (cardY > startY ? 0 : 64);
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
    if (changed || (activeControl === "back" && back.disabled))
      next.focus({ preventScroll: true });
    else if (activeControl === "back") back.focus({ preventScroll: true });
    else if (activeControl === "next") next.focus({ preventScroll: true });
    else if (activeControl === "close") close.focus({ preventScroll: true });
  }

  function closeGuide(): void {
    const returnFocus = currentGuide ? guideReturnFocus : undefined;
    currentGuide = undefined;
    guideReturnFocus = undefined;
    renderedStep = "";
    overlayRoot?.querySelector(".guide")?.remove();
    overlayRoot?.querySelector("svg.draw")?.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function closeSelectionPopover(): void {
    selectionPopover?.remove();
    selectionPopover = undefined;
  }

  function showSelectionPopover(): void {
    closeSelectionPopover();
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
    window.setTimeout(showSelectionPopover, 40);
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
      () => shiftCropEnabled && !selecting && !hasSensitiveContent(),
      (initialPointer) => {
        void select("region", cropLabels.cropCancel, initialPointer).then(
          (result) => {
            const value = result as { rect?: number[] };
            if (value.rect)
              void send({
                type: "glimpselet:crop-selected",
                rect: value.rect,
                url: location.href,
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
    if (selecting) return Promise.resolve({ cancelled: true });
    selecting = true;
    selectionMode = mode;
    if (mode === "region") {
      const host = document.createElement("div");
      host.dataset.glimpseletCrop = "true";
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
    overlayRoot?.querySelector("svg.draw")?.remove();
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
      if (message.type === "glimpselet:guide-context") {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        respond(buildGuideContext());
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
        const pageMap = buildGuideContext();
        const incoming = validateGuideSteps(
          { steps: message.steps },
          new Set(pageMap.elements.map((item) => item.id)),
        );
        const valid = incoming.filter((step) => guidePoint(step.elementId));
        if (valid.length) {
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
          };
          currentGuide = {
            steps: valid,
            index: 0,
            labels: {
              next: guideLabels.next || "Next",
              back: guideLabels.back || "Back",
              close: guideLabels.close || "Close guide",
              done: guideLabels.done || "Done",
              title: guideLabels.title || "Glimpselet",
            },
          };
          renderedStep = "";
          renderGuide();
          respond({ ok: true });
        } else respond({ ok: false });
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
          if (!(node instanceof Text) || !contextTextNode(node)) continue;
          const text = node.nodeValue!.trim();
          if (!text) continue;
          if (index < cursor) {
            index++;
            continue;
          }
          let id = textNodeId(node);
          let original = originals.get(id);
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
          if (!contextTextNode(original.node)) {
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
