import { useEffect, useRef } from "react";

type Mood = "idle" | "selecting" | "think" | "done" | "paused";
type Rig = {
  place: { sx: number; sy: number };
  face: { iy: number };
  pupils: { x: number };
  eyes: { sy: number };
  up(): void;
};
type BlinkWindow = Window & {
  Blink?: { create(node: SVGSVGElement, options: object): Rig };
};

export function BlinkAvatar({
  mood = "idle",
  label,
}: {
  mood?: Mood;
  label: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const node = svg.current;
    const rig =
      node &&
      (window as BlinkWindow).Blink?.create(node, {
        x: 0,
        y: 0,
        scale: 0.62,
      });
    if (!rig) return;
    let raf = 0,
      nextBlink = 2.5,
      closedAt = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      rig.place.sx = rig.place.sy =
        0.62 *
        (reduced
          ? 1
          : mood === "done"
            ? 1 + Math.max(0, Math.sin(t * 7)) * 0.035
            : 1 + Math.sin(t * 2) * 0.008);
      rig.face.iy =
        mood === "paused"
          ? 8
          : mood === "think"
            ? Math.sin(t * 2) * 3
            : Math.sin(t * 2.5) * 2;
      rig.pupils.x = mood === "think" ? 5 : mood === "selecting" ? -5 : 0;
      if (!reduced && t > nextBlink) {
        closedAt = t;
        nextBlink = t + 2.8 + Math.sin(t) * 1.1;
      }
      const close = t - closedAt;
      rig.eyes.sy =
        mood === "paused"
          ? 0.08
          : !reduced && close >= 0 && close < 0.13
            ? Math.max(0.08, Math.abs(close - 0.065) * 14)
            : 1;
      rig.up();
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    tick(start);
    return () => {
      cancelAnimationFrame(raf);
      node?.replaceChildren();
    };
  }, [mood]);
  return (
    <svg
      ref={svg}
      className="blink-rig"
      viewBox="-100 -290 200 275"
      role="img"
      aria-label={label}
    />
  );
}
