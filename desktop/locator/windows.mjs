import { classify } from "../privacy/rules.mjs";
import { createSnapshotCache } from "./cache.mjs";
import { intersection } from "./snap.mjs";

const MIN_SIDE = 8;
const area = (r) => r.width * r.height;
const inside = (r, p) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

const displayRef = (display) => ({
  id: String(display.id),
  scaleFactor: display.scaleFactor || 1,
  bounds: { ...display.bounds },
});

/** Every window on every display, front to back, in screen DIP. `list` gives
 * native windows (`{id, app, title, bounds}` in native pixels); `toDip` maps a
 * native screen point to a DIP one. The private and password-manager flags come
 * from the privacy rules, so the two never disagree about what those are. */
export function createWindowIndex({
  list,
  displays,
  toDip,
  ttl = 250,
  now = Date.now,
} = {}) {
  const cache = createSnapshotCache({ now, ttl, budget: 30 });
  let lastGood = [];

  const refs = () => displays().map(displayRef);

  function build(native) {
    const screens = refs();
    const out = [];
    for (const item of native) {
      const from = toDip({ x: item.bounds.x, y: item.bounds.y });
      const to = toDip({
        x: item.bounds.x + item.bounds.width,
        y: item.bounds.y + item.bounds.height,
      });
      const bounds = {
        x: Math.round(from.x),
        y: Math.round(from.y),
        width: Math.round(to.x - from.x),
        height: Math.round(to.y - from.y),
      };
      if (bounds.width < MIN_SIDE || bounds.height < MIN_SIDE) continue;
      let display = null;
      let best = 0;
      for (const candidate of screens) {
        const overlap = area(
          intersection(bounds, candidate.bounds) ?? { width: 0, height: 0 },
        );
        if (overlap > best) {
          best = overlap;
          display = candidate;
        }
      }
      if (!display) continue;
      const verdict = classify({
        secure: false,
        window: { app: item.app, title: item.title },
      });
      out.push({
        id: String(item.id),
        title: String(item.title ?? ""),
        app: String(item.app ?? ""),
        bounds,
        private: verdict.reason === "private",
        passwordManager: verdict.reason === "password-manager",
        display,
      });
    }
    return out;
  }

  async function all({ fresh = false, budget = 250 } = {}) {
    if (fresh) cache.invalidate("windows");
    const result = await cache.read(
      "windows",
      async () => build(await list()),
      { budget },
    );
    if (result.value) lastGood = result.value;
    return lastGood;
  }

  return {
    all,
    invalidate: () => cache.invalidate("windows"),
    async windowAt(point, options = {}) {
      return (await all(options)).find((w) => inside(w.bounds, point)) ?? null;
    },
    displayAt(point) {
      const screens = refs();
      return (
        screens.find((d) => inside(d.bounds, point)) ?? screens.at(-1) ?? null
      );
    },
  };
}
