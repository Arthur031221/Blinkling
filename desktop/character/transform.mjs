// The two transforms that place Blink, in one place. The drawing writes them as SVG
// attributes and the hit test applies them to the polygons of the parts: both read
// the same rounded numbers through these functions, so what is drawn and what takes
// a pointer cannot drift apart.
const f1 = (v) => Math.round(v * 10) / 10;
const D2R = Math.PI / 180;

/** The pose's move and tilt: the body is turned by `roll` about its pivot, then
 * moved by x and y. */
export function poseTransform(o) {
  const x = f1(o.x ?? 0),
    y = f1(o.y ?? 0),
    roll = f1(o.roll ?? 0),
    [px, py] = o.pivot || [100, 190];
  const c = Math.cos(roll * D2R),
    s = Math.sin(roll * D2R);
  return {
    svg: `translate(${x} ${y}) rotate(${roll} ${px} ${py})`,
    apply: (p) => {
      const dx = p.x - px,
        dy = p.y - py;
      return { x: px + dx * c - dy * s + x, y: py + dx * s + dy * c + y };
    },
  };
}

/** The turn and place of the whole figure for the edge it grips: the feet point
 * (`foot`) and the peek line are moved onto the edge's spot and turned. */
export function edgeTransform(outer, foot, peekY) {
  const x = f1(outer.x),
    y = f1(outer.y),
    angle = f1(outer.angle);
  const c = Math.cos(angle * D2R),
    s = Math.sin(angle * D2R);
  return {
    svg: `translate(${x} ${y}) rotate(${angle}) translate(${-foot} ${-peekY})`,
    apply: (p) => {
      const ex = p.x - foot,
        ey = p.y - peekY;
      return { x: x + ex * c - ey * s, y: y + ex * s + ey * c };
    },
  };
}
