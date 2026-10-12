import { useEffect, useLayoutEffect, useRef } from "react";

type Mood = "idle" | "selecting" | "think" | "done" | "paused";
type Rig = {
  place: { sx: number; sy: number };
  face: { iy: number };
  pupils: { x: number };
  eyes: { sy: number };
  lift: { y: number };
  arms: Record<"L" | "R", { shoulder: { r: number }; elbow: { r: number } }>;
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
  const currentMood = useRef(mood);
  const paint = useRef<(() => void) | null>(null);
  currentMood.current = mood;
  useLayoutEffect(() => paint.current?.(), [mood]);
  useEffect(() => {
    const node = svg.current;
    const host = node?.ownerDocument.defaultView;
    if (!host) return;
    const motion = host.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
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
    const start = host.performance.now();
    let previous = start;
    let lastMood = currentMood.current;
    let moodAt = start;
    const draw = (now: number) => {
      const mood = currentMood.current;
      if (mood !== lastMood) {
        lastMood = mood;
        moodAt = now;
      }
      const blend = reduced
        ? 1
        : 1 - Math.exp(-Math.max(0, Math.min(now - previous, 60)) / 70);
      previous = now;
      const approach = (value: number, target: number) =>
        value + (target - value) * blend;
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
          : !reduced && mood === "think"
            ? Math.sin(t * 2) * 3
            : reduced
              ? 0
              : Math.sin(t * 2.5) * 2;
      rig.pupils.x = approach(
        rig.pupils.x,
        mood === "think" ? 5 : mood === "selecting" ? -5 : 0,
      );
      const cheer = mood === "done" && now - moodAt < 650;
      rig.arms.L.shoulder.r = approach(rig.arms.L.shoulder.r, cheer ? 160 : 14);
      rig.arms.R.shoulder.r = approach(
        rig.arms.R.shoulder.r,
        cheer ? -160 : mood === "think" ? 100 : -14,
      );
      rig.arms.R.elbow.r = approach(
        rig.arms.R.elbow.r,
        mood === "think" ? -80 : 0,
      );
      rig.lift.y =
        reduced || !cheer
          ? 0
          : -Math.max(0, Math.sin(((now - moodAt) / 650) * Math.PI)) * 8;
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
    };
    const tick = (now: number) => {
      draw(now);
      raf = host.requestAnimationFrame(tick);
    };
    paint.current = () => draw(host.performance.now());
    const changeMotion = () => {
      reduced = motion.matches;
      host.cancelAnimationFrame(raf);
      draw(host.performance.now());
      if (!reduced) raf = host.requestAnimationFrame(tick);
    };
    motion.addEventListener("change", changeMotion);
    draw(start);
    if (!reduced) raf = host.requestAnimationFrame(tick);
    return () => {
      paint.current = null;
      host.cancelAnimationFrame(raf);
      motion.removeEventListener("change", changeMotion);
      node?.replaceChildren();
    };
  }, []);
  return (
    <svg
      ref={svg}
      className="blink-rig"
      data-mood={mood}
      viewBox="-100 -290 200 275"
      role="img"
      aria-label={label}
    />
  );
}
