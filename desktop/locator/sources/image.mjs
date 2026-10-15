import { buildElement } from "../element.mjs";

const CELL = 8;
const PHOTO_COLORS = 28;
const PHOTO_COVERAGE = 0.4;
const INK = 60;
const MIN_PHOTO = 24;
const MAX_LINE = 48;
const WORD_GAP = 16;
const HEADING_RATIO = 1.6;
const PARAGRAPH_RATIO = 1.6;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** The colour that fills most of the image: the page itself. Sampled, and
 * bucketed so anti-aliasing and gradients still land in one bucket. */
function backgroundOf({ width, height, data }) {
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  for (let y = 0; y < height; y += 4)
    for (let x = 0; x < width; x += 4) {
      const o = (y * width + x) * 4;
      const key =
        ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
      const entry = counts.get(key);
      if (entry) {
        entry.n += 1;
        if (entry.n > bestCount) {
          bestCount = entry.n;
          best = entry;
        }
      } else {
        const fresh = { n: 1, r: data[o], g: data[o + 1], b: data[o + 2] };
        counts.set(key, fresh);
        if (bestCount === 0) {
          bestCount = 1;
          best = fresh;
        }
      }
    }
  return best ?? { r: 255, g: 255, b: 255 };
}

/** Grid cells whose pixels are many different colours: photographs, not text
 * (a few greys) and not flat fills (one colour). */
function photoCells(image) {
  const { width, height, data } = image;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const busy = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const seen = new Set();
      const y1 = Math.min(height, (cy + 1) * CELL);
      const x1 = Math.min(width, (cx + 1) * CELL);
      for (let y = cy * CELL; y < y1 && seen.size <= PHOTO_COLORS; y++)
        for (let x = cx * CELL; x < x1; x++) {
          const o = (y * width + x) * 4;
          seen.add(
            ((data[o] >> 3) << 10) |
              ((data[o + 1] >> 3) << 5) |
              (data[o + 2] >> 3),
          );
        }
      if (seen.size > PHOTO_COLORS) busy[cy * cols + cx] = 1;
    }
  return { busy, cols, rows };
}

