import { mountBlink } from "../character/index.mjs";
import { createCharacterState } from "../character/state.mjs";
import { createActivityState } from "../character/activity.mjs";
import { menuActions, mountMenu, bubbleRegions } from "../menu/index.mjs";
import { createMessageStream } from "../messages/index.mjs";
import { createComposer } from "../composer/index.mjs";
const host = document.querySelector("#blink"),
  character = mountBlink(host),
  state = createCharacterState(),
  activity = createActivityState(),
  permission = document.querySelector("#permission-alert");
permission.addEventListener("click", () => window.glimpselet.action("chat"));
const menu = mountMenu(document.querySelector("#menu"), async (action) => {
  const result = await window.glimpselet.action(action);
  if (action === "auto-explain" && result.ok) menu.toggleAuto(result.enabled);
});
let shell = await window.glimpselet.shell({ type: "state" }),
  inside = false,
  current = { ...shell.peek },
  velocity = { x: 0, y: 0 },
  last = performance.now(),
  pointerDown = null;
window.glimpselet.onShell((event) => {
  if (event.type === "pointer") {
    inside = event.inside;
    state.hover(inside, performance.now());
  }
  if (event.type === "state") {
    shell = event.state;
    state.pin(shell.pinned, performance.now());
    state.drag(shell.dragging, performance.now());
    // Geometry rebases on hotplug/display transfer, never in physical pixels.
    if (event.rebase) {
      current = { ...shell.peek };
      velocity = { x: 0, y: 0 };
    }
  }
});
window.glimpselet.onEvent((event) => {
  activity.accept(event, performance.now());
});
host.addEventListener("pointerdown", async (event) => {
  if (event.button !== 0) return;
  pointerDown = { x: event.screenX, y: event.screenY };
  host.setPointerCapture(event.pointerId);
  await window.glimpselet.shell({ type: "drag-start", anchor: { ...current } });
});
host.addEventListener("pointerup", async (event) => {
  if (!pointerDown) return;
  const moved =
    Math.hypot(event.screenX - pointerDown.x, event.screenY - pointerDown.y) >
    5;
  pointerDown = null;
  if (host.hasPointerCapture(event.pointerId))
    host.releasePointerCapture(event.pointerId);
  await window.glimpselet.shell({ type: "drag-end" });
  if (!moved) {
    if (activity.read(performance.now()).expression === "permission")
      await window.glimpselet.action("chat");
    window.dispatchEvent(new CustomEvent("glimpselet:blink-click"));
  }
});
host.addEventListener("lostpointercapture", () => {
  if (pointerDown) {
    pointerDown = null;
    window.glimpselet.shell({ type: "drag-end" });
  }
});
const samples = [];
function frame(now) {
  const elapsed = now - last,
    dt = Math.min(0.032, elapsed / 1000);
  last = now;
  const { mode } = state.read(now),
    target =
      mode === "peek" || (mode === "drop" && !shell.pinned)
        ? shell.peek
        : shell.dragging
          ? shell.peek
          : shell.revealed;
  for (const axis of ["x", "y"]) {
    if (pointerDown && !shell.dragging) {
      // Hold the actual grabbed pose while native input waits for drag intent.
      velocity[axis] = 0;
    } else if (shell.dragging) {
      current[axis] = target[axis];
      velocity[axis] = 0;
    } else {
      velocity[axis] +=
        (target[axis] - current[axis]) * 260 * dt - velocity[axis] * 28 * dt;
      current[axis] += velocity[axis] * dt;
    }
  }
  host.style.left = `${current.x - 80}px`;
  host.style.top = `${current.y - 81.6}px`;
  // viewBox y=-420..20; body centre is -216, or 81.6 CSS pixels down.
  host.style.opacity = String(mode === "peek" ? 0.4 : 1);
  // Hang face-first from the top edge so the peek retains eyes and status.
  const hanging = shell.peek.y === 0 && (mode === "peek" || mode === "drop");
  host.style.transform = hanging ? "rotate(180deg)" : "rotate(0deg)";
  host.dataset.mode = mode;
  const session = activity.read(now);
  host.dataset.expression = session.expression;
  character.pose(
    now,
    mode,
    session.talking,
    session.expression,
    session.connection,
    shell.edge,
    hanging,
  );
  permission.hidden =
    session.expression !== "permission" || shell.chatOpen || mode === "drag";
  permission.style.left = `${Math.max(8, Math.min(innerWidth - 188, current.x - 90))}px`;
  permission.style.top = `${Math.max(8, Math.min(innerHeight - 52, current.y + (hanging ? 110 : -120)))}px`;
  menu.draw(
    now,
    mode === "hover" && !shell.chatOpen && session.expression !== "permission",
    current,
  );
  window.glimpselet.interactive([
    ...character.regions(),
    ...menu.regions(),
    ...(permission.hidden ? [] : bubbleRegions(permission)),
  ]);
  samples.push(elapsed);
  if (samples.length > 240) samples.shift();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Public renderer integration anchor: feature buckets mount in the separate card.
export const desktop = {
  character,
  menuActions,
  messages: createMessageStream(),
  composer: createComposer(),
  state: () => ({
    shell,
    mode: state.read(performance.now()).mode,
    anchor: { ...current },
    frames: [...samples],
    activity: activity.read(performance.now()),
  }),
};
window.desktop = desktop;
