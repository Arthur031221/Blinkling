export function roundedRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const points = [];
  for (const [cx, cy, start] of [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ])
    for (let i = 0; i <= 8; i++) {
      const a = start + (i * Math.PI) / 16;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  return points;
}
/** The part of a polygon on the near side of the horizontal line `y` (smaller y). */
export function clipAbove(points, y) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const ain = a.y <= y,
      bin = b.y <= y;
    if (ain) out.push(a);
    if (ain !== bin) {
      const k = (y - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * k, y });
    }
  }
  return out;
}
/** Spans grown by a round margin: every pixel within `margin` of a span is in. */
export function grow(spans, margin, bounds) {
  const rows = new Map();
  for (const s of spans) {
    for (let dy = -margin; dy <= margin; dy++) {
      const y = s.y + dy;
      if (y < 0 || y >= bounds.height) continue;
      const reach = Math.floor(Math.sqrt(margin * margin - dy * dy));
      const list = rows.get(y) ?? [];
      list.push([
        Math.max(0, s.x - reach),
        Math.min(bounds.width, s.x + s.width + reach),
      ]);
      rows.set(y, list);
    }
  }
  const out = [];
  for (const [y, list] of rows) {
    list.sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const span of list) {
      if (cur && span[0] <= cur[1]) cur[1] = Math.max(cur[1], span[1]);
      else {
        if (cur) out.push({ x: cur[0], y, width: cur[1] - cur[0], height: 1 });
        cur = [...span];
      }
    }
    if (cur) out.push({ x: cur[0], y, width: cur[1] - cur[0], height: 1 });
  }
  return out;
}
/** Scan the actual transformed contour, union intersecting spans, never their box. */
export function scanlines(polygons, bounds) {
  const rows = new Map();
  for (const points of polygons) {
    const first = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)))),
      last = Math.min(
        bounds.height,
        Math.ceil(Math.max(...points.map((p) => p.y))),
      );
    for (let y = first; y < last; y++) {
      const xs = [],
        py = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if ((a.y <= py && b.y > py) || (b.y <= py && a.y > py))
          xs.push(a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const start = Math.max(0, Math.ceil(xs[i] - 0.5)),
          end = Math.min(bounds.width, Math.ceil(xs[i + 1] - 0.5));
        if (end > start) {
          if (!rows.has(y)) rows.set(y, []);
          rows.get(y).push([start, end]);
        }
      }
    }
  }
  const result = [];
  for (const [y, spans] of rows) {
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    for (const [x, end] of merged)
      result.push({ x, y, width: end - x, height: 1 });
  }
  return result;
}
