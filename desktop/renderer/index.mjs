import { mountBlink } from "../character/index.mjs";
import { createActivityState } from "../character/activity.mjs";
import { BlinkState, spring } from "../character/state.mjs";
import { scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
const api = window.blinkling;
const surface = new URLSearchParams(location.search).get("surface") ?? "blink";
const state = new BlinkState();
const activity = createActivityState();
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
const permission = document.querySelector("#permission-alert");
const autoBadge = document.querySelector("#auto-badge");
permission.addEventListener("click", () => api.action("chat"));
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
    new CustomEvent("blinkling:action-result", {
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
      ready: api.shell({
        type: "drag-start",
        anchor: { x: current.x, y: current.y },
      }),
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
    const area = shell.position.area;
    if (!current)
      current = { x: target.x, y: target.y, vx: 0, vy: 0, alpha: 0.4, va: 0 };
    for (const [key, vkey, t] of [
      ["x", "vx", target.x],
      ["y", "vy", target.y],
      ["alpha", "va", revealed ? 1 : 0.4],
    ]) {
      const q =
        shell.drag && key !== "alpha"
          ? { value: t, velocity: 0 }
          : spring(
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
    const session = activity.read(now);
    host.dataset.expression = session.expression;
    character.pose(now / 1000, {
      mode: state.mode,
      waveAt,
      dropAt,
      velocity: shell.drag?.velocity ?? 0,
      talking: session.talking,
      expression: session.expression,
      connection: session.connection,
      edge: shell.position.edge,
      hanging: state.mode === "peek" && shell.position.edge === "top",
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
    permission.hidden =
      session.expression !== "permission" ||
      shell.chatOpen ||
      state.mode === "drag";
    permission.style.left = `${Math.max(8, Math.min(innerWidth - 188, current.x - 90))}px`;
    permission.style.top = `${Math.max(8, Math.min(innerHeight - 52, current.y - 120))}px`;
    // Auto explain stays visible on Blink itself, above the head, while on.
    autoBadge.hidden = !shell.autoExplain;
    autoBadge.style.left = `${Math.max(area.x + 4, Math.min(area.x + area.width - 100, current.x - 40))}px`;
    autoBadge.style.top = `${Math.max(area.y + 4, current.y - 168)}px`;
    const polygons = [...character.polygons(), ...menu.polygons()];
    if (!permission.hidden) {
      const r = permission.getBoundingClientRect();
      polygons.push(roundedRect(r.x, r.y, r.width, r.height, 20));
    }
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
      window.dispatchEvent(new CustomEvent("blinkling:recall-answer"));
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
    new CustomEvent("blinkling:shell-event", { detail: event }),
  );
});
api.onEvent((event) => {
  activity.accept(event, performance.now());
  messages.accept(event);
  window.dispatchEvent(
    new CustomEvent("blinkling:session-event", { detail: event }),
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
  inspect: () => ({
    mode: state.mode,
    anchor: current ? { x: current.x, y: current.y - 62 } : null,
    activity: activity.read(performance.now()),
    shell: {
      ...shell,
      displayId: shell.display.id,
      workArea: shell.display.workArea,
      edge: shell.position.edge,
    },
  }),
  metrics: () => ({
    frames: [...frameTimes].slice(20),
    work: [...workTimes].slice(20),
  }),
};
window.desktop = desktop;
window.addEventListener("pagehide", () => cancelAnimationFrame(frameId));

// Capture owns the native selection; the conversation UI owns these attachments.
window.blinkling.onEvent((event) => {
  if (event.type === "capture") desktop.composer.attach(event.capture.image);
});
document.querySelector("#blink").addEventListener("pointerdown", () => {
  void window.blinkling.action("guide-dismiss");
});
// Blink intentionally has no keyboard focus. Native pointer events carry the
// held Shift modifier even while the underlying application keeps focus.
let shiftSelection = false;
const selectWithShift = (event) => {
  if (!event.shiftKey) shiftSelection = false;
  else if (
    !shiftSelection &&
    scanlines(character.polygons(), {
      width: innerWidth,
      height: innerHeight,
    }).some(
      (region) =>
        event.clientX >= region.x &&
        event.clientX < region.x + region.width &&
        event.clientY >= region.y &&
        event.clientY < region.y + region.height,
    )
  ) {
    shiftSelection = true;
    void window.blinkling.action("region").catch(() => {});
  }
};
for (const event of ["pointerenter", "pointermove"])
  document.querySelector("#blink").addEventListener(event, selectWithShift);
document.querySelector("#blink").addEventListener("pointerleave", () => {
  shiftSelection = false;
});
