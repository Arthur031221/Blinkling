(() => {
  // extension/page-text.ts
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
    "CANVAS",
    "IFRAME",
    "FRAME",
    "OBJECT",
    "EMBED"
  ]);
  function isExcluded(element, includeHidden = false) {
    for (let current = element; current; current = composedParent(current)) {
      if (current.matches(
        "[data-blinkling-overlay], [data-private], [data-sensitive]"
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
  function contextTextNode(node, allowEmpty = false) {
    const parent = composedTextParent(node);
    return !!(parent && (node.nodeValue?.trim() || allowEmpty && node.nodeValue === "") && restorableTextNode(node) && visible(parent));
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
  var secureAutocomplete = /(^|\s)(cc-[a-z-]+|one-time-code|current-password|new-password)(\s|$)/i;
  function isSecureField(element) {
    if (element instanceof HTMLInputElement && element.type === "password")
      return true;
    return secureAutocomplete.test(element.getAttribute("autocomplete") ?? "");
  }

  // extension/elements.ts
  var MAX_COLLECTED = 400;
  var MAX_SCANNED = 2e4;
  var MAX_TEXT = 500;
  var MAX_CONTENT = 4e3;
  var SELECTOR = [
    "h1,h2,h3,h4,h5,h6",
    "p,li,blockquote,figcaption",
    "a[href],button,summary",
    "input,textarea,select",
    "img,picture,svg[role=img],canvas,video,audio,figure",
    "td,th",
    "pre,code,table",
    "math,.katex,mjx-container",
    "nav,main,article,aside,header,footer,form,dialog",
    "[role]"
  ].join(",");
  var implicitRole = {
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    p: "paragraph",
    li: "listitem",
    blockquote: "blockquote",
    figcaption: "caption",
    a: "link",
    button: "button",
    summary: "button",
    textarea: "textbox",
    select: "combobox",
    img: "img",
    picture: "img",
    canvas: "img",
    figure: "figure",
    td: "cell",
    th: "cell",
    video: "video",
    audio: "audio",
    pre: "code",
    code: "code",
    table: "table",
    math: "math",
    nav: "navigation",
    main: "main",
    article: "article",
    aside: "complementary",
    header: "banner",
    footer: "contentinfo",
    form: "form",
    dialog: "dialog"
  };
  var inputRole = {
    button: "button",
    submit: "button",
    reset: "button",
    image: "button",
    checkbox: "checkbox",
    radio: "radio",
    range: "slider",
    search: "searchbox",
    number: "spinbutton"
  };
  var kindOfRole = {
    heading: "heading",
    paragraph: "paragraph",
    listitem: "listitem",
    link: "link",
    button: "button",
    textbox: "input",
    searchbox: "input",
    combobox: "input",
    spinbutton: "input",
    checkbox: "input",
    radio: "input",
    slider: "input",
    img: "image",
    video: "media",
    audio: "media",
    code: "code",
    table: "table",
    cell: "cell",
    figure: "figure",
    math: "math",
    blockquote: "quote",
    caption: "caption"
  };
  var CONTAINERS = /* @__PURE__ */ new Set([
    "main",
    "navigation",
    "article",
    "complementary",
    "banner",
    "contentinfo",
    "form",
    "dialog",
    "table",
    "generic",
    "region",
    "group",
    "list"
  ]);
  var squash = (value, max) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  function roleOf(element) {
    const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
    if (explicit) return explicit.toLowerCase();
    const tag = element.localName;
    if (tag === "input")
      return inputRole[element.type] ?? "textbox";
    if (element.matches(".katex,mjx-container")) return "math";
    return implicitRole[tag] ?? "generic";
  }
  function kindOf(element, role) {
    if (element.matches(".katex,mjx-container")) return "math";
    return kindOfRole[role] ?? (role === "generic" ? "region" : role);
  }
  function labelledBy(element) {
    const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
    const root = element.getRootNode();
    return squash(
      ids.map((id) => root.getElementById?.(id)?.textContent ?? "").join(" "),
      120
    );
  }
  function nameOf(element) {
    const aria = squash(element.getAttribute("aria-label"), 120);
    if (aria) return aria;
    const referenced = labelledBy(element);
    if (referenced) return referenced;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const label = squash(
        Array.from(element.labels ?? []).map((l) => l.textContent).join(" "),
        120
      );
      if (label) return label;
      const hint = element.getAttribute("placeholder") || element.getAttribute("title");
      if (hint) return squash(hint, 120);
      if (element instanceof HTMLInputElement && /^(button|submit|reset)$/.test(element.type))
        return squash(element.value, 120);
      return "";
    }
    if (element.localName === "img")
      return squash(element.getAttribute("alt"), 120);
    const title = element.getAttribute("title");
    if (CONTAINERS.has(roleOf(element))) return squash(title, 120);
    if (title && !element.textContent?.trim()) return squash(title, 120);
    return squash(element.textContent, 120);
  }
  function textOf(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.matches("[contenteditable]:not([contenteditable=false])") || element.matches("nav,main,article,aside,header,footer,form,dialog,table"))
      return "";
    return squash(element.textContent, MAX_TEXT);
  }
  function languageOf(element) {
    for (const node of [element, element.querySelector("code")]) {
      const match = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(
        node?.getAttribute("class") ?? ""
      );
      if (match) return match[1];
      const data = node?.getAttribute("data-language") ?? node?.getAttribute("data-lang");
      if (data) return squash(data, 40);
    }
    return void 0;
  }
  function tableMarkdown(table) {
    const rows = Array.from(table.querySelectorAll("tr")).slice(0, 60);
    const cells = rows.map(
      (row) => Array.from(row.querySelectorAll("th,td")).slice(0, 12).map((cell) => squash(cell.textContent, 80).replaceAll("|", "\\|"))
    );
    if (!cells.length) return "";
    const width = Math.max(...cells.map((row) => row.length));
    const pad = (row) => `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`;
    return [
      pad(cells[0]),
      `| ${Array(width).fill("---").join(" | ")} |`,
      ...cells.slice(1).map(pad)
    ].join("\n");
  }
  function contentOf(element, role) {
    const cap = (value) => value.slice(0, MAX_CONTENT);
    if (role === "code") {
      const code = element.textContent ?? "";
      if (!code.trim()) return void 0;
      const language = languageOf(element);
      return { code: cap(code), ...language ? { language } : {} };
    }
    if (role === "math") {
      const math = element.localName === "math" ? element : element.querySelector("math");
      const tex = element.querySelector(
        'annotation[encoding="application/x-tex"]'
      )?.textContent;
      const content = {};
      if (tex) content.latex = cap(tex.trim());
      if (math) content.mathml = cap(math.outerHTML);
      return Object.keys(content).length ? content : void 0;
    }
    if (role === "table") {
      const markdown = tableMarkdown(element);
      return markdown ? { markdown: cap(markdown) } : void 0;
    }
    if (role === "heading") {
      const level = /^h([1-6])$/.exec(element.localName)?.[1];
      const text = squash(element.textContent, MAX_TEXT);
      return text ? { markdown: `${"#".repeat(Number(level ?? 2))} ${text}` } : void 0;
    }
    if (role === "link") {
      const href = element.href;
      const text = squash(element.textContent, 200);
      return href && text ? { markdown: `[${text}](${href})` } : void 0;
    }
    if (role === "listitem") {
      const text = squash(element.textContent, MAX_TEXT);
      return text ? { markdown: `- ${text}` } : void 0;
    }
    if (role === "blockquote") {
      const text = squash(element.textContent, MAX_TEXT);
      return text ? { markdown: `> ${text}` } : void 0;
    }
    return void 0;
  }
  function collectElements(doc = document, options = {}) {
    const view = doc.defaultView ?? window;
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const limit = options.limit ?? MAX_COLLECTED;
    const found = [];
    let skippedFrames = 0;
    let scanned = 0;
    const visit = (root, offset = { x: 0, y: 0 }) => {
      for (const element of root.querySelectorAll("*")) {
        if (++scanned > MAX_SCANNED) return;
        const shadow = element.shadowRoot;
        if (shadow && shadow.mode === "open") visit(shadow, offset);
        if (element.localName === "iframe") {
          const frame = element;
          let inner = null;
          try {
            inner = frame.contentDocument;
          } catch {
            inner = null;
          }
          if (!inner) skippedFrames++;
          else {
            const box = frame.getBoundingClientRect();
            visit(inner, { x: offset.x + box.x, y: offset.y + box.y });
          }
          continue;
        }
        if (!element.matches(SELECTOR)) continue;
        found.push({ element, offset, rect: element.getBoundingClientRect() });
      }
    };
    visit(doc);
    const taken = /* @__PURE__ */ new Map();
    const ordered = [];
    const near = options.near;
    const candidates = found.map((entry) => {
      const { rect, offset } = entry;
      const box = {
        x: Math.round((rect.x + offset.x) * 10) / 10,
        y: Math.round((rect.y + offset.y) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10
      };
      return { ...entry, box };
    }).filter(({ element, box }) => {
      if (box.width <= 0 || box.height <= 0) return false;
      if (box.x + box.width < 0 || box.y + box.height < 0 || box.x > viewport.width || box.y > viewport.height)
        return false;
      if (element.closest("[data-blinkling-overlay]")) return false;
      if (["script", "style", "noscript", "template"].includes(element.localName))
        return false;
      return visible(element);
    });
    const hit = (box) => !!near && near.x >= box.x && near.x <= box.x + box.width && near.y >= box.y && near.y <= box.y + box.height;
    const kept = candidates.length > limit ? [
      ...candidates.filter((c) => hit(c.box)),
      ...candidates.filter((c) => !hit(c.box))
    ].slice(0, limit).sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b)) : candidates;
    let index = 0;
    for (const { element, box } of kept) {
      const role = roleOf(element);
      const secure = isSecureField(element) || !!element.closest("[data-private],[data-sensitive]");
      const entry = {
        id: `e${++index}`,
        kind: kindOf(element, role),
        tag: element.localName,
        rect: box,
        role,
        name: secure ? "" : nameOf(element),
        text: secure || isExcluded(element, true) ? "" : textOf(element),
        parentId: null,
        secure
      };
      if (!secure && !isExcluded(element, true)) {
        const content = contentOf(element, role);
        if (content) entry.content = content;
      }
      taken.set(element, entry);
      ordered.push(entry);
    }
    for (const [element, entry] of taken) {
      for (let parent = composedParent(element); parent; parent = composedParent(parent)) {
        const owner = taken.get(parent);
        if (owner) {
          entry.parentId = owner.id;
          break;
        }
      }
    }
    const selection = readSelection(view);
    return {
      elements: ordered,
      viewport,
      skippedFrames,
      ...selection ? { selection } : {}
    };
  }
  function readSelection(view) {
    const selection = view.getSelection?.();
    if (!selection || selection.rangeCount === 0) return void 0;
    const text = selection.toString().trim();
    if (!text) return void 0;
    const range = selection.getRangeAt(0);
    const anchor = range.commonAncestorContainer;
    const host = anchor instanceof Element ? anchor : anchor.parentElement;
    if (!host || isExcluded(host) || host.closest("input, textarea"))
      return void 0;
    const box = range.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return void 0;
    return {
      text: text.slice(0, MAX_CONTENT),
      rect: {
        x: Math.round(box.x * 10) / 10,
        y: Math.round(box.y * 10) / 10,
        width: Math.round(box.width * 10) / 10,
        height: Math.round(box.height * 10) / 10
      }
    };
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

  // extension/page.ts
  var scope = globalThis;
  if (!scope.blinklingPageReady) {
    let textNodeId = function(node) {
      let id = nodeIds.get(node);
      if (!id) {
        id = `t${nextTextId++}`;
        nodeIds.set(node, id);
      }
      return id;
    };
    scope.blinklingPageReady = true;
    const originals = /* @__PURE__ */ new Map();
    const nodeIds = /* @__PURE__ */ new WeakMap();
    let nextTextId = 1;
    chrome.runtime.onMessage.addListener(
      (message, _sender, respond) => {
        if (message.type === "blinkling:elements") {
          const near = message.near;
          const page = collectElements(document, {
            near: near && Number.isFinite(near.x) && Number.isFinite(near.y) ? { x: Number(near.x), y: Number(near.y) } : void 0
          });
          respond({
            ...page,
            title: document.title,
            url: location.href,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
          });
          return;
        }
        if (message.type === "blinkling:text-nodes") {
          if (hasSensitiveContent(document, true)) {
            respond({ error: "password_page" });
            return;
          }
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
            if (!(node instanceof Text)) continue;
            const retainedId = nodeIds.get(node);
            let original = retainedId ? originals.get(retainedId) : void 0;
            const retainedEmpty = original?.node === node && original.lastWritten === "" && node.nodeValue === "";
            if (!contextTextNode(node, retainedEmpty)) continue;
            if (index < cursor) {
              index++;
              continue;
            }
            let id = retainedId ?? textNodeId(node);
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
        if (message.type === "blinkling:translate" && Array.isArray(message.nodes)) {
          if (hasSensitiveContent(document, true)) {
            respond({ error: "password_page" });
            return;
          }
          let applied = 0;
          let changed = 0;
          let rejected = 0;
          const skipped = { disconnected: 0, sourceChanged: 0, ineligible: 0 };
          for (const entry of message.nodes.slice(0, 160)) {
            if (!entry || typeof entry.id !== "string" || typeof entry.text !== "string") {
              rejected++;
              continue;
            }
            const original = originals.get(entry.id);
            if (!original || entry.text.length > 12e3) {
              rejected++;
              continue;
            }
            if (!original.node.isConnected) {
              skipped.disconnected++;
              continue;
            }
            if (!contextTextNode(
              original.node,
              original.lastWritten === "" && original.node.nodeValue === ""
            )) {
              skipped.ineligible++;
              continue;
            }
            if (original.node.nodeValue !== (original.lastWritten ?? original.text)) {
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
                "data-blinkling-translated",
                "true"
              );
            }
            applied++;
          }
          respond({ applied, changed, skipped, rejected });
          return;
        }
        if (message.type === "blinkling:restore") {
          let restored = 0;
          for (const [id, entry] of originals) {
            if (entry.node.isConnected && restorableTextNode(entry.node) && entry.lastWritten !== void 0 && entry.node.nodeValue === entry.lastWritten) {
              entry.node.nodeValue = entry.text;
              entry.node.parentElement?.removeAttribute(
                "data-blinkling-translated"
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
  }
})();
