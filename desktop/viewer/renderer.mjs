import { createZoom } from "./zoom.mjs";
import { cssVariables } from "../shared/motion.mjs";

const api = window.viewerAPI;
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}
const stage = document.querySelector("#viewer");
const picture = document.querySelector("#picture");
const closer = document.querySelector("#viewer-close");

let zoom = null;
const pointers = new Map();
let pinch = 0;
let moved = false;
let onBackdrop = false;

const view = () => ({ width: innerWidth, height: innerHeight });
function draw() {
  if (!zoom) return;
  const s = zoom.state();
  picture.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
  picture.dataset.scale = s.scale.toFixed(4);
  stage.classList.toggle("is-zoomed", s.scale > s.fit + 1e-3);
}
function show(image) {
  picture.onload = () => {
    zoom = createZoom({
      view: view(),
      image: { width: picture.naturalWidth, height: picture.naturalHeight },
    });
    picture.style.width = `${picture.naturalWidth}px`;
    picture.style.height = `${picture.naturalHeight}px`;
    draw();
    stage.classList.add("is-open");
    // The handler is put on once the window is up: a handler registered while
    // the window was still hidden did not catch the first wheel turns.
    removeEventListener("wheel", onWheel);
    addEventListener("wheel", onWheel, { passive: false });
  };
  picture.alt = image.name;
  picture.src = `data:${image.mediaType};base64,${image.data}`;
}
function hide() {
  removeEventListener("wheel", onWheel);
  stage.classList.remove("is-open", "is-zoomed", "is-panning");
  pointers.clear();
}
api.onOpen(show);
api.onClose(hide);
const close = () => api.close();
closer.addEventListener("click", close);
addEventListener("keydown", (event) => {
  if (event.key === "Escape") close();
});
addEventListener("resize", () => {
  zoom?.resize(view());
  draw();
});
function onWheel(event) {
  event.preventDefault();
  if (!zoom) return;
  zoom.wheel({ x: event.clientX, y: event.clientY }, event.deltaY, {
    ctrl: event.ctrlKey,
  });
  draw();
}
const gap = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
stage.addEventListener("pointerdown", (event) => {
  if (event.target === closer) return;
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  moved = false;
  onBackdrop = event.target === stage;
  if (pointers.size === 2) pinch = gap();
  stage.classList.add("is-panning");
});
stage.addEventListener("pointermove", (event) => {
  const last = pointers.get(event.pointerId);
  if (!last || !zoom) return;
  const now = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, now);
  if (pointers.size === 2) {
    const next = gap();
    const [a, b] = [...pointers.values()];
    if (pinch)
      zoom.pinch({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, next / pinch);
    pinch = next;
    moved = true;
  } else {
    const dx = now.x - last.x,
      dy = now.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
    zoom.pan(dx, dy);
  }
  draw();
});
function release(event) {
  if (!pointers.delete(event.pointerId)) return;
  pinch = 0;
  if (!pointers.size) stage.classList.remove("is-panning");
}
stage.addEventListener("pointerup", (event) => {
  const wasDrag = moved;
  release(event);
  // A click, not a drag, that began on the backdrop closes the viewer.
  if (!wasDrag && onBackdrop) close();
});
stage.addEventListener("pointercancel", release);
// With the pointer captured by the stage, the double click lands on the stage.
stage.addEventListener("dblclick", (event) => {
  zoom?.toggle({ x: event.clientX, y: event.clientY });
  draw();
});
