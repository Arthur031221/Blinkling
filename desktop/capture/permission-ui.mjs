import { cssVariables } from "../shared/motion.mjs";
import { dragPanel } from "../shared/panel-drag.mjs";

document.documentElement.style.cssText += cssVariables();
const initial = await window.captureUI.init();
document.documentElement.lang = initial.locale;
document.title = initial.text.permissionTitle;
const put = (id, value) => (document.getElementById(id).textContent = value);
put("lead", initial.text.permissionLead);
put("settings", initial.text.openSettings);
put("cancel", initial.text.cancel);
put("settings-app", initial.labels.app);
put("settings-pane", initial.labels.pane);
put("settings-section", initial.labels.section);
document
  .getElementById("demo")
  .setAttribute("aria-label", initial.text.permissionDemo);
if (initial.labels.control === "checkbox")
  document.getElementById("toggle").classList.add("checkbox");
document.querySelector("#settings").onclick = () => window.captureUI.settings();
document.querySelector("#cancel").onclick = () => window.captureUI.cancel();
addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.captureUI.cancel();
});
// The whole window moves; the buttons keep their clicks.
dragPanel(document.querySelector("main"), window.captureUI, {
  ignore: "button, a, [role=button]",
});
