import { menuLayout, menuTransform, PILL } from "./layout.mjs";
import { spring } from "../character/state.mjs";
import { roundedRect } from "../character/silhouette.mjs";
import { frameLog, springs } from "../shared/motion.mjs";
import { pickLocale, translator } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";

const definitions = [
  ["capture", "capture", "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"],
  ["guide", "guide", "M5 4l14 7-7 3-3 7z"],
  [
    "auto-explain",
    "auto",
    "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  ],
  ["settings", "settings", "M4 7h16M4 17h16M9 4v6m6 4v6"],
];
const english = translator(strings, "en");
export const menuActions = Object.freeze(
  definitions.map(([id, key]) =>
    Object.freeze({
      id,
      label: english(key),
      description: english(`${key}.hint`),
    }),
  ),
);
const AUTO = 2;
const STAGGER = 0.035;

/** The fan of four pills beside Blink. Every pill moves with transform and
 * opacity only; hovering a pill swaps it to its wide size at once and fades
 * the label in, so no layout property is ever animated. */
export function mountMenu(host, onAction, { locale } = {}) {
  const t = translator(
    strings,
    locale ??
      pickLocale(
        typeof navigator === "undefined"
          ? []
          : (navigator.languages ?? [navigator.language]),
      ),
  );
  const log = frameLog();
  host.setAttribute("role", "toolbar");
  host.setAttribute("aria-label", t("toolbar"));
  let expanded = -1,
    open = false,
    changedAt = 0,
    auto = false;
  const values = definitions.map(() => ({ value: 0, velocity: 0 }));
  const buttons = definitions.map(([id, , path], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "action-bubble action";
    b.dataset.action = id;
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span class="action-detail caption"><strong></strong><span></span></span>`;
    if (i === AUTO) {
      b.setAttribute("role", "switch");
      b.setAttribute("aria-checked", "false");
    }
    const show = () => {
      expanded = i;
    };
    const hide = () => {
      if (expanded === i) expanded = -1;
    };
    b.addEventListener("pointerenter", show);
    b.addEventListener("pointerleave", hide);
    b.addEventListener("focus", show);
    b.addEventListener("blur", hide);
    b.addEventListener("click", () => onAction(id));
    host.append(b);
    return b;
  });
  function label() {
    definitions.forEach(([, key], i) => {
      const b = buttons[i],
        on = i === AUTO && auto;
      b.dataset.on = String(on);
      b.setAttribute(
        "aria-label",
        on ? t("auto.label", { label: t("auto") }) : t(key),
      );
      b.querySelector("strong").textContent = t(key);
      b.querySelector(".action-detail > span").textContent = t(
        on ? "auto.on" : `${key}.hint`,
      );
      if (i === AUTO) b.setAttribute("aria-checked", String(on));
    });
  }
  label();
  let rects = [];
  const widths = definitions.map(() => PILL.narrow);
  return {
    buttons,
    get expanded() {
      return expanded;
    },
    get open() {
      return open;
    },
    setOpen(value, now) {
      if (open !== value) {
        open = value;
        changedAt = now;
        expanded = -1;
      }
    },
    setAuto(value) {
      if (auto === !!value) return;
      auto = !!value;
      label();
    },
    frame(now, dt, area, anchor) {
      widths.forEach((_, i) => {
        widths[i] = i === expanded ? PILL.wide : PILL.narrow;
      });
      rects = menuLayout(area, anchor, expanded, widths);
      let shown = null;
      buttons.forEach((b, i) => {
        const order = open ? i : buttons.length - 1 - i,
          target =
            now - changedAt >= order * STAGGER
              ? open
                ? 1
                : 0
              : values[i].value;
        values[i] = spring(
          values[i].value,
          target,
          values[i].velocity,
          dt,
          springs.crisp,
        );
        const q = values[i].value,
          r = rects[i],
          pose = menuTransform(area, anchor, r, q);
        if (b.style.width !== `${r.width}px`) b.style.width = `${r.width}px`;
        b.style.transform = `translate(${r.x + pose.x}px,${r.y + pose.y}px) scale(${pose.scale})`;
        b.style.opacity = String(Math.min(1, q));
        b.style.visibility = q > 0.015 ? "visible" : "hidden";
        b.style.pointerEvents = q > 0.8 ? "auto" : "none";
        b.inert = !open || q <= 0.8;
        b.classList.toggle("expanded", i === expanded);
        b.classList.toggle("from-left", r.direction > 0);
        if (q > 0.015) {
          const x = r.x + pose.x,
            y = r.y + pose.y;
          shown = shown
            ? {
                x: Math.min(shown.x, x),
                y: Math.min(shown.y, y),
                right: Math.max(shown.right, x + r.width),
                bottom: Math.max(shown.bottom, y + r.height),
              }
            : { x, y, right: x + r.width, bottom: y + r.height };
        }
      });
      if (shown)
        log("fan", {
          x: shown.x,
          y: shown.y,
          width: shown.right - shown.x,
          height: shown.bottom - shown.y,
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
    /** Close at once, with no animation: used when Blink is picked up or
     * dropped so no pill is left behind at the old spot. */
    collapse() {
      open = false;
      expanded = -1;
      values.forEach((v, i) => {
        values[i] = { value: 0, velocity: 0 };
        buttons[i].style.visibility = "hidden";
        buttons[i].style.pointerEvents = "none";
        buttons[i].style.opacity = "0";
        buttons[i].inert = true;
      });
    },
  };
}
