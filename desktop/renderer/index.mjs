import { mountBlink } from "../character/index.mjs";
import { BlinkState, spring } from "../character/state.mjs";
import { scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
const api = window.glimpselet;
const surface = new URLSearchParams(location.search).get("surface") ?? "blink";
const state = new BlinkState();
let shell = await api.shell({ type: "state" });
const composer = createComposer(),
  messages = createMessageStream();
let character = null,
  menu = null,
  frameId = 0,
  last = performance.now(),
  waveAt = -100,
  dropAt = -100,
  current = null,
  dragPointer = null,
  dragStarting = false;
const pin = document.querySelector("#pin"),
  host = document.querySelector("#blink"),
  card = document.querySelector("#chat-card");
const frameTimes = [],
  workTimes = [];
function accept(value) {
  if (
    value.display.id !== shell.display.id ||
    value.display.bounds.width !== shell.display.bounds.width ||
    value.display.bounds.height !== shell.display.bounds.height
  )
    current = null;
  if (value.chatOpen && !shell.chatOpen) {
    state.openChat();
    if (surface === "composer") {
      card.style.animation = "none";
      void card.offsetHeight;
      card.style.animation = "";
    }
  }
  shell = value;
  document.documentElement.dataset.edge = shell.position.edge;
  document.documentElement.dataset.theme = shell.theme;
  state.pinned = shell.pinned;
  state.chatOpen = shell.chatOpen;
  document
    .querySelectorAll('[aria-label="釘選對話"]')
    .forEach((b) => b.setAttribute("aria-pressed", String(shell.pinned)));
  menu?.setAuto(shell.autoExplain);
}
accept(shell);
async function action(id) {
  const result = await api.action(id);
  if (result.ok && id !== "auto-explain") {
    state.hover(false, performance.now());
  }
  window.dispatchEvent(
    new CustomEvent("glimpselet:action-result", {
      detail: { action: id, ...result },
    }),
  );
}
function pinChat() {
  return api.shell({ type: "pin", value: !shell.pinned });
}
if (surface === "composer") {
  host.remove();
  document.querySelector("#menu").remove();
  pin.remove();
  card.hidden = false;
  document.querySelector("#chat-pin").addEventListener("click", pinChat);
  document
    .querySelector("#chat-close")
    .addEventListener("click", () => api.shell({ type: "close-chat" }));
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") api.shell({ type: "close-chat" });
    else api.shell({ type: "activity" });
  });
  addEventListener("input", () => api.shell({ type: "activity" }));
  // The composer bucket mounts its complete input/message UI into these stable slots.
} else {
  card.remove();
  character = mountBlink(host);
  menu = mountMenu(document.querySelector("#menu"), action);
  pin.addEventListener("click", pinChat);
  host.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragPointer = {
      id: event.pointerId,
      x: event.screenX,
      y: event.screenY,
      moved: false,
      ready: api.shell({ type: "drag", phase: "start" }),
    };
    host.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  host.addEventListener("pointermove", async (event) => {
    if (
      !dragPointer ||
      dragStarting ||
      dragPointer.moved ||
      Math.hypot(event.screenX - dragPointer.x, event.screenY - dragPointer.y) <
        4
    )
      return;
    dragPointer.moved = true;
    dragStarting = true;
    state.startDrag();
    menu.setOpen(false, performance.now() / 1000);
    host.dataset.drag = "true";
    try {
      await dragPointer.ready;
    } finally {
      dragStarting = false;
      if (!dragPointer) await api.shell({ type: "drag", phase: "end" });
    }
  });
  async function release(event) {
    if (!dragPointer) return;
    const moved = dragPointer.moved;
    const ready = dragPointer.ready;
    dragPointer = null;
    host.dataset.drag = "false";
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    await ready;
    if (moved) {
      if (!dragStarting)
        accept(await api.shell({ type: "drag", phase: "end" }));
      dropAt = performance.now() / 1000;
      state.drop(performance.now());
    } else {
      await api.shell({ type: "drag", phase: "end" });
      await api.shell({ type: "visibility", value: true });
    }
  }
  host.addEventListener("pointerup", release);
  host.addEventListener("pointercancel", release);
  function frame(now) {
    const began = performance.now(),
      dt = (now - last) / 1000;
    frameTimes.push(now - last);
    if (frameTimes.length > 600) frameTimes.shift();
    last = now;
    const was = state.mode;
    state.tick(now);
    if (
      state.mode === "peek" &&
      was !== "peek" &&
      !state.pinned &&
      shell.chatOpen
    )
      api.shell({ type: "visibility", value: false });
    const revealed = state.mode !== "peek",
      target =
        shell.drag ?? (revealed ? shell.position.reveal : shell.position.peek);
    const area = shell.position.area,
      rows = area.height < 610 ? 4 : 8;
    const adjusted = { ...target };
    if (revealed && !shell.drag)
      adjusted.y = Math.max(
        target.y,
        Math.min(area.y + area.height - 18, area.y + rows * 51 + 156),
      );
    if (!current)
      current = { x: target.x, y: target.y, vx: 0, vy: 0, alpha: 0.4, va: 0 };
    for (const [key, vkey, t] of [
      ["x", "vx", adjusted.x],
      ["y", "vy", adjusted.y],
      ["alpha", "va", revealed ? 1 : 0.4],
    ]) {
      const q = spring(
        current[key],
        t,
        current[vkey],
        dt,
        key === "alpha" ? 16 : 18,
      );
      current[key] = q.value;
      current[vkey] = q.velocity;
      if (key === "alpha" && Math.abs(q.value - t) < 0.005) {
        current[key] = t;
        current[vkey] = 0;
      }
    }
    host.style.transform = `translate(${current.x - 74}px,${current.y - 142}px)`;
    host.style.opacity = String(current.alpha);
    host.dataset.mode = state.mode;
    character.pose(now / 1000, {
      mode: state.mode,
      waveAt,
      dropAt,
      velocity: shell.drag?.velocity ?? 0,
      talking: desktop.talking,
    });
    menu.setOpen(
      revealed &&
        state.mode !== "drag" &&
        state.mode !== "drop" &&
        !shell.chatOpen,
      now / 1000,
    );
    menu.frame(now / 1000, dt, area, current);
    const pinX = Math.max(
        area.x + 4,
        Math.min(
          area.x + area.width - 36,
          current.x + (shell.position.edge === "left" ? 66 : -96),
        ),
      ),
      pinY = Math.max(
        area.y + 4,
        Math.min(area.y + area.height - 36, current.y - 34),
      );
    pin.style.left = `${pinX}px`;
    pin.style.top = `${pinY}px`;
    const showPin = revealed && !shell.chatOpen && state.mode !== "drag";
    pin.style.opacity = String(showPin ? 1 : 0);
    pin.style.visibility = showPin ? "visible" : "hidden";
    const polygons = [...character.polygons(), ...menu.polygons()];
    if (showPin) {
      const r = pin.getBoundingClientRect();
      polygons.push(roundedRect(r.x, r.y, r.width, r.height, 16));
    }
    api.interactive(
      scanlines(polygons, { width: innerWidth, height: innerHeight }),
    );
    workTimes.push(performance.now() - began);
    if (workTimes.length > 600) workTimes.shift();
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
}
api.onShell((event) => {
  if (event.type === "state") {
    const dragging = !!shell.drag;
    accept(event.state);
    if (!dragging && shell.drag) state.startDrag();
    if (dragging && !shell.drag) {
      dropAt = performance.now() / 1000;
      state.drop(performance.now());
    }
  }
  if (event.type === "cursor" && surface === "blink") {
    const before = state.over;
    state.hover(event.hit, performance.now());
    if (event.hit && !before) {
      waveAt = performance.now() / 1000;
      window.dispatchEvent(new CustomEvent("glimpselet:recall-answer"));
    }
  }
  if (event.type === "chat-blur") state.hover(false, performance.now());
  if (event.type === "chat-activity") state.activity(performance.now());
  if (event.type === "focus-composer")
    document.querySelector("#composer-input")?.focus();
  if (event.type === "capture") {
    composer.attach(event.capture.image);
    const image = document.createElement("img");
    image.src = `data:${event.capture.image.mediaType};base64,${event.capture.image.data}`;
    image.alt = event.capture.image.name;
    document.querySelector("#attachments")?.append(image);
  }
  if (event.type === "view" && surface === "composer") {
    const container = document.querySelector("#messages");
    container.classList.add("view-help");
    container.textContent =
      event.view === "help"
        ? "滑過 Blink 打開動作。拖曳到螢幕邊緣，或釘選對話。"
        : "釘選讓對話保持開啟。拖曳 Blink 會記住每個螢幕的位置。";
  }
  window.dispatchEvent(
    new CustomEvent("glimpselet:shell-event", { detail: event }),
  );
});
api.onEvent((event) => {
  messages.append(event);
  window.dispatchEvent(
    new CustomEvent("glimpselet:session-event", { detail: event }),
  );
});
export const desktop = {
  character,
  menuActions,
  messages,
  composer,
  get shell() {
    return shell;
  },
  state,
  talking: false,
  metrics: () => ({
    frames: [...frameTimes].slice(20),
    work: [...workTimes].slice(20),
  }),
};
window.addEventListener("pagehide", () => cancelAnimationFrame(frameId));