function imageRegions(image, bg, scale) {
  const { busy, cols, rows } = photoCells(image);
  const label = new Int32Array(cols * rows).fill(-1);
  const found = [];
  for (let start = 0; start < busy.length; start++) {
    if (!busy[start] || label[start] !== -1) continue;
    const id = found.length;
    const stack = [start];
    label[start] = id;
    const box = { x0: cols, y0: rows, x1: 0, y1: 0, cells: 0 };
    while (stack.length) {
      const at = stack.pop();
      const cx = at % cols;
      const cy = (at - cx) / cols;
      box.x0 = Math.min(box.x0, cx);
      box.y0 = Math.min(box.y0, cy);
      box.x1 = Math.max(box.x1, cx);
      box.y1 = Math.max(box.y1, cy);
      box.cells += 1;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (busy[next] && label[next] === -1) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    found.push(box);
  }
  const regions = [];
  const { width, height, data } = image;
  for (const box of found) {
    const area = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
    if (box.cells / area < PHOTO_COVERAGE) continue;
    // Trim the cell box to the pixels that differ from the page.
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = box.y0 * CELL; y < Math.min(height, (box.y1 + 1) * CELL); y++)
      for (
        let x = box.x0 * CELL;
        x < Math.min(width, (box.x1 + 1) * CELL);
        x++
      ) {
        const o = (y * width + x) * 4;
        if (differs(data, o, bg)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    if (x1 < 0) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < MIN_PHOTO * scale || h < MIN_PHOTO * scale) continue;
    regions.push({ kind: "image", x: x0, y: y0, width: w, height: h });
  }
  return regions;
}

function differs(data, o, bg) {
  return (
    Math.abs(data[o] - bg.r) +
      Math.abs(data[o + 1] - bg.g) +
      Math.abs(data[o + 2] - bg.b) >
    INK
  );
}

/** Text lines: ink runs on each row, joined across word gaps, then stacked
 * into boxes where touching rows overlap. Photographs are left out. */
function lineBoxes(image, bg, scale, photos) {
  const { width, height, data } = image;
  const gap = Math.max(2, Math.round(WORD_GAP * scale));
  const reach = Math.max(1, Math.round(scale));
  const maxHeight = MAX_LINE * scale;
  const covered = (x, y) =>
    photos.some(
      (p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height,
    );
  const parent = [];
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const segments = [];
  const rowsOf = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    let run = null;
    for (let x = 0; x < width; x++) {
      const ink = differs(data, (y * width + x) * 4, bg) && !covered(x, y);
      if (!ink) continue;
      if (run && x - run.x1 <= gap) run.x1 = x;
      else {
        run = { x0: x, x1: x, y, id: segments.length };
        parent.push(segments.length);
        segments.push(run);
        row.push(run);
      }
    }
    rowsOf.push(row);
  }
  for (let y = 0; y < height; y++)
    for (const seg of rowsOf[y])
      for (let dy = 1; dy <= reach && y - dy >= 0; dy++)
        for (const above of rowsOf[y - dy])
          if (above.x0 <= seg.x1 && above.x1 >= seg.x0)
            parent[find(seg.id)] = find(above.id);
  const boxes = new Map();
  for (const seg of segments) {
    const root = find(seg.id);
    const box = boxes.get(root);
    if (box) {
      box.x0 = Math.min(box.x0, seg.x0);
      box.x1 = Math.max(box.x1, seg.x1);
      box.y1 = Math.max(box.y1, seg.y);
    } else boxes.set(root, { x0: seg.x0, x1: seg.x1, y0: seg.y, y1: seg.y });
  }
  const lines = [];
  for (const box of boxes.values()) {
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    if (h < 4 * scale || h > maxHeight || w < 1.5 * h) continue;
    lines.push({ x: box.x0, y: box.y0, width: w, height: h });
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

const overlapX = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

/** Lines that follow each other, overlap sideways and are about as tall make
 * one paragraph; a lone, much taller line is a heading. */
function groupLines(lines) {
  const typical = median(lines.map((l) => l.height));
  const groups = [];
  for (const line of lines) {
    let target = null;
    for (const g of groups) {
      const last = g[g.length - 1];
      const gapY = line.y - (last.y + last.height);
      const ratio =
        Math.max(line.height, last.height) / Math.min(line.height, last.height);
      if (
        gapY <= last.height &&
        gapY >= -2 &&
        ratio <= PARAGRAPH_RATIO &&
        overlapX(line, last) >= 0.5 * Math.min(line.width, last.width)
      ) {
        target = g;
        break;
      }
    }
    if (target) target.push(line);
    else groups.push([line]);
  }
  return { groups, typical };
}

/** Finds photographs, text lines and paragraphs in raw RGBA pixels, with no
 * recognition of the characters. Coordinates are in image pixels; `scale` is
 * pixels per DIP and only tunes the size thresholds. */
export function analyzeImage(image, { scale = 1 } = {}) {
  if (!image?.data || image.width < 8 || image.height < 8)
    return { regions: [] };
  const bg = backgroundOf(image);
  const photos = imageRegions(image, bg, scale);
  const lines = lineBoxes(image, bg, scale, photos);
  const { groups, typical } = groupLines(lines);
  const regions = photos.map((p) => ({ ...p, parent: null }));
  for (const group of groups) {
    const x0 = Math.min(...group.map((l) => l.x));
    const y0 = group[0].y;
    const x1 = Math.max(...group.map((l) => l.x + l.width));
    const y1 = group[group.length - 1].y + group[group.length - 1].height;
    const heading =
      group.length === 1 &&
      lines.length > 1 &&
      group[0].height >= HEADING_RATIO * typical;
    const owner = regions.length;
    regions.push({
      kind: heading ? "heading" : "paragraph",
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      parent: null,
    });
    for (const line of group)
      regions.push({ kind: "text", ...line, parent: owner });
  }
  return { regions };
}

/** The last source: nothing but pixels. It asks the injected `capture` for the
 * window's image, finds regions, and hands them back in screen DIP with empty
 * text. It answers null when there is nothing to find, so the locator reports
 * no element rather than a guess. */
export function createImageSource({ capture } = {}) {
  return {
    name: "image",
    handles: () => typeof capture === "function",
    async read({ window, display, signal }) {
      if (typeof capture !== "function") return null;
      let image;
      try {
        image = await capture({ window, display, signal });
      } catch {
        return null;
      }
      if (!image?.data || !window?.bounds?.width) return null;
      const scale = image.width / window.bounds.width || 1;
      const { regions } = analyzeImage(image, { scale });
      if (!regions.length) return null;
      const elements = [];
      const parents = new Map();
      regions.forEach((region, n) => {
        elements.push(
          buildElement({
            source: "image",
            windowId: window.id,
            n,
            kind: region.kind,
            bounds: {
              x: window.bounds.x + region.x / scale,
              y: window.bounds.y + region.y / scale,
              width: region.width / scale,
              height: region.height / scale,
            },
            window,
            display,
          }),
        );
      });
      regions.forEach((region, n) => {
        parents.set(
          elements[n].id,
          region.parent === null ? null : elements[region.parent].id,
        );
      });
      return { elements, parents };
    },
  };
}
