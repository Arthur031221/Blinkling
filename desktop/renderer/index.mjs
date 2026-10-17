import { HIT_MARGIN, mountBlink } from "../character/index.mjs";
import { createActivityState } from "../character/activity.mjs";
import { spring } from "../character/state.mjs";
import { grow, scanlines, roundedRect } from "../character/silhouette.mjs";
import { mountMenu, menuActions } from "../menu/index.mjs";
import { createComposer, readAttachment } from "../composer/index.mjs";
import { applyText, windowText, GRUMBLES } from "./strings.mjs";
import { cssVariables, frameLog, springs } from "../shared/motion.mjs";
import { documentLocale, setDocumentLocale } from "../shared/i18n.mjs";
import { menuText } from "../menu/strings.mjs";
import { createGrumbler } from "../character/grumble.mjs";
import { gazeAt } from "../character/touch.mjs";
const api = window.blinkling;
document.documentElement.style.cssText += cssVariables();
let shell = await api.shell({ type: "state" });
// Main sends the one system locale with the state; every string below follows it.
setDocumentLocale(document, shell.locale);
let text = windowText();
applyText(document, text);
const logFrame = frameLog();
const activity = createActivityState();
const grumbler = createGrumbler({ count: GRUMBLES });
const grumble = document.querySelector("#grumble");
let grumbling = null;
const status = document.querySelector("#status");
// When each one-off motion last started. Main decides when one plays and sends
// it as a motion event; the pose picks the newest that is still running.
const at = {
  appear: -100,
  eat: -100,
  file: -100,
  celebrate: -100,
  shrug: -100,
  turn: -100,
  dizzy: -100,
};
let leaveAt = null,
  whirlAt = null,
  turnDir = 1;
const composer = createComposer();
let hit = [],
  character = null,
  menu = null,
  frameId = 0,
  last = performance.now(),
  waveAt = -100,
  dropAt = -100,
  current = null,
  pointerOver = false,
  pointer = null,
  picking = false,
  dragPointer = null,
  /** Where the held pointer puts Blink, read from its own events. */
  held = null,
  dropUntil = 0;
/** Where the current guide step is on the screen, or null. */
let guideTarget = null;
/** The unit direction from Blink's body to that step, in window coordinates. */
function guideAim() {
  if (!guideTarget || !current) return null;
  const { x: ox, y: oy } = shell.display.bounds;
  const dx = guideTarget.x - ox - current.x,
    dy = guideTarget.y - oy - (current.y - 62);
  const len = Math.hypot(dx, dy);
  return len < 40 ? null : { x: dx / len, y: dy / len };
}
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
/** The progress bubble sits at Blink's mouth, on the side toward the screen's
 * inside, where the card will open. */
function placeStatus(node, feet) {
  const width = node.offsetWidth,
    height = node.offsetHeight;
  const right = feet.x < innerWidth / 2;
  const x = right ? feet.x + 52 : feet.x - 52 - width;
  const y = feet.y - 62 - height / 2;
  node.style.transform = `translate(${Math.max(8, Math.min(innerWidth - width - 8, x))}px,${Math.max(8, Math.min(innerHeight - height - 8, y))}px)`;
  node.dataset.side = right ? "right" : "left";
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
  ) {
    current = null;
    held = null;
  }
  shell = value;
  document.documentElement.dataset.edge = shell.position.edge;
  document.documentElement.dataset.theme = shell.theme;
  menu?.setAuto(shell.autoExplain);
  if (shell.locale !== documentLocale(document)) relocalize(shell.locale);
}
/** A language chosen in settings: the words change where they stand. Nothing
 * is rebuilt, so no pose, motion or position is touched. */
