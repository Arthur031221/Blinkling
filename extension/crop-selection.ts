export type Point = { x: number; y: number };
export type CropRect = { x: number; y: number; width: number; height: number };
export type CropLabels = {
  cropTitle: string;
  cropHint: string;
  cropConfirm: string;
  cropCancel: string;
};
export function selectionRect(
  start: Point,
  end: Point,
  width: number,
  height: number,
): CropRect {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const x1 = clamp(start.x, width),
    x2 = clamp(end.x, width);
  const y1 = clamp(start.y, height),
    y2 = clamp(end.y, height);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
export function imageRect(
  rect: CropRect,
  display: { width: number; height: number },
  image: { width: number; height: number },
): CropRect {
  const scaleX = image.width / display.width,
    scaleY = image.height / display.height;
  const x = Math.min(image.width - 1, Math.max(0, Math.round(rect.x * scaleX))),
    y = Math.min(image.height - 1, Math.max(0, Math.round(rect.y * scaleY)));
  return {
    x,
    y,
    width: Math.min(
      image.width - x,
      Math.max(1, Math.round(rect.width * scaleX)),
    ),
    height: Math.min(
      image.height - y,
      Math.max(1, Math.round(rect.height * scaleY)),
    ),
  };
}

// Used by both the fullscreen frozen frame and the live page overlay.
export function selectCrop(
  host: HTMLElement,
  bounds: () => DOMRect,
  labels: CropLabels,
  pixelScale = 1,
  initialPointer?: PointerEvent,
): Promise<CropRect | null> {
  const doc = host.ownerDocument,
    view = doc.defaultView!;
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
  const previousFocus = doc.activeElement as HTMLElement | null;
  box.append(readout);
  for (const [name, left, top] of [
    ["nw", 0, 0],
    ["n", 50, 0],
    ["ne", 100, 0],
    ["e", 100, 50],
    ["se", 100, 100],
    ["s", 50, 100],
    ["sw", 0, 100],
    ["w", 0, 50],
  ] as const) {
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
  let rect: CropRect | null = null;
  let drag: {
    pointerId: number;
    start: Point;
    origin: CropRect | null;
    handle: string;
  } | null = null;
  const point = (event: PointerEvent): Point => {
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
    readout.textContent = `${Math.round(rect.width * pixelScale)} × ${Math.round(rect.height * pixelScale)} px`;
    confirm.disabled = rect.width < 2 || rect.height < 2;
  };
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value: CropRect | null) => {
      if (finished) return;
      finished = true;
      view.removeEventListener("keydown", key, true);
      view.removeEventListener("resize", resize);
      view.removeEventListener("scroll", render, true);
      view.removeEventListener("pagehide", cancelCrop);
      view.removeEventListener("pointerdown", down, true);
      view.removeEventListener("pointermove", move, true);
      view.removeEventListener("pointerup", up, true);
      view.removeEventListener("pointercancel", pointerCancel, true);
      if (drag && surface.hasPointerCapture?.(drag.pointerId))
        surface.releasePointerCapture(drag.pointerId);
      drag = null;
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
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const buttons = [
          ...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ].filter((button) => !button.closest("[hidden]"));
        const index = buttons.indexOf(root.activeElement as HTMLButtonElement);
        buttons[
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(null);
      }
      if (event.key === "Enter" && cancel === root.activeElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(null);
      } else if (event.key === "Enter" && rect && !confirm.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(rect);
      }
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        const r = bounds(),
          step = event.shiftKey ? 10 : 1;
        const creatingSelection = !rect;
        if (!rect)
          rect = {
            x: Math.round(r.width / 4),
            y: Math.round(r.height / 4),
            width: Math.round(r.width / 2),
            height: Math.round(r.height / 2),
          };
        if (event.ctrlKey || event.metaKey) {
          rect.width = Math.max(
            2,
            Math.min(
              r.width - rect.x,
              rect.width +
                (event.key === "ArrowRight"
                  ? step
                  : event.key === "ArrowLeft"
                    ? -step
                    : 0),
            ),
          );
          rect.height = Math.max(
            2,
            Math.min(
              r.height - rect.y,
              rect.height +
                (event.key === "ArrowDown"
                  ? step
                  : event.key === "ArrowUp"
                    ? -step
                    : 0),
            ),
          );
          render();
          if (creatingSelection) confirm.focus({ preventScroll: true });
          return;
        }
        rect = {
          ...rect,
          x: Math.max(
            0,
            Math.min(
              r.width - rect.width,
              rect.x +
                (event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              r.height - rect.height,
              rect.y +
                (event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0),
            ),
          ),
        };
        render();
        if (creatingSelection) confirm.focus({ preventScroll: true });
      }
    };
    const resize = () => {
      if (rect) {
        const r = bounds();
        rect = selectionRect(
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width, y: rect.y + rect.height },
          r.width,
          r.height,
        );
        render();
      }
    };
    const beginDrag = (event: PointerEvent, seeded = false) => {
      if (event.button !== 0 || drag) return;
      const target = (event.composedPath()[0] || event.target) as HTMLElement;
      if (!seeded && target.closest(".tools")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      surface.setPointerCapture?.(event.pointerId);
      drag = {
        pointerId: event.pointerId,
        start: point(event),
        origin: rect ? { ...rect } : null,
        handle:
          (!seeded && target.dataset.handle) ||
          (target === box || target === readout ? "move" : "new"),
      };
      if (drag.handle === "new") {
        rect = { ...drag.start, width: 0, height: 0 };
        render();
      }
    };
    const down = (event: PointerEvent) => {
      if (event.composedPath().includes(surface)) beginDrag(event);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const p = point(event),
        r = bounds(),
        o = drag.origin;
      if (drag.handle === "move" && o)
        rect = {
          ...o,
          x: Math.max(0, Math.min(r.width - o.width, o.x + p.x - drag.start.x)),
          y: Math.max(
            0,
            Math.min(r.height - o.height, o.y + p.y - drag.start.y),
          ),
        };
      else if (drag.handle === "new" || !o)
        rect = selectionRect(drag.start, p, r.width, r.height);
      else {
        const h = drag.handle;
        rect = selectionRect(
          { x: h.includes("w") ? p.x : o.x, y: h.includes("n") ? p.y : o.y },
          {
            x: h.includes("e") ? p.x : o.x + o.width,
            y: h.includes("s") ? p.y : o.y + o.height,
          },
          r.width,
          r.height,
        );
      }
      render();
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      move(event);
      if (surface.hasPointerCapture?.(drag.pointerId))
        surface.releasePointerCapture(drag.pointerId);
      drag = null;
      if (rect && !confirm.disabled) confirm.focus({ preventScroll: true });
    };
    const pointerCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = null;
      finish(null);
    };
    confirm.onclick = () => {
      if (rect && !confirm.disabled) finish(rect);
    };
    cancel.onclick = cancelCrop;
    view.addEventListener("keydown", key, true);
    view.addEventListener("resize", resize);
    view.addEventListener("scroll", render, true);
    view.addEventListener("pagehide", cancelCrop, { once: true });
    view.addEventListener("pointerdown", down, true);
    view.addEventListener("pointermove", move, true);
    view.addEventListener("pointerup", up, true);
    view.addEventListener("pointercancel", pointerCancel, true);
    cancel.focus({ preventScroll: true });
    if (initialPointer) beginDrag(initialPointer, true);
  });
}
