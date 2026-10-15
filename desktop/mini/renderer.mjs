/** The mini composer's page: draws the state main sends and forwards clicks
 * and keys. It opens with a short lift-and-fade (transform and opacity only)
 * and logs a frame for every paint of it. */
import { duration, easing, frameLog } from "../shared/motion.mjs";

const $ = (id) => document.getElementById(id);
const mini = $("mini"),
  pause = $("pause"),
  picks = $("picks"),
  offers = $("offers"),
  chips = $("chips"),
  line = $("line"),
  error = $("error");
const frame = frameLog();
const LIFT = 8;
let wasOpen = false;
let text = { pauseAuto: "", inputLabel: "", remove: "" };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function button(label, onClick, className = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function track(animation) {
  let running = true;
  const tick = () => {
    if (!running) return;
    frame("mini-composer", mini.getBoundingClientRect());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  animation.finished.finally(() => {
    running = false;
  });
}

function appear() {
  const keyframes = reduced()
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: `translate3d(0, ${LIFT}px, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ];
  const run = mini.animate(keyframes, {
    duration: reduced() ? duration.fast : duration.base,
    easing: easing.enter,
  });
  track(run);
}

function render(state) {
  text = state.text;
  mini.dataset.open = String(state.open);
  pause.hidden = !state.pause;
  pause.textContent = text.pauseAuto;
  line.setAttribute("aria-label", text.inputLabel);
  if (line.value !== state.draft) line.value = state.draft;

  picks.replaceChildren(
    ...state.picks.flatMap((p) => {
      const image = document.createElement("li");
      image.className = "pick";
      image.dataset.kind = p.kind;
      const img = document.createElement("img");
      img.alt = "";
      img.src = `data:image/png;base64,${p.image.data}`;
      image.append(img, button("×", () => window.mini.remove(p.id)));
      image.lastChild.setAttribute("aria-label", text.remove);
      const items = [image];
      if (p.textChip) {
        const t = document.createElement("li");
        t.className = "pick text";
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = p.textChip;
        t.append(label);
        items.push(t);
      }
      return items;
    }),
  );
  offers.replaceChildren(
    ...state.offers.map((o) => {
      const li = document.createElement("li");
      li.className = "offer";
      li.dataset.offer = o.id;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = o.label;
      li.append(
        label,
        button(o.action, () => window.mini.offer(o.id), "go"),
        button(o.dismiss, () => window.mini.dismiss(o.id)),
      );
      return li;
    }),
  );
  chips.replaceChildren(
    ...state.chips.map((c) => {
      const b = button(c.label, () => window.mini.chip(c.id));
      b.dataset.chip = c.id;
      b.dataset.highlighted = String(c.highlighted);
      return b;
    }),
  );
  chips.hidden = !state.chips.length;
  error.hidden = !state.error;
  error.textContent = state.error;
  if (state.open && !wasOpen) {
    appear();
    line.focus();
  }
  wasOpen = state.open;
  const box = mini.getBoundingClientRect();
  window.mini.size(Math.ceil(box.width) + 24, Math.ceil(box.height) + 24);
}

pause.addEventListener("click", () => window.mini.pause());
line.addEventListener("input", () => window.mini.input(line.value));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" || (e.key === "Enter" && e.target === line)) {
    e.preventDefault();
    window.mini.key(e.key, e.shiftKey);
  }
});
window.mini.onState(render);
window.mini.ready();
