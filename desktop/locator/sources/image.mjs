// Source 3: what can be told from the pixels alone, for windows that expose no
// structure (a game, a remote desktop, a canvas-only app). Coarse on purpose:
// photographs, lines of text, and blocks of lines.

const CELL = 4; // capture pixels per analysis cell
const BG_TOLERANCE = 16; // per channel, 0..255
const RICH_COLOURS = 6; // distinct 12-bit colours in a cell that make it "rich"
const IMAGE_MIN_DIP = 24;
const IMAGE_MIN_FILL = 0.8;
const LINE_MAX_DIP = 40;
const WORD_GAP_DIP = 6;
const MAX_REGIONS = 200;

function background(data, width, height) {
  const counts = new Map();
  const stride = 7;
  let best = 0;
  let bestKey = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const key =
        ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (n > best) {
        best = n;
        bestKey = key;
      }
    }
  }
  const pick = (shift) => ((bestKey >> shift) & 31) * 8 + 4;
  return [pick(10), pick(5), pick(0)];
}

// Cell classes: 0 background, 1 ink, 2 rich (many colours). A generator: it
// yields after every row of cells so a caller on the main loop can give the
// loop back (see analyseAsync); analyse() just runs it through.
function* classify({ data, width, height }) {
  const [br, bg, bb] = background(data, width, height);
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const cells = new Uint8Array(cols * rows);
  const seen = new Uint16Array(RICH_COLOURS + 1);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let ink = false;
      let distinct = 0;
      const y1 = Math.min(height, (cy + 1) * CELL);
      const x1 = Math.min(width, (cx + 1) * CELL);
      for (let y = cy * CELL; y < y1; y++) {
        for (let x = cx * CELL; x < x1; x++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (
            Math.abs(r - br) <= BG_TOLERANCE &&
            Math.abs(g - bg) <= BG_TOLERANCE &&
            Math.abs(b - bb) <= BG_TOLERANCE
          )
            continue;
          ink = true;
          if (distinct >= RICH_COLOURS) continue;
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          let known = false;
          for (let k = 0; k < distinct; k++) if (seen[k] === key) known = true;
          if (!known) seen[distinct++] = key;
        }
      }
      if (ink) cells[cy * cols + cx] = distinct >= RICH_COLOURS ? 2 : 1;
    }
    yield;
  }
  return { cells, cols, rows };
}

// Connected components over the cells `mask` accepts. Returns cell bounds.
function components(cols, rows, accepts, diagonal) {
  const label = new Int32Array(cols * rows).fill(-1);
  const found = [];
  const stack = [];
  const steps = diagonal
    ? [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ];
  for (let start = 0; start < cols * rows; start++) {
    if (label[start] !== -1 || !accepts(start)) continue;
    const id = found.length;
    const box = { x0: cols, y0: rows, x1: -1, y1: -1, count: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop();
      const x = at % cols;
      const y = (at - x) / cols;
      box.count++;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (label[next] !== -1 || !accepts(next)) continue;
        label[next] = id;
        stack.push(next);
      }
    }
    found.push(box);
  }
  return found;
}

const cellRect = (box, width, height) => ({
  x: box.x0 * CELL,
  y: box.y0 * CELL,
  width: Math.min(width, (box.x1 + 1) * CELL) - box.x0 * CELL,
  height: Math.min(height, (box.y1 + 1) * CELL) - box.y0 * CELL,
});

