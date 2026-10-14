// Window surface only. The composer/message bucket owns the contents and turns.
const pin = document.querySelector("#pin");
let shell = await window.glimpselet.shell({ type: "state" });
const render = () => pin.setAttribute("aria-pressed", String(shell.pinned));
render();
pin.addEventListener("click", async () => {
  shell = await window.glimpselet.shell({ type: "pin", value: !shell.pinned });
  render();
});
document
  .querySelector("#close")
  .addEventListener("click", () =>
    window.glimpselet.shell({ type: "close-chat" }),
  );
window.glimpselet.onShell((event) => {
  if (event.type === "state") {
    if (event.state.chatOpen && !shell.chatOpen)
      document.querySelector("#card").animate(
        [
          { opacity: 0, transform: "translateY(12px) scale(0.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 280, easing: "cubic-bezier(0.2, 0.85, 0.25, 1.15)" },
      );
    shell = event.state;
    render();
  }
});
addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.glimpselet.shell({ type: "close-chat" });
});
// Renderer feature integration: stable slots and a typed window action/event API.
window.dispatchEvent(new CustomEvent("glimpselet:card-ready"));
