import { cssVariables } from "../shared/motion.mjs";
import {
  DRAG_THRESHOLD,
  browserOf,
  chipAnchor,
  windowAt,
} from "./window-hit.mjs";

document.documentElement.style.cssText += cssVariables();
const $ = (id) => document.getElementById(id);
const frame = $("frame");
const boxes = $("windows");
const hole = $("hole");
const selection = $("selection");
const size = $("size");
const chip = $("chip");
let session = null,
  press = null,
  rect = null,
  hover = null,
  pending = false,
  raf;
const clamp = (v, max) => Math.max(0, Math.min(max, v));
const point = (e) => ({
  x: clamp(e.clientX, innerWidth),
  y: clamp(e.clientY, innerHeight),
});
const place = (el, x, y) => (el.style.transform = `translate(${x}px, ${y}px)`);

function highlight(win) {
  hover = win;
  for (const box of boxes.children)
    box.classList.toggle("on", !!win && box.dataset.id === String(win.id));
  const shown = !!win && session.companion && !!browserOf(win);
  chip.classList.toggle("on", shown);
  chip.tabIndex = shown ? 0 : -1;
  if (shown) {
    const at = chipAnchor(
      win.bounds,
      { x: 0, y: 0, width: session.width, height: session.height },
      { width: chip.offsetWidth, height: chip.offsetHeight },
    );
    place(chip, at.x, at.y);
  }
}
function paint() {
  raf = undefined;
  if (!rect) return;
  place(selection, rect.x, rect.y);
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
  for (const key of ["x", "y", "width", "height"])
    hole.setAttribute(key, rect[key]);
  size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}
const draw = () => (raf ??= requestAnimationFrame(paint));
async function finish(choice) {
  if (pending) return;
  pending = true;
  try {
    await window.captureUI.finish(choice);
  } catch {
    pending = false;
  }
}

function reset(payload) {
  session = payload;
  press = rect = hover = null;
  pending = false;
  document.body.classList.remove("dragging");
  chip.classList.remove("on");
  boxes.replaceChildren(
    ...payload.windows.map((win) => {
      const box = document.createElement("div");
      box.className = "win";
      box.dataset.id = win.id;
      box.style.width = `${win.bounds.width}px`;
      box.style.height = `${win.bounds.height}px`;
      place(box, win.bounds.x, win.bounds.y);
      return box;
    }),
  );
}

addEventListener("pointerdown", (e) => {
  if (!session || pending || e.button !== 0 || e.target === chip) return;
  press = { start: point(e), dragging: false };
  document.body.setPointerCapture?.(e.pointerId);
});
addEventListener("pointermove", (e) => {
  if (!session || pending || e.target === chip) return;
  const p = point(e);
  if (!press) {
    const win = windowAt(session.windows, p);
    if (win !== hover) highlight(win);
    return;
  }
  if (
    !press.dragging &&
    Math.hypot(p.x - press.start.x, p.y - press.start.y) > DRAG_THRESHOLD
  ) {
    press.dragging = true;
    highlight(null);
    document.body.classList.add("dragging");
  }
  if (press.dragging) {
    rect = {
      x: Math.min(press.start.x, p.x),
      y: Math.min(press.start.y, p.y),
      width: Math.abs(p.x - press.start.x),
      height: Math.abs(p.y - press.start.y),
    };
    draw();
  }
});
addEventListener("pointerup", (e) => {
  if (!press) return;
  const { dragging } = press;
  press = null;
  if (dragging) {
    if (rect && rect.width >= 1 && rect.height >= 1)
      void finish({ kind: "area", rect });
    return;
  }
  const win = windowAt(session.windows, point(e));
  if (win) void finish({ kind: "window", id: win.id });
});
addEventListener("pointercancel", () => {
  press = null;
});
document.addEventListener("pointerleave", () => {
  if (session && !press) highlight(null);
});
chip.addEventListener("click", () => {
  if (hover) void finish({ kind: "page", id: hover.id });
});
addEventListener("keydown", (e) => {
  if (!session) return;
  if (e.key === "Escape") {
    e.preventDefault();
    void window.captureUI.cancel();
  } else if (e.key === "Enter" && !press && !pending) {
    e.preventDefault();
    void finish({ kind: "screen" });
  }
});

// Listen before anything is awaited: the main process may open the overlay as
// soon as it has asked for its text.
window.captureUI.onOpen(async (payload) => {
  document.body.dataset.ready = "";
  reset(payload);
  const at = payload.cursor;
  if (
    at &&
    at.x >= 0 &&
    at.y >= 0 &&
    at.x < payload.width &&
    at.y < payload.height
  )
    highlight(windowAt(payload.windows, at));
  frame.src = `data:${payload.image.mediaType};base64,${payload.image.data}`;
  await frame.decode();
  document.body.dataset.ready = "true";
  await window.captureUI.ready();
});
const initial = await window.captureUI.init();
document.documentElement.lang = initial.locale;
document.title = initial.text.title;
$("hint").textContent = initial.text.hint;
chip.textContent = initial.text.pageChip;
