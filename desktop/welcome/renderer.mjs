import { welcomeText } from "./strings.mjs";
import { mountBlink } from "../character/index.mjs";
import { mountPickAnimation } from "../pick/teach.mjs";
import { strings as safety } from "../shared/safety.mjs";
import { drawWordmark } from "../shared/draw-wordmark.mjs";
import { cssVariables, duration, frameLog } from "../shared/motion.mjs";

const api = window.welcomeAPI;
const log = frameLog();
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}

const $ = (selector) => document.querySelector(selector);
const card = $("#welcome");
const steps = [...document.querySelectorAll("[data-step]")];
const dots = [...document.querySelectorAll("#welcome-dots li")];
const back = $("#welcome-back");
const next = $("#welcome-next");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

let t = welcomeText("en");
let state = null;
let step = 0;
let demo = null;
let demoFor = "";
let waveAt = -100;
let frame = 0;

const blink = mountBlink($("#blink-host"));

/** Blink waves on the first step: once when it shows, then now and again. Under
 * reduced motion the raised hand is held still instead. */
function animate(now) {
  const seconds = now / 1000;
  if (step === 0 && !reduced.matches && seconds - waveAt > 4.5)
    waveAt = seconds;
  blink.pose(seconds, {
    waveAt: reduced.matches ? seconds - 0.6 : waveAt,
    face: "idle",
  });
  frame = requestAnimationFrame(animate);
}

function watchFrames() {
  let running = true;
  const stop = () => (running = false);
  card.addEventListener("transitionend", stop, { once: true });
  setTimeout(stop, duration.slow * 2);
  const tick = () => {
    log("welcome", card.getBoundingClientRect());
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function permissionLines() {
  const status = state.permission;
  const body = $("#permission-body");
  const line = $("#permission-status");
  body.textContent =
    status === "unneeded" ? t("permissionNone") : t("permissionBody");
  line.textContent = status === "granted" ? t("permissionOn") : "";
  line.hidden = status !== "granted";
  $("#permission-allow").hidden = status !== "not-determined";
  $("#permission-open").hidden = status === "granted" || status === "unneeded";
}

function render() {
  if (!state) return;
  document.documentElement.lang = state.locale;
  for (const element of document.querySelectorAll("[data-text]"))
    element.textContent = t(element.dataset.text);
  const close = $("#welcome-close");
  close.textContent = "×";
  close.setAttribute("aria-label", t("close"));
  $("#try-title").textContent = t("tryTitle", { key: state.keyName });
  $("#try-body").textContent = t("tryBody", { key: state.keyName });
  next.textContent = step === steps.length - 1 ? t("done") : t("next");
  back.hidden = step === 0;
  $("#welcome-dots").setAttribute("aria-label", t("step", { n: step + 1 }));
  steps.forEach((panel, index) => {
    panel.classList.toggle("is-current", index === step);
    panel.toggleAttribute("inert", index !== step);
    panel.setAttribute("aria-hidden", String(index !== step));
  });
  dots.forEach((dot, index) =>
    dot.classList.toggle("is-current", index === step),
  );
  $("[data-safety]").textContent = (safety[state.locale] ?? safety.en).safety;
  permissionLines();
  // Mounted once per key and language, so a re-render never restarts the loop.
  const shown = `${state.keyName}|${state.locale}`;
  if (shown !== demoFor) {
    demo?.destroy();
    demoFor = shown;
    demo = mountPickAnimation($("#pick-host"), {
      keyName: state.keyName,
      dragLabel: t("drag"),
    });
  }
}

function go(to) {
  step = Math.max(0, Math.min(steps.length - 1, to));
  if (step === 0) waveAt = performance.now() / 1000;
  render();
}

async function refresh(action = "refresh") {
  const status = await api.permission(action);
  if (status && state) {
    state = { ...state, permission: status };
    render();
  }
}

next.addEventListener("click", () => {
  if (step === steps.length - 1) api.close();
  else go(step + 1);
});
back.addEventListener("click", () => go(step - 1));
$("#permission-allow").addEventListener("click", () => refresh("request"));
$("#permission-open").addEventListener("click", () => refresh("open"));
$("#welcome-close").addEventListener("click", () => api.close());
// Back from System Settings: look again.
window.addEventListener("focus", () => {
  if (step === 1) refresh();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") api.close();
});

function adopt(next) {
  state = next;
  t = welcomeText(next.locale);
  render();
}
api.onState(adopt);
api.onOpen(() => {
  step = 0;
  waveAt = performance.now() / 1000;
  render();
  requestAnimationFrame(() => {
    card.classList.add("is-open");
    watchFrames();
    next.focus({ preventScroll: true });
  });
});
api.onClose(() => {
  card.classList.remove("is-open");
  watchFrames();
});

drawWordmark($("[data-wordmark]"));
api.ready().then((first) => first && adopt(first));
frame = requestAnimationFrame(animate);
addEventListener("pagehide", () => cancelAnimationFrame(frame));
