import { menuLayout, menuTransform, PILL } from "./layout.mjs";
import { menuText } from "./strings.mjs";
import { spring } from "../character/state.mjs";
import { roundedRect } from "../character/silhouette.mjs";
import { duration, frameLog, springs } from "../shared/motion.mjs";
// Four bubbles (N2.1), nearest Blink first: id, string key and icon.
const definitions = [
  ["capture", "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"],
  ["guide", "M5 4l14 7-7 3-3 7z"],
  [
    "auto-explain",
    "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  ],
  ["settings", "M4 7h16M4 17h16M9 4v6m6 4v6"],
];
const keys = {
  capture: ["capture", "captureHint"],
  guide: ["guide", "guideHint"],
  "auto-explain": ["autoExplain", "autoExplainHint"],
  settings: ["settings", "settingsHint"],
};
export const menuActions = Object.freeze(
  definitions.map(([id]) => Object.freeze({ id })),
);
const AUTO = definitions.findIndex(([id]) => id === "auto-explain");
// The bubbles open one after another within one fast step.
const STAGGER = duration.fast / 1000 / PILL.count;
const LABEL_GAP = 8;
// Below this distance from its target a spring has visibly stopped.
const SETTLED = 0.002;
export function mountMenu(host, onAction, { text = menuText() } = {}) {
  host.setAttribute("role", "toolbar");
  host.setAttribute("aria-label", text("toolbar"));
  let expanded = -1,
    open = false,
    changedAt = 0,
    steps = STAGGER;
  const log = frameLog();
  const values = definitions.map(() => ({ value: 0, velocity: 0 }));
  const labels = [];
  const buttons = definitions.map(([id, path], i) => {
    const [name, hint] = keys[id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "action-bubble action";
    b.dataset.action = id;
    b.setAttribute("aria-label", text(name));
    const label = document.createElement("span");
    label.className = "action-label";
    const title = document.createElement("strong"),
      detail = document.createElement("span");
    title.textContent = text(name);
    detail.textContent = text(hint);
    label.append(title, detail);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path);
    svg.append(line);
    b.append(svg, label);
    labels.push({ title, detail, name, hint });
    if (i === AUTO) {
      b.setAttribute("role", "switch");
      b.setAttribute("aria-checked", "false");
    }
    b.addEventListener("pointerenter", () => {
      expanded = i;
    });
    b.addEventListener("pointerleave", () => {
      if (expanded === i) expanded = -1;
    });
    b.addEventListener("focus", () => {
      expanded = i;
    });
    b.addEventListener("blur", () => {
      if (expanded === i) expanded = -1;
    });
    b.addEventListener("click", () => onAction(id));
    host.append(b);
    return b;
  });
  let rects = [],
    painted = [],
    stand = null;
  return {
    buttons,
    get expanded() {
      return expanded;
    },
    get open() {
      return open;
    },
    /** `together` skips the stagger: a fan that closes because Blink was
     * picked up shrinks as one, so no bubble slides across another. */
    setOpen(value, now, { together = false } = {}) {
      if (open !== value) {
        open = value;
        changedAt = now;
        expanded = -1;
        steps = together ? 0 : STAGGER;
      }
    },
    setAuto(value) {
      const b = buttons[AUTO],
        l = labels[AUTO];
      b.setAttribute("aria-checked", String(value));
      b.dataset.on = String(value);
      l.detail.textContent = text(value ? "autoExplainOn" : l.hint);
    },
    frame(now, dt, area, anchor) {
      // While closing, the fan collapses where it stood: Blink may already be
      // flying away, and re-laying the fan out around it would make the
      // bubbles jump sides mid-collapse.
      if (open || !stand || values.every((v) => v.value === 0)) {
        rects = menuLayout(area, anchor);
        stand = { area, anchor: { ...anchor } };
      }
      const wasMoving = values.some((v) => v.value > 0.001 && v.value < 0.999);
      painted = [];
      buttons.forEach((b, i) => {
        const order = open ? i : buttons.length - 1 - i,
          target =
            now - changedAt >= order * steps ? (open ? 1 : 0) : values[i].value;
        values[i] = spring(
          values[i].value,
          target,
          values[i].velocity,
          dt,
          springs.crisp,
        );
        if (Math.abs(values[i].value - target) < SETTLED) {
          values[i].value = target;
          values[i].velocity = 0;
        }
        const q = values[i].value,
          r = rects[i],
          pose = menuTransform(stand.area, stand.anchor, r, q);
        painted[i] = {
          x: r.x + pose.x,
          y: r.y + pose.y,
          scale: pose.scale,
        };
        b.style.transform = `translate(${r.x + pose.x}px,${r.y + pose.y}px) scale(${pose.scale})`;
        b.style.opacity = String(Math.min(1, q));
        b.style.visibility = q > 0.015 ? "visible" : "hidden";
        b.style.pointerEvents = q > 0.8 ? "auto" : "none";
        b.inert = !open || q <= 0.8;
        b.classList.toggle("expanded", i === expanded);
        b.classList.toggle("flip", r.direction < 0);
      });
      if (wasMoving || open)
        log("fan", fanBox(buttons, painted, values, PILL.size));
    },
    polygons() {
      const shapes = [];
      buttons.forEach((b, i) => {
        if (values[i].value <= 0.8) return;
        const r = rects[i];
        shapes.push(roundedRect(r.x, r.y, r.width, r.height, r.height / 2));
        if (i !== expanded) return;
        const label = b.querySelector(".action-label"),
          w = label.offsetWidth,
          h = label.offsetHeight;
        shapes.push(
          roundedRect(
            r.direction > 0 ? r.x + r.width + LABEL_GAP : r.x - LABEL_GAP - w,
            r.y + r.height / 2 - h / 2,
            w,
            h,
            12,
          ),
        );
      });
      return shapes;
    },
    collapse() {
      open = false;
      expanded = -1;
    },
  };
}
function fanBox(buttons, painted, values, size) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  painted.forEach((p, i) => {
    if (values[i].value <= 0.015) return;
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x + size * p.scale);
    bottom = Math.max(bottom, p.y + size * p.scale);
  });
  return left === Infinity
    ? null
    : { x: left, y: top, width: right - left, height: bottom - top };
}
