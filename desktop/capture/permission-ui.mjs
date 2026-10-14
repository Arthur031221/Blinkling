const initial = await window.captureUI.init();
for (const [id, value] of [
  ["settings-app", initial.labels.app],
  ["settings-pane", initial.labels.pane],
  ["settings-section", initial.labels.section],
])
  document.getElementById(id).textContent = value;
if (initial.labels.control === "checkbox")
  document.getElementById("toggle").classList.add("checkbox");
document.querySelector("#settings").onclick = () => window.captureUI.settings();
document.querySelector("#cancel").onclick = () => window.captureUI.cancel();
addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.captureUI.cancel();
});
