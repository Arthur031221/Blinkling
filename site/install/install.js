import { chooseOs, groupOf } from "./os.mjs";

const radios = [...document.querySelectorAll('input[name="os"]')];
const panels = [...document.querySelectorAll("[data-panel]")];
const notes = [...document.querySelectorAll("[data-for]")];
const detected = document.querySelector("[data-detected]");
const choose = document.querySelector("[data-choose]");
const status = document.querySelector("[data-status]");
let chosenByUser = false;

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
if (explicit) detected.textContent = "";
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
      button.textContent = "Copied";
      button.classList.add("done");
      status.textContent = "Copied to the clipboard.";
    } catch {
      status.textContent = "Select the line and copy it.";
    }
    timer = setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("done");
      status.textContent = "";
    }, hold);
  });
}
