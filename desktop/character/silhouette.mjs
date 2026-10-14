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

/** Scanline union of transformed primitive silhouettes, including round stroke
 * caps. Face and decorative paths lie wholly within the body. Matrices come
 * from the live rig so wave, breathing, drop and drag all share the same shape. */
export function polygonsToRegions(polygons, bounds, step = 1) {
  const rows = new Map();
  for (const points of polygons) {
    const top = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y))));
    const bottom = Math.min(
      bounds.height,
      Math.ceil(Math.max(...points.map((p) => p.y))),
    );
    for (let y = top; y < bottom; y += step) {
      const yy = y + step / 2,
        hits = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if ((a.y <= yy && b.y > yy) || (b.y <= yy && a.y > yy))
          hits.push(a.x + ((yy - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      hits.sort((a, b) => a - b);
      const spans = rows.get(y) ?? [];
      for (let i = 0; i < hits.length - 1; i += 2) {
        const x = Math.max(0, hits[i]),
          end = Math.min(bounds.width, hits[i + 1]);
        if (end > x) spans.push([x, end]);
      }
      rows.set(y, spans);
    }
  }
  const regions = [];
  for (const [y, spans] of rows) {
    spans.sort((a, b) => a[0] - b[0]);
    let merged;
    for (const span of spans) {
      if (merged && span[0] <= merged[1])
        merged[1] = Math.max(merged[1], span[1]);
      else {
        if (merged)
          regions.push({
            x: merged[0],
            y,
            width: merged[1] - merged[0],
            height: step,
          });
        merged = [...span];
      }
    }
    if (merged)
      regions.push({
        x: merged[0],
        y,
        width: merged[1] - merged[0],
        height: step,
      });
  }
  return regions;
}
export function elementPolygon(node) {
  const m = node.getScreenCTM();
  if (!m) return [];
  const n = (key) => Number(node.getAttribute(key) ?? 0),
    stroke = n("stroke-width") / 2;
  let points = [];
  const circle = (cx, cy, rx, ry) =>
    Array.from({ length: 32 }, (_, i) => ({
      x: cx + Math.cos((i * Math.PI) / 16) * rx,
      y: cy + Math.sin((i * Math.PI) / 16) * ry,
    }));
  if (node.tagName === "circle" || node.tagName === "ellipse")
    points = circle(
      n("cx"),
      n("cy"),
      (n("r") || n("rx")) + stroke,
      (n("r") || n("ry")) + stroke,
    );
  if (node.tagName === "rect") {
    const x = n("x") - stroke,
      y = n("y") - stroke,
      w = n("width") + stroke * 2,
      h = n("height") + stroke * 2,
      r = Math.min(n("rx") + stroke, w / 2, h / 2);
    for (const [cx, cy, start] of [
      [x + w - r, y + r, -90],
      [x + w - r, y + h - r, 0],
      [x + r, y + h - r, 90],
      [x + r, y + r, 180],
    ])
      for (let i = 0; i <= 8; i++) {
        const angle = ((start + (i * 90) / 8) * Math.PI) / 180;
        points.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      }
  }
  if (node.tagName === "line") {
    const a = { x: n("x1"), y: n("y1") },
      b = { x: n("x2"), y: n("y2") };
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (const [p, start] of [
      [b, angle - Math.PI / 2],
      [a, angle + Math.PI / 2],
    ])
      for (let i = 0; i <= 16; i++) {
        const q = start + (i * Math.PI) / 16;
        points.push({
          x: p.x + stroke * Math.cos(q),
          y: p.y + stroke * Math.sin(q),
        });
      }
  }
  return points.map((p) => ({
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }));
}
export function silhouette(svg, bounds) {
  return polygonsToRegions(
    [...svg.querySelectorAll("rect,circle,ellipse,line")].map(elementPolygon),
    bounds,
  );
}
