(() => {
  // extension/crop-selection.ts
  function selectionRect(start, end, width, height) {
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    const x1 = clamp(start.x, width), x2 = clamp(end.x, width);
    const y1 = clamp(start.y, height), y2 = clamp(end.y, height);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }
  function selectCrop(host, bounds, labels, pixelScale = 1) {
    const doc = host.ownerDocument, view = doc.defaultView;
    const root = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = `:host{position:fixed;inset:0;z-index:2147483647;pointer-events:auto;font:14px system-ui;color:#fff}.surface{position:fixed;inset:0;cursor:crosshair;touch-action:none;background:#0005}.selection{position:fixed;border:2px solid #f4bb62;box-shadow:0 0 0 9999px #0008;cursor:move;box-sizing:border-box}.handle{position:absolute;width:12px;height:12px;padding:0;background:#fffaf0;border:2px solid #a75f40;box-sizing:border-box;transform:translate(-50%,-50%);border-radius:2px}.handle:focus-visible{outline:2px solid #f4bb62;outline-offset:3px}.readout{position:absolute;top:-30px;left:0;background:#201b17;padding:4px 7px;border-radius:5px;white-space:nowrap}.tools{position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:10px 14px;background:#30271deb;border-radius:12px;box-shadow:0 3px 18px #0004;max-width:calc(100vw - 32px);cursor:default}.tools span{max-width:50vw}.tools button{font:600 13px system-ui;border:0;border-radius:7px;padding:8px;background:#f5dfbf;color:#30271d;cursor:pointer}.tools button:disabled{opacity:.5}.tools button:focus-visible{outline:2px solid #f4bb62;outline-offset:3px}`;
    root.append(style);
    const surface = doc.createElement("div");
    surface.className = "surface";
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-label", labels.cropTitle);
    surface.setAttribute("aria-modal", "true");
    const box = doc.createElement("div");
    box.className = "selection";
    box.hidden = true;
    const readout = doc.createElement("output");
    readout.className = "readout";
    readout.setAttribute("aria-live", "polite");
    const previousFocus = doc.activeElement;
    box.append(readout);
    for (const [name, left, top] of [
      ["nw", 0, 0],
      ["n", 50, 0],
      ["ne", 100, 0],
      ["e", 100, 50],
      ["se", 100, 100],
      ["s", 50, 100],
      ["sw", 0, 100],
      ["w", 0, 50]
    ]) {
      const handle = doc.createElement("button");
      handle.type = "button";
      handle.setAttribute("aria-label", `${labels.cropTitle}: ${name}`);
      handle.className = "handle";
      handle.dataset.handle = name;
      handle.style.cssText = `left:${left}%;top:${top}%;cursor:${name}-resize`;
      box.append(handle);
    }
    const tools = doc.createElement("div");
    tools.className = "tools";
    const hint = doc.createElement("span");
    hint.textContent = labels.cropHint;
    const confirm = doc.createElement("button");
    confirm.textContent = labels.cropConfirm;
    confirm.disabled = true;
    const cancel = doc.createElement("button");
    cancel.textContent = labels.cropCancel;
    tools.append(hint, confirm, cancel);
    surface.append(box, tools);
    root.append(surface);
    let rect = null;
    let drag = null;
    const point = (event) => {
      const r = bounds();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const render = () => {
      if (!rect) return;
      const r = bounds();
      box.hidden = false;
      surface.style.background = "transparent";
      box.style.left = `${r.left + rect.x}px`;
      box.style.top = `${r.top + rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      readout.textContent = `${Math.round(rect.width * pixelScale)} \xD7 ${Math.round(rect.height * pixelScale)} px`;
      confirm.disabled = rect.width < 2 || rect.height < 2;
    };
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        view.removeEventListener("keydown", key, true);
        view.removeEventListener("resize", resize);
        view.removeEventListener("pagehide", cancelCrop);
        doc.removeEventListener("fullscreenchange", fullscreenChanged);
        host.remove();
        previousFocus?.focus();
        resolve(value);
      };
      const cancelCrop = () => finish(null);
      const initiallyFullscreen = Boolean(doc.fullscreenElement);
      const fullscreenChanged = () => {
        if (initiallyFullscreen && !doc.fullscreenElement) finish(null);
      };
      doc.addEventListener("fullscreenchange", fullscreenChanged);
      const key = (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const buttons = [
            ...root.querySelectorAll("button:not(:disabled)")
          ].filter((button) => !button.closest("[hidden]"));
          const index = buttons.indexOf(root.activeElement);
          buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
        }
        if (event.key === "Enter" && rect && !confirm.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(rect);
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          const r = bounds(), step = event.shiftKey ? 10 : 1;
          if (!rect)
            rect = {
              x: Math.round(r.width / 4),
              y: Math.round(r.height / 4),
              width: Math.round(r.width / 2),
              height: Math.round(r.height / 2)
            };
          if (event.ctrlKey || event.metaKey) {
            rect.width = Math.max(
              2,
              Math.min(
                r.width - rect.x,
                rect.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0)
              )
            );
            rect.height = Math.max(
              2,
              Math.min(
                r.height - rect.y,
                rect.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)
              )
            );
            render();
            return;
          }
          rect = {
            ...rect,
            x: Math.max(
              0,
              Math.min(
                r.width - rect.width,
                rect.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0)
              )
            ),
            y: Math.max(
              0,
              Math.min(
                r.height - rect.height,
                rect.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
              )
            )
          };
          render();
        }
      };
      const resize = () => {
        if (rect) {
          const r = bounds();
          rect = selectionRect(
            { x: rect.x, y: rect.y },
            { x: rect.x + rect.width, y: rect.y + rect.height },
            r.width,
            r.height
          );
          render();
        }
      };
      surface.onpointerdown = (event) => {
        if (event.target.closest(".tools")) return;
        event.preventDefault();
        surface.setPointerCapture(event.pointerId);
        const target = event.target;
        drag = {
          start: point(event),
          origin: rect ? { ...rect } : null,
          handle: target.dataset.handle || (target === box || target === readout ? "move" : "new")
        };
        if (drag.handle === "new") {
          rect = { ...drag.start, width: 0, height: 0 };
          render();
        }
      };
      surface.onpointermove = (event) => {
        if (!drag) return;
        const p = point(event), r = bounds(), o = drag.origin;
        if (drag.handle === "move" && o)
          rect = {
            ...o,
            x: Math.max(0, Math.min(r.width - o.width, o.x + p.x - drag.start.x)),
            y: Math.max(
              0,
              Math.min(r.height - o.height, o.y + p.y - drag.start.y)
            )
          };
        else if (drag.handle === "new" || !o)
          rect = selectionRect(drag.start, p, r.width, r.height);
        else {
          const h = drag.handle;
          rect = selectionRect(
            { x: h.includes("w") ? p.x : o.x, y: h.includes("n") ? p.y : o.y },
            {
              x: h.includes("e") ? p.x : o.x + o.width,
              y: h.includes("s") ? p.y : o.y + o.height
            },
            r.width,
            r.height
          );
        }
        render();
      };
      surface.onpointerup = () => {
        drag = null;
        if (rect && !confirm.disabled) confirm.focus({ preventScroll: true });
      };
      surface.onpointercancel = () => {
        drag = null;
      };
      confirm.onclick = () => {
        if (rect && !confirm.disabled) finish(rect);
      };
      cancel.onclick = cancelCrop;
      view.addEventListener("keydown", key, true);
      cancel.focus();
      view.addEventListener("resize", resize);
      view.addEventListener("pagehide", cancelCrop, { once: true });
      cancel.focus({ preventScroll: true });
    });
  }

  // extension/shift-crop.ts
  function listenForShiftCrop(view, allowed, start) {
    let timer;
    const clear = () => {
      view.clearTimeout(timer);
      timer = void 0;
    };
    const down = (event) => {
      if (event.key !== "Shift") {
        clear();
        return;
      }
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || target?.closest?.(
        "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"
      ) || !allowed())
        return;
      clear();
      timer = view.setTimeout(() => {
        timer = void 0;
        if (allowed()) start();
      }, 200);
    };
    const up = (event) => {
      if (event.key === "Shift") clear();
    };
    view.addEventListener("keydown", down);
    view.addEventListener("keyup", up);
    view.addEventListener("blur", clear);
    view.addEventListener("pointerdown", clear);
    return () => {
      clear();
      view.removeEventListener("keydown", down);
      view.removeEventListener("keyup", up);
      view.removeEventListener("blur", clear);
      view.removeEventListener("pointerdown", clear);
    };
  }

  // extension/privacy.ts
  function hasSensitiveContent(doc = document) {
    const roots = [doc];
    const seen = /* @__PURE__ */ new Set();
    let remaining = 5e4;
    while (roots.length) {
      const root = roots.pop();
      if (seen.has(root)) continue;
      seen.add(root);
      const owner = root.nodeType === 9 ? root : root.ownerDocument;
      if (!owner) return true;
      const walker = owner.createTreeWalker(root, 1);
      let node;
      while (node = walker.nextNode()) {
        if (--remaining < 0) return true;
        const element = node;
        if (element.matches(
          'input[type="password" i],input[autocomplete~="current-password" i],input[autocomplete~="new-password" i]'
        ))
          return true;
        if (element.shadowRoot) roots.push(element.shadowRoot);
        if (["iframe", "frame", "object", "embed"].includes(element.localName)) {
          try {
            const frame = element;
            const nested = frame.contentDocument ?? frame.getSVGDocument?.();
            if (!nested || nested.readyState !== "complete") return true;
            const source = frame.getAttribute("src")?.trim().toLowerCase();
            if (nested.URL === "about:blank" && (frame.hasAttribute("srcdoc") || source && source !== "about:blank"))
              return true;
            roots.push(nested);
          } catch {
            return true;
          }
        }
      }
    }
    return false;
  }

  // extension/page-context.ts
  var privateSelector = [
    "input[type=password]",
    "[contenteditable=true]",
    "[data-private]",
    "[data-sensitive]",
    "[autocomplete=cc-number]",
    "[autocomplete=cc-csc]"
  ].join(",");
  var ignoredTags = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "SVG",
    "CANVAS"
  ]);
  var scope = globalThis;
  var registry = scope.glimpseletElementRegistry ??= {
    ids: /* @__PURE__ */ new WeakMap(),
    nextId: 1
  };
  function stableElementId(element) {
    let id = registry.ids.get(element);
    if (!id) {
      id = `g${registry.nextId++}`;
      registry.ids.set(element, id);
    }
    return id;
  }
  function textForElement(element, limit = 240) {
    if (isExcluded(element) || isChoiceContent(element) || hasSensitiveAncestor(element))
      return "";
    if (isFormControl(element) || element.getAttribute("role")?.toLowerCase() === "combobox")
      return fieldLabel(element, limit);
    const walker = element.ownerDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT
    );
    const pieces = [];
    let node;
    while (node = walker.nextNode()) {
      if (contextTextNode(node)) pieces.push(node.nodeValue || "");
      if (pieces.join(" ").length >= limit) break;
    }
    const text = (element.getAttribute("aria-label") || element.getAttribute("title") || pieces.join(" ")).replace(/\s+/g, " ").trim();
    return text.slice(0, limit);
  }
  function isExcluded(element, includeHidden = false) {
    for (let current = element; current; current = composedParent(current)) {
      if (current.matches(
        "[data-glimpselet-overlay], [data-private], [data-sensitive]"
      ) || ignoredTags.has(current.tagName.toUpperCase()))
        return true;
      const editable = current.getAttribute("contenteditable");
      if (editable !== null && editable.toLowerCase() !== "false") return true;
    }
    if (element.tagName === "OPTION" || element.tagName === "OPTGROUP" || element.getAttribute("role")?.toLowerCase() === "option")
      return true;
    if (element instanceof HTMLInputElement && /^(password|hidden|file)$/i.test(element.type))
      return true;
    return !includeHidden && (element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden")) || element.getAttribute("type") === "password";
  }
  function visible(element) {
    for (let current = element; current; current = composedParent(current)) {
      const style = current.ownerDocument.defaultView?.getComputedStyle(current);
      if (!style || style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true")
        return false;
    }
    return true;
  }
  function buildPageContext(doc = document) {
    const hasPassword = hasSensitiveContent(doc);
    const scope2 = doc.querySelector("[data-glimpselet-reader-page]") || doc.body || doc.documentElement;
    const elements = [];
    const selector = "a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=option],h1,h2,h3,h4,h5,h6";
    for (const element of Array.from(
      scope2.querySelectorAll(
        selector + (scope2.hasAttribute("data-glimpselet-reader-page") ? ",.pdf-text-layer>span" : "")
      )
    )) {
      if (elements.length >= 120) break;
      if (isExcluded(element) || isChoiceContent(element) || hasSensitiveAncestor(element) || !visible(element))
        continue;
      const text = textForElement(element);
      if (!text && !/^input$/i.test(element.tagName)) continue;
      const rect = element.getBoundingClientRect();
      elements.push({
        id: stableElementId(element),
        role: element.matches(".pdf-text-layer>span") ? "paragraph" : element.getAttribute("role") || element.tagName.toLowerCase(),
        text,
        rect: [
          Math.round(rect.left + doc.defaultView.scrollX),
          Math.round(rect.top + doc.defaultView.scrollY),
          Math.round(rect.width),
          Math.round(rect.height)
        ]
      });
    }
    const chunks = [];
    let length = 0;
    const walker = doc.createTreeWalker(scope2, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && length < 24e3) {
      if (!contextTextNode(node)) continue;
      const value = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!value) continue;
      const piece = value.slice(0, 24e3 - length);
      chunks.push(piece);
      length += piece.length + 1;
    }
    return {
      url: doc.location.href,
      title: doc.title.slice(0, 500),
      text: chunks.join(" ").slice(0, 24e3),
      elements,
      hasPassword
    };
  }
  function contextTextNode(node) {
    const parent = composedTextParent(node);
    return !!(parent && node.nodeValue?.trim() && restorableTextNode(node) && visible(parent));
  }
  function contextRangeText(range) {
    const root = range.commonAncestorContainer;
    if (!root.isConnected) return "";
    const text = range.toString().trim();
    if (!text || text.length > 5e3) return "";
    const safe = (node2) => {
      if (!range.intersectsNode(node2)) return true;
      const start = node2 === range.startContainer ? range.startOffset : 0;
      const end = node2 === range.endContainer ? range.endOffset : node2.nodeValue.length;
      return !node2.nodeValue.slice(start, end).trim() || contextTextNode(node2);
    };
    if (root.nodeType === Node.TEXT_NODE) return safe(root) ? text : "";
    const doc = root.nodeType === Node.DOCUMENT_NODE ? root : root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) if (!safe(node)) return "";
    return text;
  }
  function restorableTextNode(node) {
    const parent = composedTextParent(node);
    return !!(parent && !hasSensitiveAncestor(parent) && !isExcluded(parent, true) && !isChoiceContent(parent) && !isFormControl(parent) && parent.getAttribute("role")?.toLowerCase() !== "combobox");
  }
  function isFormControl(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
  }
  function isChoiceContent(element) {
    for (let current = element; current; current = composedParent(current)) {
      if (current.matches('option, optgroup, [role="option"]') || current !== element && current.matches("select, textarea") || current !== element && current.getAttribute("role")?.toLowerCase() === "combobox")
        return true;
    }
    return false;
  }
  function fieldLabel(element, limit) {
    const explicit = element.getAttribute("aria-label") || element.getAttribute("title");
    if (explicit) return explicit.replace(/\s+/g, " ").trim().slice(0, limit);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const labels = Array.from(element.labels || []).map((label) => textForLabel(label)).filter(Boolean);
      if (labels.length) return labels.join(" ").slice(0, limit);
    }
    return "";
  }
  function textForLabel(label) {
    const walker = label.ownerDocument.createTreeWalker(
      label,
      NodeFilter.SHOW_TEXT
    );
    const pieces = [];
    let node;
    while (node = walker.nextNode()) {
      if (contextTextNode(node)) pieces.push(node.nodeValue || "");
    }
    return pieces.join(" ").replace(/\s+/g, " ").trim();
  }
  function hasSensitiveAncestor(element) {
    for (let current = element; current; current = composedParent(current)) {
      if (current.matches(privateSelector)) return true;
      const label = current.getAttribute("aria-label")?.toLowerCase() || "";
      if (label.includes("password") || label.includes("credit card"))
        return true;
    }
    return false;
  }
  function composedParent(element) {
    return element.assignedSlot || element.parentElement || element.getRootNode().host || null;
  }
  function composedTextParent(node) {
    return node.assignedSlot || node.parentElement || node.getRootNode().host || null;
  }

  // extension/page-revision.ts
  function pageRevision(context) {
    const elements = context.elements.slice(0, 120).map((element) => [
      normalize(element.role, 64),
      normalize(element.text, 240)
    ]);
    const source = JSON.stringify([
      normalize(context.url, 2048),
      normalize(context.title, 500),
      normalize(context.text, 24e3),
      context.hasPassword,
      elements
    ]);
    let first = 2166136261;
    let second = 2654435769;
    for (let i = 0; i < source.length; i++) {
      const code = source.charCodeAt(i);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 2246822507);
    }
    return `v1-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
  }
  function normalize(value, limit) {
    return value.replace(/\s+/g, " ").trim().slice(0, limit);
  }

  // extension/page-tools.ts
  function validateGuideSteps(value, knownElementIds) {
    if (!value || typeof value !== "object" || !Array.isArray(value.steps))
      return [];
    const seen = /* @__PURE__ */ new Set();
    const steps = [];
    for (const item of value.steps.slice(0, 12)) {
      if (!item || typeof item !== "object") continue;
      const step = item;
      if (typeof step.elementId !== "string" || !knownElementIds.has(step.elementId) || seen.has(step.elementId))
        continue;
      if (typeof step.note !== "string" || !step.note.trim()) continue;
      seen.add(step.elementId);
      steps.push({
        elementId: step.elementId,
        note: step.note.trim().slice(0, 360),
        ...typeof step.action === "string" ? { action: step.action.trim().slice(0, 120) } : {}
      });
    }
    return steps;
  }

  // extension/content.ts
  var contentScope = globalThis;
  if (!contentScope.glimpseletContentReady) {
    let ensureOverlay = function() {
      if (overlayRoot) return overlayRoot;
      overlayHost = document.createElement("div");
      overlayHost.dataset.glimpseletOverlay = "true";
      overlayHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
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
    }, guidePoint = function(elementId) {
      const element = Array.from(
        document.querySelectorAll(
          "a,button,input,select,textarea,[role],h1,h2,h3,h4,h5,h6,.pdf-text-layer>span"
        )
      ).find((candidate) => stableElementId(candidate) === elementId);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, element };
    }, renderGuide = function() {
      if (!currentGuide) return;
      const root = ensureOverlay();
      root.querySelector(".guide")?.remove();
      root.querySelector("svg.draw")?.remove();
      const step = currentGuide.steps[currentGuide.index];
      let point = guidePoint(step.elementId);
      if (!point) return;
      const changed = renderedStep !== step.elementId;
      if (changed && (point.y < 0 || point.y + point.height > innerHeight || point.x < 0 || point.x > innerWidth)) {
        point.element.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant"
        });
        point = guidePoint(step.elementId);
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
        [25, 11, 8, 9]
      ]) {
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
      head.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:5px;font:700 11px system-ui;color:#86513d";
      head.append(blink, document.createTextNode(currentGuide.labels.title));
      callout.append(head);
      const note = document.createElement("p");
      note.textContent = step.note + (step.action ? ` \xB7 ${step.action}` : "");
      callout.append(note);
      const nav = document.createElement("nav");
      const back = document.createElement("button");
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
      next.textContent = currentGuide.index === currentGuide.steps.length - 1 ? currentGuide.labels.close : currentGuide.labels.next;
      next.onclick = () => {
        if (!currentGuide) return;
        if (currentGuide.index + 1 >= currentGuide.steps.length) closeGuide();
        else {
          currentGuide.index++;
          renderGuide();
        }
      };
      nav.append(back, counter, next);
      callout.append(nav);
      const top = point.y > 115 ? point.y - 110 : Math.min(innerHeight - 90, point.y + point.height + 18);
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
        `M${startX} ${startY} Q${(startX + endX) / 2 + 22} ${(startY + endY) / 2} ${endX} ${endY} m-7 -4 l7 4 l-7 4`
      );
      svg.append(arrow);
      root.append(svg, callout);
      if (!changed)
        for (const ink of svg.querySelectorAll(".ink,.arrow")) {
          ink.style.animation = "none";
          ink.style.strokeDashoffset = "0";
        }
      if (changed) next.focus({ preventScroll: true });
    }, closeGuide = function() {
      currentGuide = void 0;
      renderedStep = "";
      overlayRoot?.querySelector(".guide")?.remove();
      overlayRoot?.querySelector("svg.draw")?.remove();
    }, closeSelectionPopover = function() {
      selectionPopover?.remove();
      selectionPopover = void 0;
    }, showSelectionPopover = function() {
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
        ["ask", labels.ask]
      ]) {
        const button = document.createElement("button");
        button.textContent = label;
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => {
          closeSelectionPopover();
          const current = getSelection();
          if (current?.rangeCount !== 1) return;
          const currentRange = current.getRangeAt(0);
          if (currentRange.startContainer !== range.startContainer || currentRange.startOffset !== range.startOffset || currentRange.endContainer !== range.endContainer || currentRange.endOffset !== range.endOffset)
            return;
          if (contextRangeText(range) !== text) return;
          send({
            type: "glimpselet:selection",
            text,
            url: location.href,
            action
          });
        };
        pop.append(button);
      }
      pop.style.left = `${Math.max(8, Math.min(innerWidth - 250, rect.left))}px`;
      pop.style.top = `${Math.max(8, rect.top - 45)}px`;
      ensureOverlay().append(pop);
    }, onSelectionChange = function() {
      closeSelectionPopover();
      window.setTimeout(showSelectionPopover, 40);
    }, updateGuidePosition = function() {
      if (!guideFrame && currentGuide)
        guideFrame = requestAnimationFrame(() => {
          guideFrame = 0;
          renderGuide();
        });
    }, reportPageChange = function(checkContent = false) {
      const url = location.href;
      if (url === lastUrl && !checkContent) return;
      const context = buildPageContext();
      lastSensitive = context.hasPassword;
      const revision = pageRevision(context);
      if (url !== lastUrl || checkContent && revision !== lastRevision) {
        lastUrl = url;
        lastRevision = revision;
        send({ type: "glimpselet:page-changed", url, revision });
      }
    }, relevantMutation = function(record) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target) return false;
      if (record.type === "attributes" && [
        "type",
        "data-private",
        "data-sensitive",
        "contenteditable",
        "aria-hidden",
        "hidden"
      ].includes(record.attributeName ?? ""))
        return true;
      if (target.closest(
        "[data-glimpselet-overlay], [data-glimpselet-crop], [data-private], [data-sensitive], [contenteditable]:not([contenteditable=false])"
      ))
        return false;
      if (target instanceof HTMLInputElement && /^(password|hidden|file)$/i.test(target.type))
        return false;
      if (record.type === "characterData")
        return target.tagName === "TITLE" || contextTextNode(record.target);
      return true;
    }, initObserver = function() {
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
          "autocomplete"
        ]
      });
      window.setInterval(() => {
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
        () => {
          void select("region", cropLabels.cropCancel).then((result) => {
            const value = result;
            if (value.rect)
              void send({
                type: "glimpselet:crop-selected",
                rect: value.rect,
                url: location.href
              });
          });
        }
      );
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeGuide();
          closeSelectionPopover();
        }
      });
    }, select = function(mode, cancelLabel) {
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
          devicePixelRatio
        ).then(
          (rect) => rect ? { rect: [rect.x, rect.y, rect.width, rect.height] } : { cancelled: true }
        ).finally(() => {
          selecting = false;
          selectionMode = void 0;
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
        const key = (event) => {
          if (event.key === "Escape") cancel();
        };
        const finish = (rect) => finishSelection({ rect });
        const click = (event) => {
          if (selectionMode === "element") {
            event.preventDefault();
            event.stopPropagation();
            shade.style.pointerEvents = "none";
            const target = document.elementFromPoint(
              event.clientX,
              event.clientY
            );
            shade.style.pointerEvents = "auto";
            if (!target || target.closest("[data-glimpselet-overlay]")) return;
            const r = target.getBoundingClientRect();
            finish([
              Math.round(r.left),
              Math.round(r.top),
              Math.round(r.width),
              Math.round(r.height)
            ]);
          }
        };
        shade.addEventListener("click", click);
        window.addEventListener("keydown", key, true);
        const cleanup = () => {
          window.removeEventListener("keydown", key, true);
        };
        shade.cleanup = cleanup;
      });
    }, finishSelection = function(result) {
      const shade = overlayRoot?.querySelector(".shade");
      shade?.cleanup?.();
      shade?.remove();
      overlayRoot?.querySelector(".cancel")?.remove();
      overlayRoot?.querySelector("svg.draw")?.remove();
      selecting = false;
      selectionMode = void 0;
      const resolve = selectionResolve;
      selectionResolve = void 0;
      resolve?.(result);
    }, textNodeId = function(node) {
      let id = nodeIds.get(node);
      if (!id) {
        id = `t${nextTextId++}`;
        nodeIds.set(node, id);
      }
      return id;
    };
    contentScope.glimpseletContentReady = true;
    const originals = /* @__PURE__ */ new Map();
    const nodeIds = /* @__PURE__ */ new WeakMap();
    let nextTextId = 1;
    let labels = {
      explain: "Explain",
      translate: "Translate",
      ask: "Ask"
    };
    let observer;
    let overlayHost;
    let overlayRoot;
    let selectionPopover;
    let currentGuide;
    let lastUrl = location.href;
    let lastRevision = "";
    let lastSensitive = false;
    let pageTimer = 0;
    let selecting = false;
    let cropLabels = {
      cropTitle: "Crop",
      cropHint: "Drag to select. Enter to confirm. Esc to cancel.",
      cropConfirm: "Confirm",
      cropCancel: "Cancel"
    };
    let selectionMode;
    let shiftCropEnabled = true;
    void chrome.storage.local.get(["shiftCropEnabled"]).then((stored) => {
      shiftCropEnabled = stored.shiftCropEnabled !== false;
    });
    chrome.storage.onChanged.addListener(
      (changes, area) => {
        if (area === "local" && changes.shiftCropEnabled)
          shiftCropEnabled = changes.shiftCropEnabled.newValue !== false;
      }
    );
    let selectionResolve;
    let renderedStep = "";
    let guideFrame = 0;
    const send = (message) => chrome.runtime.sendMessage(message).catch(() => void 0);
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== location.origin || location.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(location.hostname) || location.pathname !== "/install")
        return;
      const value = event.data;
      if (!value || value.type !== "glimpselet:pair" || typeof value.code !== "string" || !/^[A-F0-9]{16}$/.test(value.code) || Number(value.port) !== Number(location.port || 80))
        return;
      void send({
        type: "glimpselet:pair",
        port: Number(value.port),
        code: value.code
      });
    });
    window.addEventListener("glimpselet:tutorial-action", (event) => {
      if (location.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(location.hostname) || location.pathname !== "/assets/glimpselet-welcome-sample.html")
        return;
      const value = event.detail;
      if (value?.version !== 1 || ![
        "float",
        "capture",
        "suggest",
        "passive",
        "guide",
        "translate",
        "selection",
        "pdf"
      ].includes(value.action) || !Number.isInteger(value.step) || value.step < 1 || value.step > 8)
        return;
      void send({
        type: "glimpselet:tutorial",
        action: value.action,
        step: value.step
      });
    });
    if (location.protocol === "http:" && ["127.0.0.1", "localhost"].includes(location.hostname) && location.pathname === "/install") {
      window.postMessage({ type: "glimpselet:extension-ready" }, location.origin);
    }
    chrome.runtime.onMessage.addListener(
      (message, _sender, respond) => {
        if (!message || typeof message.type !== "string") return;
        if (message.type === "glimpselet:tutorial-select" && location.pathname === "/assets/glimpselet-welcome-sample.html") {
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
        if (message.type === "glimpselet:tutorial-done" && location.pathname === "/assets/glimpselet-welcome-sample.html" && Number.isInteger(message.step) && Number(message.step) >= 1 && Number(message.step) <= 8) {
          window.opener?.postMessage(
            { type: "glimpselet:tutorial:done", version: 1, step: message.step },
            location.origin
          );
          respond({ ok: true });
          return;
        }
        if (message.type === "glimpselet:sensitive") {
          respond({
            hasPassword: hasSensitiveContent()
          });
          return;
        }
        if (message.type === "glimpselet:context") {
          respond(buildPageContext());
          return;
        }
        if (message.type === "glimpselet:labels" && message.labels && typeof message.labels === "object") {
          const incoming = message.labels;
          for (const key of [
            "cropTitle",
            "cropHint",
            "cropConfirm",
            "cropCancel"
          ]) {
            if (typeof incoming[key] === "string")
              cropLabels[key] = incoming[key];
          }
          labels = {
            explain: incoming.explain || labels.explain,
            translate: incoming.translate || labels.translate,
            ask: incoming.ask || labels.ask
          };
          respond({ ok: true });
          return;
        }
        if (message.type === "glimpselet:select" && (message.mode === "region" || message.mode === "element")) {
          const requestLabels = message.labels;
          if (requestLabels) cropLabels = { ...cropLabels, ...requestLabels };
          void select(message.mode, requestLabels?.cancel || "Cancel").then(
            respond
          );
          return true;
        }
        if (message.type === "glimpselet:guide" && Array.isArray(message.steps)) {
          const pageMap = buildPageContext();
          const incoming = validateGuideSteps(
            { steps: message.steps },
            new Set(pageMap.elements.map((item) => item.id))
          );
          const valid = incoming.filter((step) => guidePoint(step.elementId));
          if (valid.length) {
            const guideLabels = message.labels || {};
            currentGuide = {
              steps: valid,
              index: 0,
              labels: {
                next: guideLabels.next || "Next",
                back: guideLabels.back || "Back",
                close: guideLabels.close || "Close",
                title: guideLabels.title || "Glimpselet"
              }
            };
            renderedStep = "";
            renderGuide();
            respond({ ok: true });
          } else respond({ ok: false });
          return;
        }
        if (message.type === "glimpselet:text-nodes") {
          const nodes = [];
          const cursor = Math.max(0, Math.floor(Number(message.cursor) || 0));
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
          );
          let node;
          let size = 0;
          let index = 0;
          let hasMore = false;
          while (node = walker.nextNode()) {
            if (!(node instanceof Text) || !contextTextNode(node)) continue;
            const text = node.nodeValue.trim();
            if (!text) continue;
            if (index < cursor) {
              index++;
              continue;
            }
            let id = textNodeId(node);
            let original = originals.get(id);
            if (original && node.nodeValue !== (original.lastWritten ?? original.text)) {
              originals.delete(id);
              nodeIds.delete(node);
              id = textNodeId(node);
              original = void 0;
            }
            const sourceText = original?.text ?? node.nodeValue;
            if (sourceText.length > 12e3) {
              respond({ error: "translation_incomplete" });
              return;
            }
            if (nodes.length >= 160 || size + sourceText.length > 24e3) {
              hasMore = true;
              break;
            }
            if (!original) originals.set(id, { node, text: sourceText });
            nodes.push({ id, text: sourceText });
            size += sourceText.length;
            index++;
          }
          respond({ nodes, ...hasMore ? { nextCursor: index } : {} });
          return;
        }
        if (message.type === "glimpselet:translate" && Array.isArray(message.nodes)) {
          let applied = 0;
          for (const entry of message.nodes.slice(0, 160)) {
            if (!entry || typeof entry.id !== "string" || typeof entry.text !== "string")
              continue;
            const original = originals.get(entry.id);
            if (!original || !original.node.isConnected || !contextTextNode(original.node))
              continue;
            if (entry.text.length > 12e3) continue;
            if (original.node.nodeValue !== (original.lastWritten ?? original.text)) {
              originals.delete(entry.id);
              nodeIds.delete(original.node);
              continue;
            }
            original.node.nodeValue = entry.text;
            original.lastWritten = entry.text;
            original.node.parentElement?.setAttribute(
              "data-glimpselet-translated",
              "true"
            );
            applied++;
          }
          respond({ applied });
          return;
        }
        if (message.type === "glimpselet:restore") {
          let restored = 0;
          for (const [id, entry] of originals) {
            if (entry.node.isConnected && restorableTextNode(entry.node) && entry.lastWritten !== void 0 && entry.node.nodeValue === entry.lastWritten) {
              entry.node.nodeValue = entry.text;
              entry.node.parentElement?.removeAttribute(
                "data-glimpselet-translated"
              );
              restored++;
            }
            originals.delete(id);
            nodeIds.delete(entry.node);
          }
          respond({ restored });
          return;
        }
      }
    );
    initObserver();
  }
})();