function* steps(canvas) {
  const { width, height } = canvas;
  const scale = canvas.scale || 1;
  if (
    !(width > 0 && height > 0) ||
    !canvas.data ||
    canvas.data.length < width * height * 4
  )
    return [];
  const { cells, cols, rows } = yield* classify(canvas);
  const regions = [];

  // Photographs and other colour-rich blocks.
  const minImage = Math.ceil((IMAGE_MIN_DIP * scale) / CELL);
  const claimed = new Uint8Array(cols * rows);
  for (const box of components(cols, rows, (i) => cells[i] === 2, false)) {
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    if (w < minImage || h < minImage || box.count / (w * h) < IMAGE_MIN_FILL)
      continue;
    regions.push({ kind: "image", bounds: cellRect(box, width, height) });
    for (
      let y = Math.max(0, box.y0 - 1);
      y <= Math.min(rows - 1, box.y1 + 1);
      y++
    )
      for (
        let x = Math.max(0, box.x0 - 1);
        x <= Math.min(cols - 1, box.x1 + 1);
        x++
      )
        claimed[y * cols + x] = 1;
  }

  // Lines of text: ink outside images, with word gaps closed horizontally.
  const gap = Math.max(2, Math.ceil((WORD_GAP_DIP * scale) / CELL));
  const ink = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    let last = -Infinity;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!cells[i] || claimed[i]) continue;
      if (x - last <= gap + 1)
        for (let fill = last + 1; fill <= x; fill++) ink[y * cols + fill] = 1;
      ink[i] = 1;
      last = x;
    }
  }
  const maxLine = Math.ceil((LINE_MAX_DIP * scale) / CELL);
  const lines = components(cols, rows, (i) => ink[i] === 1, false)
    .filter((box) => box.y1 - box.y0 + 1 <= maxLine && box.x1 - box.x0 >= 2)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // Neighbouring lines that start at the same edge form a paragraph.
  const used = new Set();
  for (const line of lines) {
    if (used.has(line)) continue;
    used.add(line);
    const group = [line];
    for (let tail = line; ; ) {
      const next = lines.find(
        (c) =>
          !used.has(c) &&
          c.y0 > tail.y0 &&
          c.y0 - (tail.y1 + 1) <= tail.y1 - tail.y0 + 1 &&
          Math.abs(c.x0 - line.x0) <= 3 &&
          c.y0 - tail.y1 > 0,
      );
      if (!next) break;
      used.add(next);
      group.push(next);
      tail = next;
    }
    const box = group.reduce(
      (all, c) => ({
        x0: Math.min(all.x0, c.x0),
        y0: Math.min(all.y0, c.y0),
        x1: Math.max(all.x1, c.x1),
        y1: Math.max(all.y1, c.y1),
      }),
      { x0: cols, y0: rows, x1: -1, y1: -1 },
    );
    regions.push({
      kind: group.length > 1 ? "paragraph" : "text",
      bounds: cellRect(box, width, height),
    });
  }

  regions.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  return regions.slice(0, MAX_REGIONS);
}

// canvas: { width, height, data (RGBA or BGRA), scale } -> [{ kind, bounds }]
// with bounds in capture pixels, in reading order.
export function analyse(canvas) {
  const run = steps(canvas);
  for (let step = run.next(); ; step = run.next())
    if (step.done) return step.value;
}

const SLICE_MS = 4;

/** analyse(), but it hands the event loop back every few milliseconds, so a
 * large window never holds up a hover, a timer or the UI while it is read. */
export async function analyseAsync(canvas) {
  const run = steps(canvas);
  let since = performance.now();
  for (let step = run.next(); ; step = run.next()) {
    if (step.done) return step.value;
    if (performance.now() - since >= SLICE_MS) {
      await new Promise((resolve) => setImmediate(resolve));
      since = performance.now();
    }
  }
}

export function createImageSource({ capture }) {
  return {
    name: "image",
    applies: (win) => typeof capture?.image === "function" && !!win?.bounds,
    async load(win) {
      if (typeof capture?.image !== "function") return null;
      let picture;
      try {
        picture = await capture.image(win.bounds);
      } catch {
        return null;
      }
      if (!picture?.data) return null;
      const scale = picture.scale || 1;
      const elements = (await analyseAsync({ ...picture, scale })).map(
        (region, n) => ({
          key: String(n),
          parent: null,
          kind: region.kind,
          bounds: {
            x: win.bounds.x + region.bounds.x / scale,
            y: win.bounds.y + region.bounds.y / scale,
            width: region.bounds.width / scale,
            height: region.bounds.height / scale,
          },
          role: "",
          name: "",
          text: "",
          secure: false,
        }),
      );
      return elements.length ? { elements } : null;
    },
  };
}
