// extension/full-page-layout.ts
function fullPageLayout(mode, id) {
  const target = window;
  const restore = () => {
    for (const { element, style } of target.__blinklingFullPage?.saved || []) {
      if (style === null) {
        element.setAttribute("style", "");
        element.removeAttribute("style");
      } else element.setAttribute("style", style);
    }
    delete target.__blinklingFullPage;
  };
  if (mode === "end") {
    if (target.__blinklingFullPage?.id === id) restore();
    return;
  }
  if (mode === "begin") {
    if (target.__blinklingFullPage && target.__blinklingFullPage.id !== id)
      throw new Error("capture_busy");
    if (target.__blinklingFullPage) return;
    const saved = [];
    for (const element of document.querySelectorAll("*")) {
      const position = getComputedStyle(element).position;
      if (position !== "fixed" && position !== "sticky") continue;
      saved.push({
        element,
        style: element.getAttribute("style"),
        fixed: position === "fixed"
      });
      if (position === "sticky") {
        element.style.setProperty("position", "relative", "important");
        for (const side of ["top", "right", "bottom", "left"])
          element.style.setProperty(side, "auto", "important");
      }
    }
    target.__blinklingFullPage = { id, saved };
  } else if (target.__blinklingFullPage?.id === id) {
    for (const { element, fixed } of target.__blinklingFullPage.saved)
      if (fixed) element.style.setProperty("visibility", "hidden", "important");
  }
}

// extension/full-page-tiles.ts
var TILE_EDGE = 4096;
var TILE_MIN_HEIGHT = 1568;
var MAX_TILES = 8;
function planTiles(width, height, devicePixelRatio2 = 1) {
  const scale = Math.min(
    Math.max(1, Math.min(2, devicePixelRatio2 || 1)),
    TILE_EDGE / width
  );
  const wanted = Math.ceil(height * scale / MAX_TILES);
  const tileHeight = Math.max(
    1,
    Math.floor(Math.min(TILE_EDGE, Math.max(TILE_MIN_HEIGHT, wanted)) / scale)
  );
  const count = Math.min(MAX_TILES, Math.ceil(height / tileHeight));
  const capturedHeight = Math.min(height, count * tileHeight);
  return {
    scale,
    tileHeight,
    count,
    capturedHeight,
    truncated: capturedHeight < height
  };
}

