import { createRig } from "./rig.mjs";
import { silhouette } from "./silhouette.mjs";
export function mountBlink(host) {
  const rig = createRig(host);
  let previousMode = "peek",
    transition = 0;
  return {
    rig,
    pose(
      now,
      mode,
      talking = false,
      expression = "idle",
      connection = "starting",
      edge = "right",
      hanging = false,
    ) {
      if (mode !== previousMode) {
        previousMode = mode;
        transition = now;
      }
      const t = now / 1000,
        elapsed = (now - transition) / 1000;
      const blink = t % 3.8,
        eye =
          blink > 1.3 && blink < 1.46
            ? Math.max(0.08, Math.abs(blink - 1.38) / 0.08)
            : 1;
      const drop =
        mode === "drop" ? Math.exp(-elapsed * 7) * Math.cos(elapsed * 22) : 0;
      rig.root.apply({
        sx: mode === "drag" ? 0.88 : 1 + drop * 0.12,
        sy: mode === "drag" ? 1.12 : 1 - drop * 0.12,
        dy:
          mode === "drag"
            ? 0
            : Math.sin(t * 1.8) * 4 -
              drop * 12 +
              (expression === "finished" ? Math.sin(t * 12) * 3 : 0),
        r: mode === "drag" ? Math.sin(t * 7) * 7 : 0,
      });
      rig.face.apply({
        r:
          expression === "permission" || expression === "error"
            ? -6
            : Math.sin(t * 1.2) * 1.6,
      });
      rig.eyes.apply({
        sx: mode === "drag" ? 1.14 : 1,
        sy: mode === "drag" ? 1.14 : eye,
      });
      rig.pupils.apply({
        dx: Math.sin(t * 0.6) * 6,
        dy: (expression === "thinking" ? -14 : 0) + Math.cos(t * 0.4) * 2,
      });
      rig.brows.setAttribute(
        "opacity",
        expression === "permission" || expression === "error" ? 1 : 0,
      );
      rig.thoughts.forEach((dot, i) =>
        dot.setAttribute(
          "opacity",
          expression === "thinking"
            ? 0.4 + (Math.sin(t * 5 - i * 1.2) + 1) * 0.3
            : 0,
        ),
      );
      rig.status.setAttribute(
        "fill",
        {
          starting: "#d99729",
          connected: "#1f9e68",
          retrying: "#d99729",
          blocked: "#d84949",
        }[connection] ?? "#d99729",
      );
      rig.status.dataset.connection = connection;
      rig.status.setAttribute(
        "cx",
        (edge === "right" ? -90 : edge === "left" ? 90 : 0) *
          (hanging ? -1 : 1),
      );
      rig.smile.setAttribute(
        "d",
        expression === "error"
          ? "M -28 66 Q 0 42 28 66"
          : "M -28 50 Q 0 78 28 50",
      );
      const wave = mode === "hover" && elapsed < 1.5;
      rig.arms.L.shoulder.apply({
        r: mode === "drag" ? 5 : 14 + Math.sin(t * 2.2) * 3,
      });
      rig.arms.R.shoulder.apply({
        r: wave
          ? -150
          : mode === "drag"
            ? -5
            : -14 + Math.sin(t * 2.2 + 1.4) * 3,
      });
      rig.arms.L.elbow.apply();
      rig.arms.R.elbow.apply({ r: wave ? Math.sin(elapsed * 22) * 30 : 0 });
      for (const [side, leg] of Object.entries(rig.legs)) {
        leg.hip.apply({
          r: mode === "drag" ? Math.sin(t * 7) * (side === "L" ? 14 : -14) : 0,
        });
        leg.knee.apply();
      }
      const open =
        mode === "drag" ||
        expression === "permission" ||
        (talking && Math.sin(t * 18) > 0);
      rig.mouth.setAttribute("opacity", open ? 1 : 0);
      rig.smile.setAttribute("opacity", open ? 0 : 1);
    },
    regions: () =>
      silhouette(rig.svg, { width: innerWidth, height: innerHeight }),
  };
}
