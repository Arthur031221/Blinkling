import { settingsText } from "./strings.mjs";
import { acceleratorFromKeyEvent, hotkeyLabel } from "./accelerator.mjs";
import { strings as safety } from "../shared/safety.mjs";
import { drawWordmark } from "../shared/draw-wordmark.mjs";
import { cssVariables, duration, frameLog } from "../shared/motion.mjs";

const api = window.settingsAPI;
const log = frameLog();
for (const declaration of cssVariables().split(";")) {
  const [name, value] = declaration.split(/:(.+)/);
  if (name?.trim())
    document.documentElement.style.setProperty(name.trim(), value.trim());
}

const $ = (selector) => document.querySelector(selector);
const card = $("#settings");
const label = $("#hotkey-label");
const change = $("#hotkey-change");
const note = $("#hotkey-note");
const start = $("#start-switch");
const pickRow = $("#row-pick");

let t = settingsText("en");
let state = null;
let listening = false;

/** Frames of the appear/disappear transition, for the end-to-end frame gate. */
function watchFrames() {
  let running = true;
  const stop = () => (running = false);
  card.addEventListener("transitionend", stop, { once: true });
  setTimeout(stop, duration.slow * 2);
  const frame = () => {
    log("settings", card.getBoundingClientRect());
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function say(text, kind = "info") {
  note.textContent = text;
  note.dataset.kind = kind;
}

function render() {
  if (!state) return;
  document.documentElement.lang = state.locale;
  $("#settings-title").textContent = t("title");
  const close = $("#settings-close");
  close.textContent = "×";
  close.setAttribute("aria-label", t("close"));
  for (const element of document.querySelectorAll("[data-text]"))
    element.textContent = t(element.dataset.text);
  label.textContent = listening
    ? t("hotkeyListening")
    : hotkeyLabel(state.hotkey, state.platform);
  label.dataset.listening = String(listening);
  change.textContent = t("hotkeyChange");
  change.setAttribute("aria-pressed", String(listening));
  start.setAttribute("aria-checked", String(state.startWithClaudeCode));
  start.setAttribute("aria-label", t("startWithClaude"));
  pickRow.hidden = !state.pickKeys;
  pickRow.querySelector("[role=radiogroup]").setAttribute("aria-label", t("pickKey"));
  for (const button of pickRow.querySelectorAll("[data-pick]")) {
    const name = button.dataset.pick;
    button.textContent = t(name === "option" ? "pickKeyOption" : "pickKeyControl");
    button.setAttribute("aria-checked", String(state.pickKey === name));
  }
  $("#about-version").textContent = t("version", { version: state.version });
  $("[data-safety]").textContent = (safety[state.locale] ?? safety.en).safety;
}

async function apply(key, value) {
  const result = await api.set(key, value);
  state = result.state;
  return result;
}

const reasons = {
  invalid: "hotkeyInvalid",
  clash: "hotkeyClash",
  unavailable: "hotkeyUnavailable",
};

function stopListening() {
  listening = false;
  document.removeEventListener("keydown", onCapture, true);
  render();
}

async function onCapture(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.code === "Escape") {
    say("");
    return stopListening();
  }
  const accelerator = acceleratorFromKeyEvent(event, state.platform);
  if (!accelerator) return; // a modifier on its own: keep listening
  const result = await apply("hotkey", accelerator);
  stopListening();
  say(result.ok ? t("hotkeySaved") : t(reasons[result.reason] ?? "hotkeyInvalid"), result.ok ? "info" : "error");
}

change.addEventListener("click", () => {
  if (listening) {
    say("");
    return stopListening();
  }
  listening = true;
  say("");
  document.addEventListener("keydown", onCapture, true);
  render();
});
start.addEventListener("click", async () => {
  await apply("startWithClaudeCode", !state.startWithClaudeCode);
  render();
});
for (const button of pickRow.querySelectorAll("[data-pick]"))
  button.addEventListener("click", async () => {
    await apply("pickKey", button.dataset.pick);
    render();
  });
for (const button of document.querySelectorAll("[data-help]"))
  button.addEventListener("click", () => api.help(button.dataset.help));
$("#settings-close").addEventListener("click", () => api.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !listening) api.close();
});

api.onState((next) => {
  state = next;
  t = settingsText(next.locale);
  render();
});
api.onOpen(() => {
  say("");
  requestAnimationFrame(() => {
    card.classList.add("is-open");
    watchFrames();
    change.focus({ preventScroll: true });
  });
});
api.onClose(() => {
  if (listening) stopListening();
  card.classList.remove("is-open");
  watchFrames();
});

drawWordmark($("[data-wordmark]"));
api.ready().then((next) => {
  if (!next) return;
  state = next;
  t = settingsText(next.locale);
  render();
});
