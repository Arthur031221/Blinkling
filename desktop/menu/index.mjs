import { menuLayout } from "./layout.mjs";
import { spring } from "../character/state.mjs";
import { roundedRect } from "../character/silhouette.mjs";
const definitions = [
  [
    "screen",
    "截取畫面",
    "擷取 Blink 所在的螢幕",
    "M4 7h16v11H4z M8 3v4m8-4v4M9 21h6",
  ],
  [
    "region",
    "選取區域",
    "拖曳選取想問的範圍",
    "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5",
  ],
  [
    "full-page",
    "整頁截圖",
    "擷取網頁從頂端到最底部",
    "M7 3h10v18H7z M10 8h4m-4 4h4m-4 4h4",
  ],
  ["guide", "導覽", "在畫面上標出重點與步驟", "M5 4l14 7-7 3-3 7z"],
  [
    "auto-explain",
    "自動解說",
    "畫面有大變化時簡短說明",
    "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  ],
  ["chat", "對話", "打開對話卡片繼續聊", "M4 4h16v13H9l-5 4z"],
  ["settings", "設定", "調整 Blink 的偏好", "M4 7h16M4 17h16M9 4v6m6 4v6"],
  [
    "help",
    "說明",
    "看看如何使用 Blink",
    "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  ],
];
export const menuActions = Object.freeze(
  definitions.map(([id, label, description]) =>
    Object.freeze({ id, label, description }),
  ),
);
export function mountMenu(host, onAction) {
  host.setAttribute("role", "toolbar");
  host.setAttribute("aria-label", "Blink 動作");
  let expanded = -1,
    open = false,
    changedAt = 0;
  const values = definitions.map(() => ({ value: 0, velocity: 0 }));
  const buttons = definitions.map(([id, label, description, path], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "action-bubble";
    b.dataset.action = id;
    b.setAttribute("aria-label", label);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span class="action-detail"><strong>${label}</strong><span>${description}</span></span>`;
    if (id === "auto-explain") b.setAttribute("aria-pressed", "false");
    b.addEventListener("pointerenter", () => {
      expanded = i;
    });
    b.addEventListener("pointerleave", () => {
      if (expanded === i) expanded = -1;
    });
    b.addEventListener("click", () => onAction(id));
    host.append(b);
    return b;
  });
  let rects = [];
  return {
    buttons,
    get expanded() {
      return expanded;
    },
    setOpen(value, now) {
      if (open !== value) {
        open = value;
        changedAt = now;
        expanded = -1;
      }
    },
    setAuto(value) {
      buttons[4].setAttribute("aria-pressed", String(value));
    },
    frame(now, dt, area, anchor) {
      rects = menuLayout(area, anchor, expanded);
      buttons.forEach((b, i) => {
        const order = open ? i : 7 - i,
          target =
            now - changedAt >= order * 0.035 ? (open ? 1 : 0) : values[i].value;
        values[i] = spring(values[i].value, target, values[i].velocity, dt, 24);
        const q = values[i].value,
          r = rects[i];
        b.style.width = `${r.width}px`;
        b.style.left = r.direction > 0 ? `${r.x}px` : "auto";
        b.style.right =
          r.direction < 0 ? `${innerWidth - r.x - r.width}px` : "auto";
        b.style.top = `${r.y}px`;
        b.style.transform = `translate(${(anchor.x - r.x - r.width / 2) * (1 - q)}px,${(anchor.y - r.y) * (1 - q)}px) scale(${Math.max(0.01, q)})`;
        b.style.opacity = String(Math.min(1, q));
        b.style.visibility = q > 0.015 ? "visible" : "hidden";
        b.style.pointerEvents = q > 0.8 ? "auto" : "none";
        b.classList.toggle("expanded", i === expanded);
        b.classList.toggle("from-left", r.direction > 0);
      });
    },
    polygons() {
      return buttons
        .filter((b, i) => values[i].value > 0.8)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return roundedRect(r.x, r.y, r.width, r.height, r.height / 2);
        });
    },
    collapse() {
      open = false;
      expanded = -1;
    },
  };
}
