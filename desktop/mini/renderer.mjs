import { mountMini } from "./view.mjs";
import { t as translateMini } from "./strings.mjs";
import { t as translatePick } from "../pick/strings.mjs";
import { followShellTheme } from "../composer/theme.mjs";
import { cssVariables, duration, frameLog } from "../shared/motion.mjs";

const api = window.miniAPI;
const log = frameLog();
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}

let mini = null;
let followed = false;
let latest = null;
const root = document.getElementById("mini");

/** Frames of the appear/disappear transition, for the end-to-end frame gate. */
function watchFrames(card) {
  let running = true;
  const stop = () => (running = false);
  card.addEventListener("transitionend", stop, { once: true });
  // A safety stop in case the transition never ends (reduced motion): twice the slowest token.
  setTimeout(stop, duration.slow * 2);
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

api.onInit(({ locale, theme }) => {
  // Dark from the first frame: the card is still transparent when this lands.
  if (theme) {
    if (!followed) followed = followShellTheme();
    document.documentElement.dataset.theme = theme;
  }
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

api.onOpen(({ origin } = {}) => {
  const card = root.firstElementChild;
  if (!card) return;
  // The box grows out of Blink, which is where origin points.
  if (origin) {
    // Blink may be on another screen: the card only leans toward it.
    const lean = (value, size) => Math.min(Math.max(value - 16, 0), size);
    card.style.setProperty("--grow-x", `${lean(origin.x, card.offsetWidth)}px`);
    card.style.setProperty(
      "--grow-y",
      `${lean(origin.y, card.offsetHeight)}px`,
    );
  }
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