// extension/png.ts
var MAX_PNG_LENGTH = 5e6;
var MAX_EDGE = 8e3;
var MAX_PIXELS = 4e7;
async function dataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:image/png;base64,${btoa(binary)}`;
}
async function encodeCanvasPng(source) {
  if (!source.width || !source.height || source.width * source.height > 9e7)
    throw new Error("image_limit");
  let canvas = source;
  let scale = 1;
  while (true) {
    const image = await dataUrl(canvas);
    if (image.length <= MAX_PNG_LENGTH && canvas.width <= MAX_EDGE && canvas.height <= MAX_EDGE && canvas.width * canvas.height <= MAX_PIXELS)
      return image;
    if (canvas.width === 1 && canvas.height === 1)
      throw new Error("image_limit");
    scale *= 0.8;
    const width = Math.max(1, Math.floor(source.width * scale));
    const height = Math.max(1, Math.floor(source.height * scale));
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_decode");
    context.drawImage(source, 0, 0, width, height);
  }
}

// extension/privacy.ts
function hasSensitiveContent(doc = document, mode = false, explain = false) {
  doc ??= document;
  const blocked = (reason) => explain ? reason : true;
  const manualTextOnly = mode === true;
  const contributesNoPixels = (element) => {
    try {
      const owner = element.ownerDocument;
      const view = owner.defaultView;
      if (!view) return false;
      const ownStyle = view.getComputedStyle(element);
      if (element.localName !== "object" && ["hidden", "collapse"].includes(ownStyle.visibility))
        return true;
      const ancestors = /* @__PURE__ */ new Set();
      let expandedPaint = false;
      let current = element;
      while (current) {
        if (ancestors.has(current)) return false;
        ancestors.add(current);
        const style = current.ownerDocument.defaultView?.getComputedStyle(current);
        if (!style) return false;
        if (style.display === "none" || style.opacity === "0") return true;
        if (style.filter && style.filter !== "none") expandedPaint = true;
        const root = current.getRootNode();
        current = current.assignedSlot || current.parentElement || (root.nodeType === 11 ? root.host : null) || current.ownerDocument.defaultView?.frameElement || null;
      }
      if (element.localName === "object" || expandedPaint) return false;
      const rects = Array.from(element.getClientRects());
      if (!rects.length || view.innerWidth <= 0 || view.innerHeight <= 0)
        return false;
      return rects.every(
        (rect) => [
          rect.left,
          rect.top,
          rect.right,
          rect.bottom,
          rect.width,
          rect.height
        ].every(Number.isFinite) && (rect.width === 0 || rect.height === 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.innerWidth || rect.top >= view.innerHeight)
      );
    } catch {
      return false;
    }
  };
  const roots = [doc];
  const seen = /* @__PURE__ */ new Set();
  let remaining = 5e4;
  let uninspectable = false;
  while (roots.length) {
    const root = roots.pop();
    if (seen.has(root)) continue;
    seen.add(root);
    const owner = root.nodeType === 9 ? root : root.ownerDocument;
    if (!owner) {
      if (!explain) return true;
      uninspectable = true;
      continue;
    }
    const walker = owner.createTreeWalker(root, 1);
    let node;
    while (node = walker.nextNode()) {
      if (--remaining < 0) return blocked("inspection-limit");
      const element = node;
      if (element.matches(
        'input[type="password" i],input[autocomplete~="current-password" i],input[autocomplete~="new-password" i]'
      ))
        return blocked("password");
      if (element.shadowRoot) roots.push(element.shadowRoot);
      if (["iframe", "frame", "object", "embed"].includes(element.localName)) {
        const excludedPixels = () => mode === "visible-capture" && contributesNoPixels(element);
        try {
          const frame = element;
          const nested = frame.contentDocument ?? frame.getSVGDocument?.();
          if (!nested) {
            if (manualTextOnly || excludedPixels()) continue;
            if (!explain) return true;
            uninspectable = true;
            continue;
          }
          if (nested.readyState !== "complete" && !manualTextOnly && !excludedPixels()) {
            if (!explain) return true;
            uninspectable = true;
          }
          const source = frame.getAttribute("src")?.trim().toLowerCase();
          if (nested.URL === "about:blank" && (frame.hasAttribute("srcdoc") || source && source !== "about:blank")) {
            if (!manualTextOnly && !excludedPixels()) {
              if (!explain) return true;
              uninspectable = true;
            }
          }
          roots.push(nested);
        } catch {
          if (manualTextOnly || excludedPixels()) continue;
          if (!explain) return true;
          uninspectable = true;
        }
      }
    }
  }
  return uninspectable ? blocked("uninspectable") : explain ? void 0 : false;
}

// extension/full-page.ts
var SCREENSHOT_GAP_MS = 550;
var SETTLE_MS = 80;
var lastScreenshot = -Infinity;
var aborted = () => new Error("capture_cancelled");
var check = (signal) => {
  if (signal?.aborted) throw aborted();
};
function wait(ms, signal) {
  check(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
async function bitmap(source) {
  const response = await fetch(source);
  return createImageBitmap(await response.blob());
}
var TileStrips = class {
  constructor(width, plan) {
    this.width = width;
    this.plan = plan;
  }
  canvases = /* @__PURE__ */ new Map();
  encoded = [];
  next = 0;
  stripHeight(index) {
    return Math.min(
      this.plan.tileHeight,
      this.plan.capturedHeight - index * this.plan.tileHeight
    );
  }
  context(index) {
    let canvas = this.canvases.get(index);
    if (!canvas) {
      canvas = new OffscreenCanvas(
        Math.max(1, Math.round(this.width * this.plan.scale)),
        Math.max(1, Math.round(this.stripHeight(index) * this.plan.scale))
      );
      this.canvases.set(index, canvas);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("capture_failed");
    return ctx;
  }
  async draw(source, frame) {
    const img = await bitmap(source).catch(() => {
      throw new Error("capture_failed");
    });
    try {
      const { scale, tileHeight, capturedHeight } = this.plan;
      const visibleWidth = Math.min(frame.viewportWidth, this.width - frame.x) - frame.skipLeft;
      const top = frame.y + frame.skipTop;
      const bottom = Math.min(frame.y + frame.viewportHeight, capturedHeight);
      for (let index = Math.floor(top / tileHeight); index * tileHeight < bottom && index < this.plan.count; index++) {
        const from = Math.max(top, index * tileHeight);
        const to = Math.min(bottom, (index + 1) * tileHeight);
        if (to <= from) continue;
        this.context(index).drawImage(
          img,
          img.width * frame.skipLeft / frame.frameWidth,
          img.height * (from - frame.y) / frame.frameHeight,
          img.width * visibleWidth / frame.frameWidth,
          img.height * (to - from) / frame.frameHeight,
          (frame.x + frame.skipLeft) * scale,
          (from - index * tileHeight) * scale,
          visibleWidth * scale,
          (to - from) * scale
        );
      }
    } finally {
      img.close();
    }
  }
  /** Everything above `row` (CSS pixels) is final. */
  async finish(row) {
    while (this.next < this.plan.count && (this.next + 1) * this.plan.tileHeight <= row)
      await this.encodeNext();
    if (row >= this.plan.capturedHeight) await this.flush();
  }
  async encodeNext() {
    const canvas = this.canvases.get(this.next);
    if (!canvas) throw new Error("capture_failed");
    this.encoded.push(await encodeCanvasPng(canvas));
    this.canvases.delete(this.next++);
  }
  async flush() {
    while (this.next < this.plan.count) await this.encodeNext();
  }
  async pieces() {
    await this.flush();
    return this.encoded;
  }
};
async function stillThere(tab) {
  const now = await chrome.tabs.get(tab.id).catch(() => void 0);
  if (!now?.active || now.url !== tab.url) throw new Error("tab_changed");
}
async function sensitive(tab) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: hasSensitiveContent,
    args: [null, false]
  }).catch(() => []);
  return result?.result !== false;
}
async function screenshot(tab, signal) {
  const gap = lastScreenshot + SCREENSHOT_GAP_MS - Date.now();
  if (gap > 0) await wait(gap, signal);
  await stillThere(tab);
  lastScreenshot = Date.now();
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch {
    throw new Error("capture_failed");
  }
}
async function captureFullPage(tab, options = {}) {
  const { signal } = options;
  check(signal);
  await stillThere(tab);
  if (await sensitive(tab)) throw new Error("password_page");
  const original = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      x: scrollX,
      y: scrollY,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      frameWidth: innerWidth,
      frameHeight: innerHeight,
      devicePixelRatio,
      title: document.title
    })
  });
  check(signal);
  const metrics = original[0]?.result;
  if (!metrics) throw new Error("capture_failed");
  if (metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0)
    throw new Error("capture_failed");
  const plan = planTiles(
    metrics.width,
    metrics.height,
    metrics.devicePixelRatio
  );
  if (metrics.width * plan.capturedHeight > 9e7)
    throw new Error("page_too_large");
  const steps = (length, view, total2) => [
    ...new Set(
      Array.from(
        { length: Math.ceil(length / view) },
        (_, i) => Math.min(i * view, Math.max(0, total2 - view))
      )
    )
  ];
  const ys = steps(
    plan.capturedHeight,
    metrics.viewportHeight,
    plan.capturedHeight
  );
  const xs = steps(metrics.width, metrics.viewportWidth, metrics.width);
  const total = xs.length * ys.length;
  const tiles = new TileStrips(metrics.width, plan);
  let completed = 0;
  const layoutId = crypto.randomUUID();
  const documentId = original[0]?.documentId;
  const layout = (mode) => chrome.scripting.executeScript({
    target: {
      tabId: tab.id,
      ...documentId ? { documentIds: [documentId] } : {}
    },
    func: fullPageLayout,
    args: [mode, layoutId]
  });
  options.onProgress?.({ completed, total });
  try {
    for (const [row, y] of ys.entries())
      for (const [column, x] of xs.entries()) {
        check(signal);
        await stillThere(tab);
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (px, py) => window.scrollTo({ left: px, top: py, behavior: "instant" }),
          args: [x, y]
        });
        check(signal);
        await layout(completed === 0 ? "begin" : "next");
        await wait(SETTLE_MS, signal);
        if (await sensitive(tab)) throw new Error("password_page");
        const image = await screenshot(tab, signal);
        check(signal);
        await stillThere(tab);
        if (await sensitive(tab)) throw new Error("password_page");
        const left = column ? xs[column - 1] + metrics.viewportWidth : 0;
        const top = row ? ys[row - 1] + metrics.viewportHeight : 0;
        await tiles.draw(image, {
          x,
          y,
          viewportWidth: metrics.viewportWidth,
          viewportHeight: metrics.viewportHeight,
          frameWidth: metrics.frameWidth,
          frameHeight: metrics.frameHeight,
          skipLeft: Math.max(0, left - x),
          skipTop: Math.max(0, top - y)
        });
        if (column === xs.length - 1)
          await tiles.finish(
            row === ys.length - 1 ? plan.capturedHeight : y + metrics.viewportHeight
          );
        check(signal);
        completed++;
        options.onProgress?.({ completed, total });
      }
  } finally {
    await layout("end").catch(() => {
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (x, y) => window.scrollTo(x, y),
      args: [metrics.x, metrics.y]
    }).catch(() => {
    });
  }
  check(signal);
  const images = await tiles.pieces();
  await stillThere(tab);
  if (await sensitive(tab)) throw new Error("password_page");
  return {
    images,
    truncated: plan.truncated,
    page: { url: tab.url, title: metrics.title }
  };
}

// extension/reader-url.ts
function parseReaderPdfUrl(value) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password)
      return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function isReaderPdfCandidate(value) {
  const parsed = parseReaderPdfUrl(value);
  return Boolean(
    parsed && (/\.pdf$/i.test(parsed.pathname) || parsed.hostname === "arxiv.org" && /^\/pdf\/[^/]+\/?$/.test(parsed.pathname))
  );
}

// extension/targets.ts
var RESTRICTED = /^(chrome|edge|about|devtools|view-source|chrome-extension|chrome-search|chrome-untrusted|moz-extension):/i;
function readablePage(url) {
  if (!url || RESTRICTED.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (!/^(https?|file|ftp):$/.test(parsed.protocol)) return false;
    if (parsed.hostname === "chromewebstore.google.com" || parsed.hostname === "chrome.google.com" && parsed.pathname.startsWith("/webstore"))
      return false;
    return true;
  } catch {
    return false;
  }
}
var contains = (window2, point2) => window2.state !== "minimized" && window2.left !== void 0 && window2.top !== void 0 && window2.width !== void 0 && window2.height !== void 0 && point2.x >= window2.left && point2.x < window2.left + window2.width && point2.y >= window2.top && point2.y < window2.top + window2.height;
async function targetTab(point2) {
  const windows = (await chrome.windows.getAll({
    populate: true,
    windowTypes: ["normal", "popup"]
  })).filter((w) => w.state !== "minimized");
  let chosen;
  if (point2) {
    const under = windows.filter((w) => contains(w, point2));
    chosen = under.find((w) => w.focused);
    if (!chosen && under.length) {
      const last = await chrome.windows.getLastFocused().then((w) => w.id).catch(() => void 0);
      chosen = under.find((w) => w.id === last) ?? under[0];
    }
  } else {
    const last = await chrome.windows.getLastFocused().catch(() => void 0);
    chosen = windows.find((w) => w.id === last?.id) ?? windows[0];
  }
  const tab = chosen?.tabs?.find((t) => t.active);
  if (!chosen || !tab || tab.id === void 0 || tab.windowId === void 0)
    return void 0;
  return {
    tab: { ...tab, id: tab.id, windowId: tab.windowId, url: tab.url ?? "" },
    window: chosen
  };
}
function viewportFrame(window2, metrics, zoom) {
  const width = window2.width ?? 0;
  const height = window2.height ?? 0;
  const side = Math.max(0, (width - metrics.innerWidth * zoom) / 2);
  const top = Math.max(0, height - metrics.innerHeight * zoom - side);
  return {
    screenX: (window2.left ?? 0) + side,
    screenY: (window2.top ?? 0) + top,
    devicePixelRatio: metrics.devicePixelRatio,
    zoom
  };
}

// extension/translate.ts
var MAX_BATCHES = 80;
function translationPrompt(language, texts) {
  return [
    `Translate each string of the JSON array below into the language with the code "${language}".`,
    "Keep numbers, names, code and markup as they are. Keep leading and trailing spaces.",
    `Answer with one JSON array of exactly ${texts.length} strings in the same order and nothing else.`,
    "",
    JSON.stringify(texts)
  ].join("\n");
}
function parseTranslation(answer, expected) {
  const start = answer.indexOf("[");
  const end = answer.lastIndexOf("]");
  if (start < 0 || end <= start) return void 0;
  try {
    const value = JSON.parse(answer.slice(start, end + 1));
    return Array.isArray(value) && value.length === expected && value.every((item) => typeof item === "string") ? value : void 0;
  } catch {
    return void 0;
  }
}
async function translateTab(deps, signal) {
  let cursor = 0;
  let batches = 0;
  while (cursor !== void 0) {
    if (signal.aborted || batches++ >= MAX_BATCHES) return false;
    const listed = await deps.page({ type: "blinkling:text-nodes", cursor });
    if (!listed || listed.error) return false;
    const nodes = listed.nodes ?? [];
    if (nodes.length) {
      const answer = await deps.ask(
        translationPrompt(
          deps.language,
          nodes.map((node) => node.text)
        ),
        signal
      );
      if (signal.aborted || answer === void 0) return false;
      const translated = parseTranslation(answer, nodes.length);
      if (!translated) return false;
      const applied = await deps.page({
        type: "blinkling:translate",
        nodes: nodes.map((node, index) => ({
          id: node.id,
          text: translated[index]
        }))
      });
      if (!applied || applied.error) return false;
    }
    cursor = typeof listed.nextCursor === "number" ? listed.nextCursor : void 0;
  }
  return true;
}
async function restoreTab(deps) {
  const reply = await deps.page({ type: "blinkling:restore" });
  return Boolean(reply);
}

// extension/handlers.ts
var point = (value) => {
  const raw = value;
  return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? { x: Number(raw.x), y: Number(raw.y) } : void 0;
};
async function injectPageScript(tab) {
  if (!readablePage(tab.url)) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["page.js"]
    });
    return true;
  } catch {
    return false;
  }
}
var askPage = (tab) => (message) => chrome.tabs.sendMessage(tab.id, message).then((reply) => reply).catch(() => void 0);
function createHandlers(helper) {
  const translations = /* @__PURE__ */ new Map();
  async function elements(request) {
    const target = await targetTab(point(request.point));
    if (!target || !await injectPageScript(target.tab))
      return { ok: true, result: null };
    const zoom = await chrome.tabs.getZoom(target.tab.id).catch(() => 1);
    const [measured] = await chrome.scripting.executeScript({
      target: { tabId: target.tab.id },
      func: () => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        contentType: document.contentType
      })
    }).catch(() => []);
    if (!measured?.result || measured.result.contentType === "application/pdf")
      return { ok: true, result: null };
    const frame = viewportFrame(target.window, measured.result, zoom);
    const screen = point(request.point);
    const page = await askPage(target.tab)({
      type: "blinkling:elements",
      near: screen && {
        x: (screen.x - frame.screenX) / zoom,
        y: (screen.y - frame.screenY) / zoom
      }
    });
    if (!page?.elements) return { ok: true, result: null };
    return {
      ok: true,
      result: {
        page: {
          url: page.url ?? target.tab.url,
          title: page.title ?? "",
          tabId: target.tab.id,
          incognito: target.tab.incognito === true
        },
        frame,
        elements: page.elements,
        ...page.selection ? { selection: page.selection } : {}
      }
    };
  }
  async function fullPage(request, context) {
    const target = await targetTab();
    if (!target || !readablePage(target.tab.url))
      return { ok: false, error: "restricted_page" };
    try {
      const result = await captureFullPage(target.tab, {
        signal: context.signal,
        onProgress: (progress) => context.send({
          type: "full-page-progress",
          id: request.id,
          ...progress
        })
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "capture_failed"
      };
    }
  }
  async function translatePage(request, context) {
    const target = await targetTab();
    if (!target) return { ok: false };
    const tab = target.tab;
    translations.get(tab.id)?.abort();
    translations.delete(tab.id);
    if (!await injectPageScript(tab)) return { ok: false };
    const deps = {
      page: askPage(tab),
      language: chrome.i18n.getUILanguage(),
      ask: async (prompt) => {
        const reply = await helper.call(
          { type: "translate-batch", prompt },
          13e4
        );
        return reply?.ok === true && typeof reply.answer === "string" ? reply.answer : void 0;
      }
    };
    if (request.on !== true) return { ok: await restoreTab(deps) };
    const controller = new AbortController();
    translations.set(tab.id, controller);
    context.signal.addEventListener("abort", () => controller.abort(), {
      once: true
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
      index: (target.tab.index ?? 0) + 1
    });
    return { ok: true };
  }
  return {
    translating: (tabId) => translations.has(tabId),
    async handle(request, context) {
      switch (request.type) {
        case "elements":
          return elements(request);
        case "full-page":
          return fullPage(request, context);
        case "translate-page":
          return translatePage(request, context);
        case "open-pdf-reader":
          return openPdfReader();
        default:
          return void 0;
      }
    }
  };
}

// extension/helper-client.ts
var HELPER_FIRST_PORT = 43827;
var HELPER_PORT_COUNT = 10;
var SECRET = /^[0-9a-f]{64}$/;
var PING_MS = 2e4;
var STORAGE_KEY = "helperSecret";
var inHelperRange = (port) => Number.isInteger(port) && port >= HELPER_FIRST_PORT && port < HELPER_FIRST_PORT + HELPER_PORT_COUNT;
var hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function proof(secret, role, first, second) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${role}:${first}:${second}`)
  );
  return hex(new Uint8Array(signed));
}
var equal = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
async function storedSecret() {
  const value = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  return typeof value === "string" && SECRET.test(value) ? value : void 0;
}
async function storeSecret(secret) {
  await chrome.storage.local.set({ [STORAGE_KEY]: secret });
}
var HelperClient = class {
  constructor(handlers2, open = (url) => new WebSocket(url)) {
    this.handlers = handlers2;
    this.open = open;
  }
  socket;
  searching;
  ping;
  retry;
  attempts = 0;
  lastPort;
  running = /* @__PURE__ */ new Map();
  waiting = /* @__PURE__ */ new Map();
  closed = false;
  trustedNow = false;
  onChange;
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN && this.trustedNow;
  }
  /** Looks for the bridge now unless already connected or looking. */
  wake() {
    if (this.connected) return Promise.resolve();
    clearTimeout(this.retry);
    this.searching ??= this.search().finally(() => {
      this.searching = void 0;
    });
    return this.searching;
  }
  /** Forgets the connection and looks again, for a freshly received secret. */
  async reconnect() {
    this.attempts = 0;
    this.socket?.close();
    await this.searching?.catch(() => void 0);
    await this.wake();
  }
  stop() {
    this.closed = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }
  async search() {
    const secret = await storedSecret();
    if (!secret) {
      this.onChange?.();
      return;
    }
    const ports = Array.from(
      { length: HELPER_PORT_COUNT },
      (_, i) => HELPER_FIRST_PORT + i
    );
    if (this.lastPort) ports.sort((a) => a === this.lastPort ? -1 : 0);
    for (const port of ports) {
      if (this.closed) return;
      if (await this.attempt(port, secret)) {
        this.lastPort = port;
        this.attempts = 0;
        return;
      }
    }
    this.scheduleRetry();
  }
  scheduleRetry() {
    if (this.closed) return;
    clearTimeout(this.retry);
    const delay = Math.min(6e4, 2e3 * 2 ** Math.min(this.attempts++, 5));
    this.retry = setTimeout(() => void this.wake(), delay);
  }
  /** Opens one port and completes the mutual proof. Resolves true once trusted. */
  attempt(port, secret) {
    return new Promise((resolve) => {
      let socket;
      try {
        socket = this.open(`ws://127.0.0.1:${port}/extension`);
      } catch {
        resolve(false);
        return;
      }
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) socket.close();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), 4e3);
      let nonce = "";
      let challenge = "";
      socket.onerror = () => done(false);
      socket.onclose = () => {
        if (!settled) done(false);
        else if (this.socket === socket) this.lost();
      };
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!settled) {
          if (message.type === "challenge" && typeof message.nonce === "string" && /^[0-9a-f]{32}$/.test(message.nonce)) {
            challenge = message.nonce;
            nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
            void proof(secret, "client", challenge, nonce).then(
              (p) => socket.send(JSON.stringify({ type: "hello", nonce, proof: p }))
            );
          } else if (message.type === "ready" && nonce) {
            void proof(secret, "server", nonce, challenge).then((expected) => {
              if (typeof message.proof !== "string" || !equal(message.proof, expected))
                return done(false);
              this.socket = socket;
              this.trustedNow = true;
              this.startPing();
              done(true);
              this.onChange?.();
            });
          }
          return;
        }
        void this.receive(socket, message);
      };
    });
  }
  startPing() {
    clearInterval(this.ping);
    this.ping = setInterval(() => this.post({ type: "ping" }), PING_MS);
  }
  lost() {
    clearInterval(this.ping);
    this.trustedNow = false;
    this.socket = void 0;
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
    this.onChange?.();
    if (!this.closed) this.scheduleRetry();
  }
  post(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  /** Sends a request and waits for its `<type>-result` reply. */
  call(message, timeoutMs = 1e4) {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(`${message.type}-result:${id}`);
        resolve(void 0);
      }, timeoutMs);
      this.waiting.set(`${message.type}-result:${id}`, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      if (!this.post({ ...message, id })) {
        clearTimeout(timer);
        this.waiting.delete(`${message.type}-result:${id}`);
        resolve(void 0);
      }
    });
  }
  /** The Blink status the bridge reports, for the popup. */
  async blinkRunning() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete("status:");
        resolve(void 0);
      }, 3e3);
      this.waiting.set("status:", (value) => {
        clearTimeout(timer);
        resolve(value.blink === true);
      });
      if (!this.post({ type: "status" })) {
        clearTimeout(timer);
        this.waiting.delete("status:");
        resolve(void 0);
      }
    });
  }
  async receive(socket, message) {
    const type = String(message.type);
    if (type === "pong") return;
    if (type === "status") {
      this.waiting.get("status:")?.(message);
      this.waiting.delete("status:");
      return;
    }
    if (type.endsWith("-result") && typeof message.id === "string") {
      const key = `${type}:${message.id}`;
      this.waiting.get(key)?.(message);
      this.waiting.delete(key);
      return;
    }
    if (typeof message.id !== "string") return;
    const id = message.id;
    if (type.endsWith("-cancel")) {
      this.running.get(id)?.abort();
      this.running.delete(id);
      return;
    }
    const controller = new AbortController();
    this.running.set(id, controller);
    try {
      const result = await this.handlers.handle(message, {
        signal: controller.signal,
        send: (value) => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify(value));
        }
      });
      if (!controller.signal.aborted && result && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: `${type}-result`, id, ...result }));
    } catch {
      if (!controller.signal.aborted && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: `${type}-result`, id, ok: false }));
    } finally {
      this.running.delete(id);
    }
  }
};

