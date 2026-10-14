const definitions = [
  [
    "screen",
    "截取畫面",
    "擷取 Blink 所在的螢幕",
    "M3 4h18v12H3z M8 21h8 M12 16v5",
  ],
  [
    "region",
    "選取區域",
    "拖曳框選想看的範圍",
    "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M8 8h8v8H8z",
  ],
  [
    "full-page",
    "整頁截圖",
    "擷取瀏覽器整頁內容",
    "M6 2h12v20H6z M9 6h6 M9 10h6 M9 14h6 M9 18h4",
  ],
  [
    "guide",
    "導覽",
    "看懂畫面並一步步操作",
    "M12 3l8 4v7l-8 7-8-7V7z M12 8v5 M12 16h.01",
  ],
  [
    "auto-explain",
    "自動解說",
    "畫面改變時簡短說明",
    "M9 5v14l10-7z M3 8v8 M22 8v8",
  ],
  ["chat", "對話", "打開對話與附件", "M3 4h18v13H9l-6 4z M7 8h10 M7 12h7"],
  [
    "settings",
    "設定",
    "調整 Blink 的偏好",
    "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  ],
  [
    "help",
    "說明",
    "查看使用與安裝說明",
    "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 18h.01",
  ],
];
export const menuActions = Object.freeze(
  definitions.map(([id, label, description, icon]) =>
    Object.freeze({ id, label, description, icon }),
  ),
);
export function bubbleRegions(element) {
  const r = element.getBoundingClientRect(),
    radius = Math.min(r.height / 2, 22),
    rows = [];
  for (
    let y = Math.max(0, Math.floor(r.y));
    y < Math.min(innerHeight, r.bottom);
    y++
  ) {
    const edge = Math.max(
      0,
      radius - Math.min(y + 0.5 - r.y, r.bottom - y - 0.5),
    );
    const inset =
      radius - Math.sqrt(Math.max(0, radius * radius - edge * edge));
    rows.push({ x: r.x + inset, y, width: r.width - inset * 2, height: 1 });
  }
  return rows;
}
export function mountMenu(host, onAction) {
  let opened = false,
    active = null,
    changedAt = 0;
  const buttons = menuActions.map((action, index) => {
    const button = document.createElement("button");
    button.className = "action";
    button.dataset.action = action.id;
    button.setAttribute("aria-label", action.label);
    if (action.id === "auto-explain")
      button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${action.icon}"/></svg><span class="caption"><strong>${action.label}</strong><span>${action.description}</span></span>`;
    button.addEventListener("pointerenter", () => {
      active = index;
    });
    button.addEventListener("pointerleave", () => {
      if (active === index) active = null;
    });
    button.addEventListener("click", () => onAction(action.id));
    host.append(button);
    return button;
  });
  return {
    buttons,
    toggleAuto(value) {
      buttons[4].setAttribute("aria-pressed", String(value));
    },
    draw(now, open, anchor) {
      if (open !== opened) {
        opened = open;
        changedAt = now;
        if (!open) active = null;
      }
      const compact = innerHeight < 600 || anchor.y < 450;
      buttons.forEach((button, i) => {
        const row = compact ? Math.floor(i / 2) : i;
        const right = Math.max(
          Math.min(compact ? 470 : 220, innerWidth - 30),
          Math.min(innerWidth - 30, anchor.x - 28),
        );
        const x = compact && i % 2 === 1 ? right - 250 : right;
        const y = anchor.y - 100 - row * 48;
        button.style.right = `${innerWidth - x - 22}px`;
        button.style.top = `${Math.max(8, y - 22)}px`;
        button.classList.toggle("expanded", active === i && open);
        const delay = (open ? i : 7 - i) * 32,
          elapsed = now - changedAt - delay;
        const q = Math.max(0, Math.min(1, elapsed / 240));
        const spring = 1 - Math.exp(-q * 7) * Math.cos(q * 10);
        const scale = open
          ? elapsed < 0
            ? 0
            : Math.min(1.07, spring)
          : elapsed < 0
            ? 1
            : 1 - q;
        button.style.transform = `scale(${Math.max(0, scale)})`;
        button.style.opacity = String(open ? Math.min(1, q * 4) : 1 - q);
        button.inert = scale < 0.2 || !open;
        button.style.visibility = scale <= 0 ? "hidden" : "visible";
      });
    },
    regions() {
      return buttons.filter((b) => !b.inert).flatMap(bubbleRegions);
    },
  };
}