function relocalize(locale) {
  setDocumentLocale(document, locale);
  text = windowText(locale);
  applyText(document, text);
  menu?.setText(menuText(locale));
  if (grumbling !== null) grumble.textContent = text(`grumble${grumbling + 1}`);
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
    held = {
      from: { x: event.clientX, y: event.clientY },
      at: { x: current.x, y: current.y },
      point: null,
    };
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
  host.addEventListener("pointermove", (event) => {
    if (!dragPointer || !held) return;
    held.point = {
      x: held.at.x + event.clientX - held.from.x,
      y: held.at.y + event.clientY - held.from.y,
    };
    if (shell.drag) api.shell({ type: "drag-move", anchor: held.point });
  });
  async function release(event) {
    if (!dragPointer) return;
    const ready = dragPointer.ready;
    dragPointer = null;
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    await ready;
    const done = await api.shell({ type: "drag", phase: "end" });
    held = null;
    // From here Blink glides to its place, and the card is told where it is.
    gliding = true;
    accept(done);
  }
  host.addEventListener("pointerup", release);
  host.addEventListener("pointercancel", release);
  let gliding = false;
  function frame(now) {
    const began = performance.now(),
      dt = (now - last) / 1000;
    frameTimes.push(now - last);
    if (frameTimes.length > 600) frameTimes.shift();
    last = now;
    const mode = modeOf(now);
    host.dataset.drag = String(shell.interaction.held);
    const revealed = mode !== "peek" || leaveAt !== null,
      target =
        (shell.drag && held?.point) ||
        shell.drag ||
        (revealed ? shell.position.reveal : shell.position.peek);
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
    if (gliding && !shell.drag) {
      const arrived =
        Math.abs(current.x - target.x) <= 0.5 &&
        Math.abs(current.y - target.y) <= 0.5;
      api.shell(
        arrived
          ? { type: "glide-end" }
          : { type: "glide", anchor: { x: current.x, y: current.y } },
      );
      if (arrived) gliding = false;
    }
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
    // Moving along its edge on its own, after a drop, Blink walks.
    const along =
      shell.position.edge === "left" || shell.position.edge === "right"
        ? current.vy
        : current.vx;
    const walking =
      !shell.drag && mode !== "drag" && Math.abs(along) > 30
        ? Math.sign(along)
        : 0;
    const touched =
      pointer?.point && pointer.blink && mode !== "drag" && mode !== "peek"
        ? character.touchAt(pointer.point)
        : null;
    character.pose(now / 1000, {
      gaze: picking && pointer?.point ? gazeAt(pointer.point, current) : null,
      touch: touched,
      dizzyAt: at.dizzy,
      whirlAt: shell.interaction.held ? whirlAt : null,
      appearAt: at.appear,
      eatAt: at.eat,
      fileAt: at.file,
      celebrateAt: at.celebrate,
      shrugAt: at.shrug,
      turnAt: at.turn,
      turnDir,
      leaveAt,
      walking,
      picking,
      guideAim: guideAim(),
      mode,
      waveAt,
      dropAt,
      velocity: shell.drag?.velocity ?? 0,
      talking: session.talking,
      expression: session.expression,
      face: session.face,
      dot: session.dot,
      edge: shell.position.edge,
      grumbling: grumbling !== null,
    });
    // Idle for a minute, Blink thinks out loud. Anything that keeps it busy
    // or any use of the app starts the quiet again.
    const busy =
      session.expression !== "idle" ||
      shell.chatOpen ||
      !!shell.drag ||
      touched !== null ||
      (mode !== "peek" && grumbling === null) ||
      pointerOver ||
      menu.open;
    const line = grumbler.tick(now, busy);
    if (line !== grumbling) {
      grumbling = line;
      if (line !== null) grumble.textContent = text(`grumble${line + 1}`);
      grumble.dataset.shown = String(line !== null);
      void api.shell({ type: "grumble", value: line !== null }).catch(() => {});
    }
    if (line !== null) placeGrumble(grumble, current, shell.position);
    if (status.dataset.shown === "true") placeStatus(status, current);
    // The machine in main decides when the fan shows: after the pointer has
    // rested on Blink, never over an open card.
    pointerOver = Boolean(pointer?.blink);
    menu.setOpen(shell.interaction.menu, now / 1000, {
      together: mode === "drag" || mode === "drop",
      instant: shell.interaction.card || shell.chatOpen,
    });
    menu.frame(now / 1000, dt, area, current);
    permission.hidden =
      session.expression !== "permission" || shell.chatOpen || mode === "drag";
    permission.style.left = `${Math.max(8, Math.min(innerWidth - 188, current.x - 90))}px`;
    permission.style.top = `${Math.max(8, Math.min(innerHeight - 52, current.y - 120))}px`;
    const size = { width: innerWidth, height: innerHeight };
    const body = grow(scanlines(character.polygons(), size), HIT_MARGIN, size),
      fan = scanlines(menu.polygons(), size),
      all = [...body, ...fan];
    if (!permission.hidden) {
      const r = permission.getBoundingClientRect();
      all.push(
        ...scanlines([roundedRect(r.x, r.y, r.width, r.height, 20)], size),
      );
    }
    hit = body;
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
      whirlAt = null;
      grumbler.touch(performance.now());
    }
  }
  if (event.type === "picking") picking = event.on === true;
  if (event.type === "motion") {
    const now = performance.now() / 1000;
    if (event.name === "leave") leaveAt = now;
    else if (event.name === "whirl") whirlAt = now;
    else if (event.name in at) at[event.name] = now;
    if (event.name === "turn") turnDir = event.dir === -1 ? -1 : 1;
    grumbler.touch(performance.now());
  }
  if (event.type === "cursor") {
    const before = pointerOver;
    pointer = { point: event.point, hit: event.hit, blink: event.blink };
    if (event.blink && !before) waveAt = performance.now() / 1000;
  }
  if (event.type === "capture") composer.attach(event.capture.image);
  window.dispatchEvent(
    new CustomEvent("blinkling:shell-event", { detail: event }),
  );
});
api.onEvent((event) => {
  if (event.type === "capture-status") {
    const on = event.state === "working" && Boolean(event.message);
    if (on) status.textContent = event.message;
    status.dataset.shown = String(on);
  }
  if (event.type === "guide")
    guideTarget = event.phase === "step" && event.aim ? event.aim : null;
  activity.accept(event, performance.now());
  grumbler.touch(performance.now());
  window.dispatchEvent(
    new CustomEvent("blinkling:session-event", { detail: event }),
  );
});
export const desktop = {
  character,
  menuActions,
  composer,
  grumbler,
  get shell() {
    return shell;
  },
  talking: false,
  /** The click area of Blink's drawn shape, as the last frame reported it. */
  hit: () => hit,
  inspect: () => ({
    mode: modeOf(performance.now()),
    anchor: current ? { x: current.x, y: current.y - 62 } : null,
    fan: {
      open: menu.open,
      shown: menu.shown,
      rested: shell.interaction.menu,
      over: pointerOver,
    },
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

// A file dropped on Blink's drawn body is caught and goes into the card.
const onBody = (e) =>
  hit.some(
    (r) =>
      e.clientX >= r.x &&
      e.clientX < r.x + r.width &&
      e.clientY >= r.y &&
      e.clientY < r.y + r.height,
  );
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer?.types.includes("Files") && onBody(e)) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer?.files ?? [])];
  if (!files.length || !onBody(e)) return;
  e.preventDefault();
  void (async () => {
    try {
      const attachments = [];
      for (const f of files) attachments.push(await readAttachment(f));
      await window.blinkling.dropFiles(attachments);
    } catch {
      // An unreadable or unsupported file is left for the card to explain.
    }
  })();
});
