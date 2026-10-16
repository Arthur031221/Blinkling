import { mountBlink } from "../character/index.mjs";
import { createActivityState } from "../character/activity.mjs";
import { spring } from "../character/state.mjs";
import { scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
import { applyText, windowText, GRUMBLES } from "./strings.mjs";
import { cssVariables, frameLog, springs } from "../shared/motion.mjs";
import { setDocumentLocale } from "../shared/i18n.mjs";
import { createGrumbler } from "../character/grumble.mjs";
import { createSpinDetector } from "../character/spin.mjs";
import { touchPart, sideOf, gazeAt } from "../character/touch.mjs";
const api = window.blinkling;
document.documentElement.style.cssText += cssVariables();
let shell = await api.shell({ type: "state" });
// Main sends the one system locale with the state; every string below follows it.
setDocumentLocale(document, shell.locale);
const text = windowText();
applyText(document, text);
const logFrame = frameLog();
const activity = createActivityState();
const grumbler = createGrumbler({ count: GRUMBLES });
const spin = createSpinDetector();
const grumble = document.querySelector("#grumble");
// Where Blink was last carried round in circles: set on a drop that left it dizzy.
let dizzyAt = -100,
  grumbling = null;
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
  picking = false,
  dragPointer = null,
  dropUntil = 0;
/** The pose mode follows the machine in main: held, just dropped, out, peek. */
const modeOf = (now) =>
  shell.interaction.held
    ? "drag"
    : now < dropUntil
      ? "drop"
      : shell.interaction.out
        ? "hover"
        : "peek";
/** Put the thought bubble above Blink's head, leaning toward the screen's
 * inside; a Blink hanging from the top edge gets it below. */
function placeGrumble(node, feet, position) {
  const width = node.offsetWidth,
    height = node.offsetHeight;
  const inward = feet.x < innerWidth / 2;
  const x = Math.max(
    8,
    Math.min(innerWidth - width - 8, inward ? feet.x - 8 : feet.x - width + 8),
  );
  const top = position.edge === "top";
  const y = Math.max(
    8,
    Math.min(
      innerHeight - height - 8,
      top ? feet.y + 14 : feet.y - 112 - height,
    ),
  );
  node.style.transform = `translate(${x}px,${y}px)`;
  node.dataset.side = inward ? "left" : "right";
  node.dataset.edge = top ? "top" : "bottom";
}
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
  shell = value;
  document.documentElement.dataset.edge = shell.position.edge;
  document.documentElement.dataset.theme = shell.theme;
  menu?.setAuto(shell.autoExplain);
}
accept(shell);
async function action(id) {
  const result = await api.action(id);
  window.dispatchEvent(
    new CustomEvent("blinkling:action-result", {
      detail: { action: id, ...result },
    }),
  );
}
{
  character = mountBlink(host);
  menu = mountMenu(document.querySelector("#menu"), action, {
    firstUse: !shell.fanLabelsSeen,
    onLabelsShown: () => api.shell({ type: "fan-labels-seen" }),
  });
  menu.setAuto(shell.autoExplain);
  // Main decides what a press is: more than 4 px or 250 ms picks Blink up,
  // anything shorter is a click.
  host.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
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
  async function release(event) {
    if (!dragPointer) return;
    const ready = dragPointer.ready;
    dragPointer = null;
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    await ready;
    accept(await api.shell({ type: "drag", phase: "end" }));
  }
  host.addEventListener("pointerup", release);
  host.addEventListener("pointercancel", release);
  function frame(now) {
    const began = performance.now(),
      dt = (now - last) / 1000;
    frameTimes.push(now - last);
    if (frameTimes.length > 600) frameTimes.shift();
    last = now;
    const mode = modeOf(now);
    host.dataset.drag = String(shell.interaction.held);
    const revealed = mode !== "peek",
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
    host.dataset.mode = mode;
    const session = activity.read(now);
    host.dataset.expression = session.expression;
    // Held and swung round in circles twice, Blink is dizzy once it is let go.
    if (shell.drag) spin.add({ x: shell.drag.x, y: shell.drag.y }, now);
    const touched =
      pointer?.point && pointer.blink && mode !== "drag" && mode !== "peek"
        ? touchPart(pointer.point, current)
        : null;
    character.pose(now / 1000, {
      gaze: picking && pointer?.point ? gazeAt(pointer.point, current) : null,
      touch: touched
        ? { part: touched, side: sideOf(pointer.point, current) }
        : null,
      dizzyAt,
      mode,
      waveAt,
      dropAt,
      velocity: shell.drag?.velocity ?? 0,
      talking: session.talking,
      expression: session.expression,
      face: session.face,
      dot: session.dot,
      catchAt,
      edge: shell.position.edge,
      grumbling: grumbling !== null,
    });
    // Idle for a minute, Blink thinks out loud. Anything that keeps it busy
    // or any use of the app starts the quiet again.
    const busy =
      session.expression !== "idle" ||
      shell.chatOpen ||
      shell.miniOpen ||
      !!shell.drag ||
      touched !== null ||
      mode !== "peek" ||
      menu.open;
    const line = grumbler.tick(now, busy);
    if (line !== grumbling) {
      grumbling = line;
      if (line !== null) grumble.textContent = text(`grumble${line + 1}`);
      grumble.dataset.shown = String(line !== null);
    }
    if (line !== null) placeGrumble(grumble, current, shell.position);
    // The machine in main decides when the fan shows: after the pointer has
    // rested on Blink, never over an open card.
    pointerOver = Boolean(pointer?.blink);
    menu.setOpen(shell.interaction.menu, now / 1000, {
      together: mode === "drag" || mode === "drop",
    });
    menu.frame(now / 1000, dt, area, current);
    permission.hidden =
      session.expression !== "permission" || shell.chatOpen || mode === "drag";
    permission.style.left = `${Math.max(8, Math.min(innerWidth - 188, current.x - 90))}px`;
    permission.style.top = `${Math.max(8, Math.min(innerHeight - 52, current.y - 120))}px`;
    const size = { width: innerWidth, height: innerHeight };
    const body = scanlines(character.polygons(), size),
      fan = scanlines(menu.polygons(), size),
      all = [...body, ...fan];
    if (!permission.hidden) {
      const r = permission.getBoundingClientRect();
      all.push(
        ...scanlines([roundedRect(r.x, r.y, r.width, r.height, 20)], size),
      );
    }
    api.interactive(all, { blink: body, menu: fan });
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
    if (dragging && !shell.drag) {
      dropAt = performance.now() / 1000;
      dropUntil = performance.now() + 500;
      if (spin.dizzy) dizzyAt = dropAt;
      spin.reset();
      grumbler.touch(performance.now());
    }
  }
  if (event.type === "picking") picking = event.on === true;
  if (event.type === "cursor") {
    const before = pointerOver;
    pointer = { point: event.point, hit: event.hit, blink: event.blink };
    if (event.blink && !before) {
      waveAt = performance.now() / 1000;
      window.dispatchEvent(new CustomEvent("blinkling:recall-answer"));
    }
  }
  if (event.type === "capture") composer.attach(event.capture.image);
  window.dispatchEvent(
    new CustomEvent("blinkling:shell-event", { detail: event }),
  );
});
api.onEvent((event) => {
  activity.accept(event, performance.now());
  grumbler.touch(performance.now());
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
  grumbler,
  spin,
  get shell() {
    return shell;
  },
  talking: false,
  inspect: () => ({
    mode: modeOf(performance.now()),
    anchor: current ? { x: current.x, y: current.y - 62 } : null,
    fan: { open: menu.open, rested: shell.interaction.menu, over: pointerOver },
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
