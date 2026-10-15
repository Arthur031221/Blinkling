import { mountBlink } from "../character/index.mjs";
import { createActivityState } from "../character/activity.mjs";
import { BlinkState, spring } from "../character/state.mjs";
import { scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
import { createGesture } from "../character/gesture.mjs";
import { createDwell } from "../menu/dwell.mjs";
import { frameLog, cssVariables, springs } from "../shared/motion.mjs";
import { pickLocale, translator } from "../shared/i18n.mjs";
import { strings } from "./strings.mjs";
const api = window.blinkling;
const locale = pickLocale(navigator.languages ?? [navigator.language]);
const t = translator(strings, locale);
document.documentElement.lang = locale;
document.documentElement.style.cssText = cssVariables();
const state = new BlinkState();
const activity = createActivityState();
let shell = await api.shell({ type: "state" });
const composer = createComposer(),
  messages = createMessageStream();
const log = frameLog();
let character = null,
  menu = null,
  frameId = 0,
  last = performance.now(),
  waveAt = -100,
  dropAt = -100,
  catchAt = -100,
  current = null,
  dragPointer = null,
  dragStarting = false;
const host = document.querySelector("#blink"),
  permission = document.querySelector("#permission-alert"),
  hint = document.querySelector("#hint");
permission.textContent = t("permission");
permission.setAttribute("aria-label", t("permission"));
permission.addEventListener("click", () => api.shell({ type: "click" }));
const frameTimes = [],
  workTimes = [];
function accept(value) {
  if (
    value.display.id !== shell.display.id ||
    value.display.bounds.width !== shell.display.bounds.width ||
    value.display.bounds.height !== shell.display.bounds.height
  )
    current = null;
  if (value.chatOpen && !shell.chatOpen) state.openChat();
  shell = value;
  document.documentElement.dataset.edge = shell.position.edge;
  document.documentElement.dataset.theme = shell.theme;
  state.pinned = shell.pinned;
  state.chatOpen = shell.chatOpen;
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
character = mountBlink(host);
menu = mountMenu(document.querySelector("#menu"), action, { locale });
menu.setAuto(shell.autoExplain);
const gesture = createGesture(),
  dwell = createDwell();
// Blink picked up or put down: the fan closes at once so no pill is left at
// the old spot, and the rest timer starts over.
function closeFan() {
  menu.collapse();
  dwell.update(false, performance.now());
}
host.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0 ||
    !gesture.down({ x: event.screenX, y: event.screenY })
  )
    return;
  dragPointer = {
    id: event.pointerId,
    ready: api.shell({
      type: "drag-start",
      anchor: { x: current.x, y: current.y },
    }),
  };
  host.setPointerCapture(event.pointerId);
  event.preventDefault();
});
host.addEventListener("pointermove", async (event) => {
  if (!dragPointer || dragStarting) return;
  if (
    gesture.move({ x: event.screenX, y: event.screenY })?.type !== "drag-start"
  )
    return;
  dragStarting = true;
  state.startDrag();
  closeFan();
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
  const ready = dragPointer.ready,
    outcome = event.type === "pointercancel" ? gesture.cancel() : gesture.up();
  dragPointer = null;
  host.dataset.drag = "false";
  if (host.hasPointerCapture(event.pointerId))
    host.releasePointerCapture(event.pointerId);
  await ready;
  if (outcome?.type === "drop") {
    closeFan();
    if (!dragStarting) accept(await api.shell({ type: "drag", phase: "end" }));
    dropAt = performance.now() / 1000;
    state.drop(performance.now());
  } else {
    await api.shell({ type: "drag", phase: "end" });
    if (outcome?.type === "click") await api.shell({ type: "click" });
  }
}
host.addEventListener("pointerup", release);
host.addEventListener("pointercancel", release);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function resetTime(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    ...(sameDay ? {} : { dateStyle: "short" }),
  }).format(date);
}
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
  let moving = false;
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
            key === "alpha" ? springs.soft : springs.crisp,
          );
    current[key] = q.value;
    current[vkey] = q.velocity;
    if (Math.abs(q.value - t) < (key === "alpha" ? 0.005 : 0.1)) {
      current[key] = t;
      current[vkey] = 0;
    } else moving = true;
  }
  host.style.transform = `translate(${current.x - 74}px,${current.y - 142}px)`;
  host.style.opacity = String(current.alpha);
  host.dataset.mode = state.mode;
  if (moving)
    log("peek", {
      x: current.x - 74,
      y: current.y - 142,
      width: 148,
      height: 152,
    });
  const session = activity.read(now, { watching: shell.autoExplain });
  host.dataset.expression = session.expression;
  host.dataset.face = session.face;
  character.pose(now / 1000, {
    mode: state.mode,
    waveAt,
    dropAt,
    catchAt,
    velocity: shell.drag?.velocity ?? 0,
    talking: session.talking,
    expression: session.expression,
    face: session.face,
    peek: clamp((1 - current.alpha) / 0.6, 0, 1),
    connection: session.connection,
    edge: shell.position.edge,
    hanging: state.mode === "peek" && shell.position.edge === "top",
  });
  dwell.update(state.over && revealed, now);
  menu.setOpen(
    dwell.open &&
      revealed &&
      state.mode !== "drag" &&
      state.mode !== "drop" &&
      !shell.chatOpen,
    now / 1000,
  );
  menu.frame(now / 1000, dt, area, current);
  const attention = session.face === "permission" && !shell.chatOpen;
  permission.hidden = !attention || state.mode === "drag";
  permission.style.left = `${clamp(current.x - 90, 8, innerWidth - 188)}px`;
  permission.style.top = `${clamp(current.y - 120, 8, innerHeight - 52)}px`;
  const reset = session.detail.resetAt && resetTime(session.detail.resetAt);
  hint.hidden = !(session.face === "usage-limit" && state.over) || !!shell.drag;
  if (!hint.hidden) {
    hint.textContent = reset ? t("limit.reset", { time: reset }) : t("limit");
    hint.style.left = `${clamp(current.x - hint.offsetWidth / 2, 8, innerWidth - hint.offsetWidth - 8)}px`;
    hint.style.top = `${clamp(current.y - 166, 8, innerHeight - 52)}px`;
  }
  const polygons = [...character.polygons(), ...menu.polygons()];
  if (!permission.hidden) {
    const r = permission.getBoundingClientRect();
    polygons.push(roundedRect(r.x, r.y, r.width, r.height, 20));
  }
  api.interactive(
    scanlines(polygons, { width: innerWidth, height: innerHeight }),
  );
  workTimes.push(performance.now() - began);
  if (workTimes.length > 600) workTimes.shift();
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
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
  if (event.type === "cursor") {
    const before = state.over;
    state.hover(event.hit, performance.now());
    if (event.hit && !before) {
      waveAt = performance.now() / 1000;
      window.dispatchEvent(new CustomEvent("blinkling:recall-answer"));
    }
  }
  if (event.type === "chat-blur") state.hover(false, performance.now());
  if (event.type === "chat-activity") state.activity(performance.now());
  if (event.type === "capture") composer.attach(event.capture.image);
  if (event.type === "catch") catchAt = performance.now() / 1000;
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
