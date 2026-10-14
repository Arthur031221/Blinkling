const frame = document.querySelector("#frame");
const selection = document.querySelector("#selection");
const hole = document.querySelector("#hole");
const size = document.querySelector("#size");
let rect,
  drag,
  pending = false,
  raf;
const clamp = (v, max) => Math.max(0, Math.min(max, v));
const point = (e) => ({
  x: clamp(e.clientX, innerWidth),
  y: clamp(e.clientY, innerHeight),
});
function paint() {
  raf = undefined;
  selection.hidden = !rect;
  if (!rect) return;
  Object.assign(selection.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  for (const key of ["x", "y", "width", "height"])
    hole.setAttribute(key, rect[key]);
  size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}
function draw() {
  if (!raf) raf = requestAnimationFrame(paint);
}
addEventListener("pointerdown", (e) => {
  if (pending || e.button !== 0) return;
  const p = point(e),
    handle = e.target.dataset.handle;
  drag = {
    start: p,
    original: rect && { ...rect },
    kind: handle || (e.target === selection && rect ? "move" : "new"),
  };
  e.target.setPointerCapture(e.pointerId);
  if (drag.kind === "new") rect = { ...p, width: 0, height: 0 };
  draw();
});
addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = point(e),
    o = drag.original;
  if (drag.kind === "move")
    rect = {
      ...o,
      x: clamp(o.x + p.x - drag.start.x, innerWidth - o.width),
      y: clamp(o.y + p.y - drag.start.y, innerHeight - o.height),
    };
  else {
    const anchor =
      drag.kind === "new"
        ? drag.start
        : {
            x: drag.kind.includes("w") ? o.x + o.width : o.x,
            y: drag.kind.includes("n") ? o.y + o.height : o.y,
          };
    rect = {
      x: Math.min(anchor.x, p.x),
      y: Math.min(anchor.y, p.y),
      width: Math.abs(p.x - anchor.x),
      height: Math.abs(p.y - anchor.y),
    };
  }
  draw();
});
addEventListener("pointerup", () => {
  drag = null;
});
addEventListener("pointercancel", () => {
  drag = null;
});
addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    await window.captureUI.cancel();
  }
  if (
    e.key === "Enter" &&
    rect &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    !pending
  ) {
    e.preventDefault();
    pending = true;
    try {
      await window.captureUI.finish(rect);
    } catch {
      pending = false;
    }
  }
  if (
    rect &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    const by = e.shiftKey ? 10 : 1;
    rect.x = clamp(
      rect.x + (e.key === "ArrowLeft" ? -by : e.key === "ArrowRight" ? by : 0),
      innerWidth - rect.width,
    );
    rect.y = clamp(
      rect.y + (e.key === "ArrowUp" ? -by : e.key === "ArrowDown" ? by : 0),
      innerHeight - rect.height,
    );
    draw();
  }
});
const initial = await window.captureUI.init();
frame.src = `data:${initial.image.mediaType};base64,${initial.image.data}`;
await frame.decode();
document.body.dataset.ready = "true";
