import { mountMini } from "./view.mjs";
import { t as translateMini } from "./strings.mjs";
import { t as translatePick } from "../pick/strings.mjs";
import { cssVariables, frameLog } from "../shared/motion.mjs";

const api = window.miniAPI;
const log = frameLog();
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim()) document.documentElement.style.setProperty(name.trim(), value.trim());
}

let mini = null;
let latest = null;
const root = document.getElementById("mini");

/** Frames of the appear/disappear transition, for the end-to-end frame gate. */
function watchFrames(card) {
  let running = true;
  const stop = () => (running = false);
  card.addEventListener("transitionend", stop, { once: true });
  setTimeout(stop, 600);
  const frame = () => {
    log("mini-composer", card.getBoundingClientRect());
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function report() {
  const card = root.firstElementChild;
  if (card) api.size(Math.ceil(card.offsetHeight) + 32);
}

api.onInit(({ locale }) => {
  mini = mountMini(root, {
    t: translateMini(locale),
    tp: translatePick(locale),
    on: {
      input: (text) => {
        api.input(text);
        autoGrow();
      },
      submit: () => api.submit(),
      chip: (id) => api.chip(id),
      remove: (id) => api.remove(id),
      offer: (id) => api.offer(id),
      escape: () => api.escape(),
    },
  });
  if (latest) mini.update(latest);
});

function autoGrow() {
  const input = mini?.input;
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  report();
}

api.onView((view) => {
  latest = view;
  mini?.update(view);
  report();
});

api.onOpen(() => {
  const card = root.firstElementChild;
  if (!card) return;
  mini.input.value = "";
  mini.input.focus();
  report();
  watchFrames(card);
  requestAnimationFrame(() => card.classList.add("is-open"));
});

api.onClose(() => {
  const card = root.firstElementChild;
  if (!card) return;
  watchFrames(card);
  card.classList.remove("is-open");
});
