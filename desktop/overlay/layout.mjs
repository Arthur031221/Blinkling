// Pure callout placement, shared by the overlay renderer and its unit tests.
// A callout that cannot be placed cleanly is moved to the nearest free spot
// and, when the screen is simply full, dropped. It never aborts the guide.
const MARGIN = 8;
const GAP = 6;
function intersects(a, b) {
  return (
    a.x < b.x + b.width + GAP &&
    a.x + a.width + GAP > b.x &&
    a.y < b.y + b.height + GAP &&
    a.y + a.height + GAP > b.y
  );
}
function contains(a, b, inset = 0) {
  return (
    b.x >= a.x + inset &&
    b.y >= a.y + inset &&
    b.x + b.width <= a.x + a.width - inset &&
    b.y + b.height <= a.y + a.height - inset
  );
}
const distance = (p, r) =>
  Math.hypot(
    p.x + p.width / 2 - (r.x + r.width / 2),
    p.y + p.height / 2 - (r.y + r.height / 2),
  );
/** items: [{ rect, size: {width, height} | null }] in display DIP.
 * avoid: rectangles other windows (Blink's bubbles) occupy.
 * Returns one entry per item: a placed box {x, y, width, height} or null. */
export function placeCallouts({ width, height, items, avoid = [] }) {
  const screen = { x: 0, y: 0, width, height };
  const regions = items.map((item) => item.rect);
  const placed = [];
  return items.map((item, index) => {
    if (!item.size) return null;
    const b = item.size,
      r = item.rect;
    const x = Math.max(
      MARGIN,
      Math.min(width - b.width - MARGIN, r.x + MARGIN),
    );
    const candidates = [
      { x, y: r.y - b.height - 10 },
      { x: r.x + r.width + 10, y: r.y },
      { x: r.x - b.width - 10, y: r.y },
      { x, y: r.y + r.height + 10 },
    ];
    // Same column first, then every free cell, nearest to the target first.
    const grid = [];
    for (let y = MARGIN; y <= height - b.height - MARGIN; y += b.height + GAP)
      for (let xx = MARGIN; xx <= width - b.width - MARGIN; xx += b.width + GAP)
        grid.push({ x: xx, y });
    for (let y = MARGIN; y <= height - b.height - MARGIN; y += b.height + GAP)
      candidates.push({ x, y });
    const boxes = [
      ...candidates,
      ...grid.sort(
        (p, q) => distance({ ...p, ...b }, r) - distance({ ...q, ...b }, r),
      ),
    ]
      .map((p) => ({ x: p.x, y: p.y, width: b.width, height: b.height }))
      .filter((p) => contains(screen, p, MARGIN));
    const free = (p) => !placed.some((o) => intersects(p, o));
    // Enclosing section: its label may sit inside that section's lower margin.
    const inner = {
      x: r.x + MARGIN,
      y: r.y + r.height - b.height - MARGIN,
      width: b.width,
      height: b.height,
    };
    // Only another section that encloses this target may hold the label; the
    // target's own box is never covered while a free spot exists.
    const insideOnly = (p) =>
      !regions.some(
        (region, i) =>
          intersects(p, region) &&
          !(i !== index && contains(region, r) && contains(region, p, MARGIN)),
      );
    const tiers = [
      // 1: next to the target, clear of other outlines, callouts and Blink. A
      // section that encloses the target may hold its label; a clean spot far
      // away is worse than that, so nearness wins over leaving every outline.
      (p) => free(p) && !avoid.some((a) => intersects(p, a)) && insideOnly(p),
      // 2: crossing other outlines is better than losing the callout.
      (p) => free(p) && !avoid.some((a) => intersects(p, a)),
      // 3: last resort, only never on another callout.
      (p) => free(p),
    ];
    for (const ok of tiers) {
      const p = [inner, ...boxes].find(
        (p) => contains(screen, p, MARGIN) && ok(p),
      );
      if (p) {
        placed.push(p);
        return p;
      }
    }
    return null;
  });
}