// extension/trust.ts
function trustSender(sender, port, ownId) {
  if (sender.id !== ownId || !sender.tab || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/install" && Number(url.port) === port && inHelperRange(port);
  } catch {
    return false;
  }
}

// extension/background.ts
var handlers = createHandlers({
  call: (message, timeoutMs) => client.call(message, timeoutMs)
});
var client = new HelperClient(handlers);
var SECRET2 = /^[0-9a-f]{64}$/;
var SELF = chrome.runtime.getURL("");
async function status() {
  const target = await targetTab().catch(() => void 0);
  const connected = client.connected;
  return {
    trusted: Boolean(await storedSecret()),
    connected,
    blink: connected ? await client.blinkRunning() : void 0,
    pageReadable: Boolean(target && readablePage(target.tab.url))
  };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "blinkling:trust") {
    if (typeof message.secret !== "string" || !SECRET2.test(message.secret) || !trustSender(sender, Number(message.port), chrome.runtime.id)) {
      respond({ ok: false });
      return;
    }
    void storeSecret(message.secret).then(() => client.reconnect()).then(() => respond({ ok: client.connected })).catch(() => respond({ ok: false }));
    return true;
  }
  if (!sender.url?.startsWith(SELF)) return;
  if (message?.type === "blinkling:status") {
    void status().then(respond);
    return true;
  }
  if (message?.type === "blinkling:wake") {
    void client.call({ type: "wake" }, 15e3).then((reply) => respond({ ok: reply?.ok === true }));
    return true;
  }
});
var wake = () => void client.wake();
chrome.runtime.onStartup.addListener(wake);
chrome.runtime.onInstalled.addListener(wake);
chrome.alarms.create("blinkling:link", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "blinkling:link") wake();
});
var lastNotice = 0;
var changed = () => {
  const now = Date.now();
  if (now - lastNotice < 400) return;
  lastNotice = now;
  client.post({ type: "page-changed" });
};
chrome.tabs.onActivated.addListener(changed);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "complete" || info.url) changed();
});
chrome.windows.onFocusChanged.addListener(changed);
chrome.windows.onBoundsChanged?.addListener(changed);
wake();
