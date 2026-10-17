/** A debug view of what takes a pointer, drawn over the window only when the app is
 * started with BLINKLING_DEBUG_HIT=1: the grown hit regions in blue, each touchable
 * part in its own colour, and the pointer as main last reported it as a dot. It
 * reads the same polygons the click-through uses, so it shows the truth. */
const NS = "http://www.w3.org/2000/svg";
const COLORS = {
  head: "#ff5d5d",
  belly: "#ffb84d",
  cheek: "#ff4da6",
  hand: "#b84dff",
  foot: "#4dd2ff",
};

export function createHitOverlay(host) {
  const svg = document.createElementNS(NS, "svg");
  svg.id = "debug-hit";
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99";
  host.append(svg);
  const path = (poly, attrs) =>
    `<path d="M${poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z" ${attrs}/>`;
  return {
    draw({ regions, parts, pointer }) {
      const rects = regions
        .map(
          (r) =>
            `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#2d7dff" fill-opacity=".22"/>`,
        )
        .join("");
      const named = parts
        .map((n) =>
          path(
            n.poly,
            `fill="${COLORS[n.part] ?? "#fff"}" fill-opacity=".35" stroke="${COLORS[n.part] ?? "#fff"}" stroke-width=".8"`,
          ),
        )
        .join("");
      const dot = pointer
        ? `<circle cx="${pointer.x}" cy="${pointer.y}" r="3" fill="#fff" stroke="#000"/>`
        : "";
      svg.innerHTML = rects + named + dot;
    },
  };
}
