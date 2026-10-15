import { mountBlink } from "../character/index.mjs";
import { createActivityState } from "../character/activity.mjs";
import { BlinkState, spring } from "../character/state.mjs";
import { scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
import { createRest } from "../menu/rest.mjs";
import { createGesture } from "./gesture.mjs";
import { applyText, windowText } from "./strings.mjs";
import { cssVariables, frameLog, springs } from "../shared/motion.mjs";
import { setDocumentLocale } from "../shared/i18n.mjs";
const api = window.blinkling;
document.documentElement.style.cssText += cssVariables();
let shell = await api.shell({ type: "state" });
// Main sends the one system locale with the state; every string below follows it.
setDocumentLocale(document, shell.locale);
const text = windowText();
applyText(document, text);
const logFrame = frameLog();
const state = new BlinkState();
const activity = createActivityState();
const composer = createComposer(),
  messages = createMessageStream();
let character = null,
  menu = null,
  frameId = 0,
  last = performance.now(),
  waveAt = -100,
  dropAt = -100,
  current = null,
  catchAt = -100,
  pointerOver = false,
  pointer = null,
  dragPointer = null,
  dragStarting = false;
/** Is the pointer on Blink? Blink slides out from under a pointer resting on
 * its peeking edge, so the ground it covers between peek and reveal counts
 * too; a pointer over the card or the deck never does. */
function onBlink(cursor, position) {
  if (!cursor) return false;
  if (cursor.blink) return true;
  if (cursor.hit || !cursor.point) return false;
  const { peek, reveal } = position,
    near = {
      left: Math.min(peek.x, reveal.x) - 74,
      right: Math.max(peek.x, reveal.x) + 74,
      top: Math.min(peek.y, reveal.y) - 142,
      bottom: Math.max(peek.y, reveal.y) + 10,
    };
  return (
    cursor.point.x >= near.left &&
    cursor.point.x <= near.right &&
    cursor.point.y >= near.top &&
    cursor.point.y <= near.bottom
  );
}
const rest = createRest(),
  gesture = createGesture();
const host = document.querySelector("#blink");
const permission = document.querySelector("#permission-alert");
permission.addEventListener("click", () =>
  api.shell({ type: "click", permission: true }),
);
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
{
  character = mountBlink(host);
  menu = mountMenu(document.querySelector("#menu"), action);
  menu.setAuto(shell.autoExplain);
  host.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    gesture.down({ x: event.screenX, y: event.screenY });
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
    if (
      !dragPointer ||
      gesture.move({ x: event.screenX, y: event.screenY }) !== "drag-start"
    )
      return;
    dragStarting = true;
    state.startDrag();
    menu.setOpen(false, performance.now() / 1000, { together: true });
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
    // A press that travelled more than 4 px is a drop; anything less is a click.
    const result = event.type === "pointercancel" ? null : gesture.up();
    if (result === null) gesture.cancel();
    const ready = dragPointer.ready;
    dragPointer = null;
    host.dataset.drag = "false";
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    await ready;
    if (result === "drop") {
      if (!dragStarting)
        accept(await api.shell({ type: "drag", phase: "end" }));
      dropAt = performance.now() / 1000;
      state.drop(performance.now());
    } else {
      await api.shell({ type: "drag", phase: "end" });
      if (result === "click")
        await api.shell({
          type: "click",
          permission: activity.read(performance.now()).face === "permission",
        });
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
          : spring(current[key], t, current[vkey], dt, springs.crisp);
      current[key] = q.value;
      current[vkey] = q.velocity;
      if (key === "alpha" && Math.abs(q.value - t) < 0.005) {
        current[key] = t;
        current[vkey] = 0;
      }
    }
    host.style.transform = `translate(${current.x - 74}px,${current.y - 142}px)`;
    host.style.opacity = String(current.alpha);
    if (
      Math.abs(current.x - target.x) > 0.5 ||
      Math.abs(current.y - target.y) > 0.5 ||
      Math.abs(current.alpha - (revealed ? 1 : 0.4)) > 0.005
    )
      logFrame("peek", {
        x: current.x - 74,
        y: current.y - 142,
        width: 148,
        height: 152,
      });
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
      face: session.face,
      dot: session.dot,
      catchAt,
      edge: shell.position.edge,
      hanging: state.mode === "peek" && shell.position.edge === "top",
    });
    // The fan opens only after the pointer has rested on Blink; once open it
    // stays while Blink stays revealed, so crossing the gaps between bubbles
    // does not close it. A wake without the pointer never opens it (N2.1).
    const stay = revealed && state.mode !== "drag" && state.mode !== "drop";
    pointerOver = onBlink(pointer, shell.position);
    rest.update(pointerOver && stay, now, { keep: stay && menu.open });
    menu.setOpen(rest.ready && stay && !shell.chatOpen, now / 1000, {
      together: state.mode === "drag" || state.mode === "drop",
    });
    menu.frame(now / 1000, dt, area, current);
    permission.hidden =
      session.expression !== "permission" ||
      shell.chatOpen ||
      state.mode === "drag";
    permission.style.left = `${Math.max(8, Math.min(innerWidth - 188, current.x - 90))}px`;
    permission.style.top = `${Math.max(8, Math.min(innerHeight - 52, current.y - 120))}px`;
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
  if (event.type === "cursor") {
    const before = state.over;
    pointer = { point: event.point, hit: event.hit, blink: event.blink };
    state.hover(event.hit, performance.now());
    if (event.hit && !before) {
      waveAt = performance.now() / 1000;
      window.dispatchEvent(new CustomEvent("blinkling:recall-answer"));
    }
  }
  if (event.type === "chat-blur") state.hover(false, performance.now());
  if (event.type === "chat-activity") state.activity(performance.now());
  if (event.type === "capture") composer.attach(event.capture.image);
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
    fan: { open: menu.open, rested: rest.ready, over: pointerOver },
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
// Blink's catch bounce (the picked region flies to it).
window.blinkling.onCatch(() => {
  catchAt = performance.now() / 1000;
});
