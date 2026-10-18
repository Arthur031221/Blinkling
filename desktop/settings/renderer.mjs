import { settingsText } from "./strings.mjs";
import { acceleratorFromKeyEvent, hotkeyLabel } from "./accelerator.mjs";
import { strings as safety } from "../shared/safety.mjs";
import { drawWordmark } from "../shared/draw-wordmark.mjs";
import { dragPanel } from "../shared/panel-drag.mjs";
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
// Two rows pick a key the same way: the capture hotkey and the quit key.
const rows = {
  hotkey: {
    label: $("#hotkey-label"),
    change: $("#hotkey-change"),
    note: $("#hotkey-note"),
  },
  quitKey: {
    label: $("#quit-label"),
    change: $("#quit-change"),
    note: $("#quit-note"),
  },
};
const change = rows.hotkey.change;
const start = $("#start-switch");
const costume = $("#costume-switch");
const pickRow = $("#row-pick");
const language = $("#language-select");

let t = settingsText("en");
let state = null;
let listening = null;

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

// Once, not on each render: the language changes in place, so the page renders
// again after every choice.
language.addEventListener("change", async () => {
  await apply("language", language.value);
  render();
});

function say(text, kind = "info", key = listening ?? "hotkey") {
  rows[key].note.textContent = text;
  rows[key].note.dataset.kind = kind;
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
  for (const [key, row] of Object.entries(rows)) {
    const on = listening === key;
    row.label.textContent = on
      ? t("hotkeyListening")
      : state[key]
        ? hotkeyLabel(state[key], state.platform)
        : t("hotkeyNone");
    row.label.dataset.listening = String(on);
    row.change.textContent = t("hotkeyChange");
    row.change.setAttribute("aria-pressed", String(on));
  }
  // A quit key that could not be registered has no name to show: the row says so
  // where it can be seen, and Change still picks another one.
  $("#quit-help").textContent = state.quitKey
    ? t("quitHelp", { key: hotkeyLabel(state.quitKey, state.platform) })
    : "";
  if (!state.quitKey && !rows.quitKey.note.textContent)
    say(t("quitKeyOff"), "error", "quitKey");
  start.setAttribute("aria-checked", String(state.startWithClaudeCode));
  start.setAttribute("aria-label", t("startWithClaude"));
  costume.setAttribute("aria-checked", String(state.costumeEffects));
  costume.setAttribute("aria-label", t("costumeEffects"));
  pickRow.hidden = !state.pickKeys;
  pickRow
    .querySelector("[role=radiogroup]")
    .setAttribute("aria-label", t("pickKey"));
  costume.addEventListener("click", async () => {
    await apply("costumeEffects", !state.costumeEffects);
    render();
  });
  for (const button of pickRow.querySelectorAll("[data-pick]")) {
    const name = button.dataset.pick;
    button.textContent = t(
      name === "option" ? "pickKeyOption" : "pickKeyControl",
    );
    button.setAttribute("aria-checked", String(state.pickKey === name));
  }
  language.setAttribute("aria-label", t("language"));
  language.replaceChildren(
    ...[{ code: "system", name: t("languageSystem") }, ...state.languages].map(
      ({ code, name }) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = name;
        option.selected = code === state.language;
        return option;
      },
    ),
  );
  $("#about-version").textContent = t("version", { version: state.version });
  $("[data-safety]").textContent = (safety[state.locale] ?? safety.en).safety;
}

async function apply(key, value) {
  const result = await api.set(key, value);
  state = result.state;
  t = settingsText(state.locale);
  return result;
}

const reasons = {
  invalid: "hotkeyInvalid",
  clash: "hotkeyClash",
  unavailable: "hotkeyUnavailable",
};

function stopListening() {
  listening = null;
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
  const key = listening;
  const result = await apply(key, accelerator);
  stopListening();
  say(
    result.ok ? t("hotkeySaved") : t(reasons[result.reason] ?? "hotkeyInvalid"),
    result.ok ? "info" : "error",
    key,
  );
}

for (const [key, row] of Object.entries(rows))
  row.change.addEventListener("click", () => {
    const same = listening === key;
    if (listening) {
      say("");
      stopListening();
    }
    if (same) return;
    listening = key;
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
// The whole card moves the window; controls and the text to copy stay theirs.
const NO_DRAG =
  "button, a, input, textarea, select, label, code, pre, kbd, [role=button], [role=switch], [contenteditable], [data-no-drag]";
const drag = dragPanel(card, api, { ignore: NO_DRAG });
api.onOpen(({ nudge } = {}) => {
  drag.opened(nudge);
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
