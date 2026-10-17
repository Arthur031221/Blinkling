import { welcomeText, START_COMMAND } from "./strings.mjs";
import { mountBlink } from "../character/index.mjs";
import { mountPickAnimation } from "../pick/teach.mjs";
import { strings as safety } from "../shared/safety.mjs";
import { drawWordmark } from "../shared/draw-wordmark.mjs";
import { dragPanel } from "../shared/panel-drag.mjs";
import { cssVariables, duration, frameLog, timing } from "../shared/motion.mjs";

const api = window.welcomeAPI;
const log = frameLog();
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}

const $ = (selector) => document.querySelector(selector);
const card = $("#welcome");
const panels = [...document.querySelectorAll("[data-step]")];
const dots = [...document.querySelectorAll("#welcome-dots li")];
const back = $("#welcome-back");
const next = $("#welcome-next");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/** The steps that are shown: the permission step only where the system asks. */
const visible = () =>
  panels.filter(
    (panel) =>
      !(
        panel.dataset.step === "permission" && state?.permission === "unneeded"
      ),
  );
const nameOf = () => visible()[step]?.dataset.step;
let t = welcomeText("en");
let state = null;
let step = 0;
let demo = null;
let demoFor = "";
let waveAt = -100;
let frame = 0;
let copied = false;

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
  const steps = visible();
  step = Math.min(step, steps.length - 1);
  next.textContent = step === steps.length - 1 ? t("done") : t("next");
  back.hidden = step === 0;
  $("#welcome-dots").setAttribute(
    "aria-label",
    t("step", { n: step + 1, total: steps.length }),
  );
  panels.forEach((panel) => {
    const index = steps.indexOf(panel);
    panel.classList.toggle("is-current", index === step);
    panel.toggleAttribute("inert", index !== step);
    panel.setAttribute("aria-hidden", String(index !== step));
    panel.hidden = index < 0;
  });
  dots.forEach((dot, index) => {
    dot.hidden = index >= steps.length;
    dot.classList.toggle("is-current", index === step);
  });
  for (const line of document.querySelectorAll("[data-safety]"))
    line.textContent = (safety[state.locale] ?? safety.en).safety;
  $("#connect-command").textContent = START_COMMAND;
  $("#connect-copy").textContent = copied
    ? t("connectCopied")
    : t("connectCopy");
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
  step = Math.max(0, Math.min(visible().length - 1, to));
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
  if (step === visible().length - 1) api.close();
  else go(step + 1);
});
back.addEventListener("click", () => go(step - 1));
$("#connect-copy").addEventListener("click", async () => {
  // The command is also selectable by hand if the clipboard is refused.
  copied = await navigator.clipboard
    .writeText(START_COMMAND)
    .then(() => true)
    .catch(() => false);
  render();
  setTimeout(() => {
    copied = false;
    render();
  }, timing.copiedHold);
});
$("#permission-allow").addEventListener("click", () => refresh("request"));
$("#permission-open").addEventListener("click", () => refresh("open"));
$("#welcome-close").addEventListener("click", () => api.close());
// Back from System Settings: look again.
window.addEventListener("focus", () => {
  if (nameOf() === "permission") refresh();
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
const drag = dragPanel(document.querySelector(".welcome-head"), api);
api.onOpen(({ nudge } = {}) => {
  drag.opened(nudge);
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
