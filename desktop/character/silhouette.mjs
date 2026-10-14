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
export function capsule(x1, y1, x2, y2, r) {
  const angle = Math.atan2(y2 - y1, x2 - x1),
    points = [];
  for (const [x, y, start] of [
    [x2, y2, angle - Math.PI / 2],
    [x1, y1, angle + Math.PI / 2],
  ])
    for (let i = 0; i <= 12; i++) {
      const a = start + (i * Math.PI) / 12;
      points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
  return points;
}
export function transformPolygon(points, m) {
  return points.map((p) => ({
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }));
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
