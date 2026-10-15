import { chooseOs, groupOf } from "./os.mjs";
import { chooseLocale, translator } from "./strings.mjs";

const radios = [...document.querySelectorAll('input[name="os"]')];
const panels = [...document.querySelectorAll("[data-panel]")];
const notes = [...document.querySelectorAll("[data-for]")];
const detected = document.querySelector("[data-detected]");
const choose = document.querySelector("[data-choose]");
const status = document.querySelector("[data-status]");
const picker = document.querySelector("[data-language]");
const SAVED = "blinkling-language";
let chosenByUser = false;
let t = translator("en");

function saved() {
  try {
    return localStorage.getItem(SAVED) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Writes the page in one language: text, labels, the title and `lang`. */
function speak(locale) {
  t = translator(locale);
  document.documentElement.lang = locale;
  picker.value = locale;
  document.title = t("title");
  document
    .querySelector('meta[name="description"]')
    .setAttribute("content", t("description"));
  for (const node of document.querySelectorAll("[data-i18n]"))
    node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll("[data-i18n-label]"))
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
}

picker.addEventListener("change", () => {
  speak(picker.value);
  try {
    localStorage.setItem(SAVED, picker.value);
  } catch {
    // A private window cannot save the choice; the page still changes.
  }
  const url = new URL(location.href);
  url.searchParams.set("lang", picker.value);
  history.replaceState(null, "", url);
});

function show(os) {
  for (const radio of radios) radio.checked = radio.value === os;
  for (const panel of panels)
    panel.classList.toggle("active", panel.dataset.panel === groupOf(os));
  for (const note of notes)
    note.hidden = !os || !note.dataset.for.split(" ").includes(os);
  choose.hidden = Boolean(os);
  detected.hidden = chosenByUser || !os;
}

for (const radio of radios)
  radio.addEventListener("change", () => {
    chosenByUser = true;
    show(radio.value);
    const url = new URL(location.href);
    url.searchParams.set("os", radio.value);
    history.replaceState(null, "", url);
  });

const facts = {
  search: location.search,
  userAgent: navigator.userAgent,
  maxTouchPoints: navigator.maxTouchPoints,
};
const explicit = new URLSearchParams(location.search).has("os");
if (explicit) chosenByUser = true;
speak(
  chooseLocale({
    search: location.search,
    saved: saved(),
    languages: navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
  }),
);
show(chooseOs(facts));

// Chromium can say whether a Mac is Apple silicon or Intel; others cannot.
if (!explicit && navigator.userAgentData?.getHighEntropyValues) {
  navigator.userAgentData
    .getHighEntropyValues(["architecture"])
    .then(({ architecture }) => {
      if (!chosenByUser) show(chooseOs({ ...facts, architecture }));
    })
    .catch(() => {});
}

const style = getComputedStyle(document.documentElement);
const hold = parseFloat(style.getPropertyValue("--motion-slow")) * 5;

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers and non-secure contexts: select the text and copy it.
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    if (!ok) throw new Error("copy failed");
  }
}

for (const button of document.querySelectorAll(".copy")) {
  let timer;
  button.addEventListener("click", async () => {
    const text = button
      .closest(".command")
      .querySelector("code")
      .textContent.replace(/\s+/g, " ")
      .trim();
    clearTimeout(timer);
    try {
      await copy(text);
      button.textContent = t("copied");
      button.classList.add("done");
      status.textContent = t("copiedStatus");
    } catch {
      status.textContent = t("copyManual");
    }
    timer = setTimeout(() => {
      button.textContent = t("copy");
      button.classList.remove("done");
      status.textContent = "";
    }, hold);
  });
}
