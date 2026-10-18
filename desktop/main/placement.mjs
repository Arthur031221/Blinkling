import { menuLayout } from "../menu/layout.mjs";
import { BLINK_SCALE } from "../character/size.mjs";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const CHARACTER = Object.freeze({ width: 148, height: 152, foot: 142 });
/** Blink's mouth inside its box, from the top left: it sits 69 drawing units
 * above the feet, and the drawing is BLINK_SCALE pixels to the unit. */
export const MOUTH = Object.freeze({
  x: CHARACTER.width / 2,
  y: Math.round(CHARACTER.foot - 69 * BLINK_SCALE),
});
/** Where Blink's mouth is on the screen when its feet stand at `feet`. */
export const mouthOf = (feet) => ({
  x: feet.x + MOUTH.x - CHARACTER.width / 2,
  y: feet.y + MOUTH.y - CHARACTER.foot,
});
/** How far below the mouth a panel's bottom edge sits: panels rise from it. */
export const MOUTH_DROP = 40;
/** The least of its side a card must have beside the mouth for its tail to
 * reach the mouth. */
export const TAIL_REACH = 27;
/** How far past the card's edge the mouth may be when the card slides off a
 * target: farther than this the tail no longer reads as pointing at Blink, so
 * the card stays nearer and covers part of the target instead. */
export const TAIL_FAR = 160;
/** How far past the work area a card may slip to keep its tail on a mouth that
 * a carried Blink has taken near the top or bottom edge. */
export const SLIP_MAX = 160;
/** How far the card window keeps off the top and the bottom of the work area.
 * The window has 12 px of shadow room above the card and 16 below, so with 0
 * above and -10 below (the window may spill 10 px past the area) the card
 * itself stands 12 px under the top and 6 px over the bottom: it reaches the
 * real bottom of the work area, above the Dock, whatever the Dock does. */
export const CARD_REACH = Object.freeze({ top: 0, bottom: -10 });
/** Where a panel of this height starts so that it is anchored to the mouth of
 * the Blink in `box`, kept inside `area` less `margin`. Only a mouth too near
 * the edge for the tail to reach lets it slip out, by as little as that takes. */
export function anchoredTop(box, height, area, margin = 0, snap = 0) {
  const mouth = box.y + MOUTH.y;
  const edge = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const { top: above, bottom: below } =
    typeof margin === "number" ? { top: margin, bottom: margin } : margin;
  const top = area.y + above,
    bottom = area.y + area.height - below;
  const lo = top - edge(top - (mouth - TAIL_REACH), 0, SLIP_MAX),
    hi = bottom - height + edge(mouth + TAIL_REACH - bottom, 0, SLIP_MAX);
  const want = box.y + MOUTH.y + MOUTH_DROP - height;
  // With `snap`, a Blink standing low gets a card that reaches the bottom of
  // the area, not one that stops a few pixels short of it.
  const gap = bottom - (want + height);
  const reaches = gap >= 0 && gap < snap ? bottom - height : want;
  return Math.round(Math.max(lo, Math.min(hi, reaches)));
}
/** A card whose bottom would stop this close to the bottom of the area goes down to it. */
export const BOTTOM_SNAP = 40;
const valid = (p) =>
  p &&
  ["left", "right", "top", "bottom"].includes(p.edge) &&
  Number.isFinite(p.ratio) &&
  p.ratio >= 0 &&
  p.ratio <= 1;
/** Distance from a screen corner, in DIP, inside which a drop rests in the corner. */
const CORNER = 96;
/** Saved edge/ratio is independent of scale, resolution and desktop origin. */
export function snapPosition(display, point) {
  const a = display.workArea;
  const distances = [
    ["left", Math.abs(point.x - a.x)],
    ["right", Math.abs(point.x - a.x - a.width)],
    ["top", Math.abs(point.y - a.y)],
    ["bottom", Math.abs(point.y - a.y - a.height)],
  ];
  const edge = distances.sort((a, b) => a[1] - b[1])[0][0];
  const along = edge === "left" || edge === "right" ? a.height : a.width;
  const ratio = clamp(
    (edge === "left" || edge === "right" ? point.y - a.y : point.x - a.x) /
      along,
    0,
    1,
  );
  // A drop near a corner rests exactly in it, whichever edge was nearer.
  return {
    edge,
    ratio:
      ratio * along < CORNER ? 0 : (1 - ratio) * along < CORNER ? 1 : ratio,
  };
}
/**
 * The display as Blink's window really covers it. The drawing, the pointer test
 * and the flight all measure from the window's own frame, so the card, the tail
 * and a drop must too: a window the system pushed below the menu bar, or a
 * frame rounded to whole pixels, would otherwise put the card and Blink on two
 * origins. `bounds` becomes that frame, everything else stays the display's.
 */
export const placedOn = (display, frame) =>
  frame ? { ...display, bounds: { ...frame } } : display;
export function resolvePosition(display, saved) {
  const a = {
    ...display.workArea,
    x: display.workArea.x - display.bounds.x,
    y: display.workArea.y - display.bounds.y,
  };
  const p = valid(saved) ? saved : { edge: "right", ratio: 0.88 };
  const vertical = p.edge === "left" || p.edge === "right";
  const x = vertical
    ? p.edge === "left"
      ? a.x
      : a.x + a.width
    : clamp(a.x + a.width * p.ratio, a.x + 90, a.x + a.width - 90);
  const y = vertical
    ? clamp(a.y + a.height * p.ratio, a.y + 145, a.y + a.height - 18)
    : p.edge === "top"
      ? a.y + 70
      : a.y + a.height + 55;
  const peek = { x, y };
  // Revealing slides the character in from a side edge or down from the top
  // or up from the bottom, a short hop of at most 90 px; along the edge it
  // never moves, so hovering cannot shove it sideways or fling it across the
  // screen. The menu fan opens below Blink at the top edge and beside or above
  // it elsewhere, so no extra lift is needed.
  const reveal = vertical
    ? { x: clamp(x, a.x + 90, a.x + a.width - 90), y }
    : { x, y: clamp(y, a.y + 150, a.y + a.height - 18) };
  return { ...p, peek, reveal, area: a };
}
/** Blink held in the air at `point` (display coordinates): it keeps the edge it
 * came from, so its card stays on the same side of it and moves with it. */
export const carriedPosition = (position, point) => ({
  ...position,
  peek: { x: point.x, y: point.y },
  reveal: { x: point.x, y: point.y },
});
export function reconcileDisplay(displays, id) {
  return displays.find((d) => String(d.id) === String(id)) ?? displays[0];
}
/** Blink's revealed box in desktop coordinates. */
export function characterBox(display, position) {
  return {
    x: position.reveal.x + display.bounds.x - CHARACTER.width / 2,
    y: position.reveal.y + display.bounds.y - CHARACTER.foot,
    width: CHARACTER.width,
    height: CHARACTER.height,
  };
}
/** The card points at Blink's mouth with a tail. Blink's drawn body reaches
 * `BODY_HALF` px either side of the mouth, the tail is `length` px long and
 * its tip stops `gap` px short of the body. */
export const BODY_HALF = 38;
export const TAIL = Object.freeze({ length: 10, gap: 2 });
/** The card window keeps this much clear around the card for its shadow, and
 * the tail grows into it. */
const SHADOW = 12;
/** Gap kept between the card and Blink and its fan when the card is stacked. */
const CARD_GAP = 6;
/** How far the card window's near edge sits from the mouth, sideways. */
export const CARD_NEAR = BODY_HALF + TAIL.gap + TAIL.length - SHADOW;
/** Narrowest card worth showing beside Blink before stacking it instead. */
const CARD_MIN = 280;
const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
};
/** How far, in DIP, the reader may move a card or panel from where it opens. */
export const NUDGE_MAX = 120;
/** A nudge held to `max` px from where the surface opens. */
export function clampNudge(nudge, max = NUDGE_MAX) {
  const x = Number(nudge?.x),
    y = Number(nudge?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const scale = Math.min(1, max / (Math.hypot(x, y) || 1));
  return { x: Math.round(x * scale), y: Math.round(y * scale) };
}
/** A first-start or settings window goes anywhere in the work area, so its
 * offset is only held to a size no screen reaches. */
export const PANEL_NUDGE_MAX = 5000;
/** The whole work area is reachable: nothing is hidden behind a bar. */
export const PANEL_REACH = Object.freeze({ top: 0, bottom: 0 });
/** `bounds` moved by a nudge, kept inside the work area. */
export function nudged(
  bounds,
  nudge,
  area,
  reach = CARD_REACH,
  max = NUDGE_MAX,
) {
  const n = clampNudge(nudge, max);
  return {
    ...bounds,
    x: Math.round(
      clamp(bounds.x + n.x, area.x, area.x + area.width - bounds.width),
    ),
    y: Math.round(
      clamp(
        bounds.y + n.y,
        area.y + reach.top,
        area.y + area.height - reach.bottom - bounds.height,
      ),
    ),
  };
}
const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
/** A panel (settings, welcome) moved the shortest way off the chat card, so
 * the two never overlap. It moves sideways first, then up or down, and stays
 * on the display; with no room on any side it is left where it is. */
export function clearOfCard(panel, card, area, gap = 12) {
  if (!card || !overlaps(panel, card)) return panel;
  const inside = (r) =>
    r.x >= area.x &&
    r.y >= area.y &&
    r.x + r.width <= area.x + area.width &&
    r.y + r.height <= area.y + area.height;
  const options = [
    { ...panel, x: card.x - gap - panel.width },
    { ...panel, x: card.x + card.width + gap },
    { ...panel, y: card.y - gap - panel.height },
    { ...panel, y: card.y + card.height + gap },
  ]
    .filter(inside)
    .map((r) => ({
      r,
      away: Math.abs(r.x - panel.x) + Math.abs(r.y - panel.y),
    }))
    .sort((a, b) => a.away - b.away);
  return options[0]?.r ?? panel;
}
/** A card slid up or down to where it covers as little as it can of `avoid` (a
 * guide step's targets). It keeps its tail on the mouth where that clears the
 * targets; where it cannot it slides on, its tail then pointing at the mouth
 * from the nearest corner of its side. The card window's own margin is the
 * clearance. Nothing to avoid, or no better place, leaves it where it is. */
export function dodgeCard(card, avoid, area, mouthY) {
  if (!avoid?.length) return card;
  // A card that slipped out to keep its tail on the mouth has no room to slide.
  if (card.y < area.y || card.y + card.height > area.y + area.height)
    return card;
  const hidden = (y) =>
    avoid.reduce((sum, r) => {
      const w =
          Math.min(card.x + card.width, r.x + r.width) - Math.max(card.x, r.x),
        h = Math.min(y + card.height, r.y + r.height) - Math.max(y, r.y);
      return sum + (w > 0 && h > 0 ? w * h : 0);
    }, 0);
  const reach = (span) => {
    const lowest = Math.max(area.y, mouthY + span - card.height),
      highest = Math.min(area.y + area.height - card.height, mouthY - span);
    const tops = [
      card.y,
      ...avoid.flatMap((r) => [r.y + r.height, r.y - card.height]),
    ]
      .map((y) => Math.round(clamp(y, lowest, highest)))
      .filter(() => lowest <= highest);
    return tops
      .map((y) => ({ y, hidden: hidden(y), moved: Math.abs(y - card.y) }))
      .sort((p, q) => p.hidden - q.hidden || p.moved - q.moved)[0];
  };
  const tail = reach(TAIL_REACH);
  const best = tail?.hidden === 0 ? tail : (reach(-TAIL_FAR) ?? tail);
  return best && best.hidden < hidden(card.y) ? { ...card, y: best.y } : card;
}
/** The card's rectangle. It never covers Blink's body, wherever Blink rests:
 * beside Blink with its tail a few pixels from the body at mouth height, on
 * the side away from its edge, narrowed when the display is too narrow for
 * the full width; stacked above or below Blink and its fan on a display too
 * narrow even for that. */
export function cardBounds(
  display,
  position,
  nudge = { x: 0, y: 0 },
  wanted = Infinity,
  avoid = [],
  size = null,
) {
  const placed = placedCard(display, position, wanted, size);
  const area = display.workArea;
  const moved = nudged(placed, nudge, area);
  // A card that slipped out to keep its tail on the mouth keeps where it is.
  const settled =
    placed.y < area.y || placed.y + placed.height > area.y + area.height
      ? { ...moved, y: placed.y }
      : moved;
  return dodgeCard(
    settled,
    avoid,
    area,
    characterBox(display, position).y + MOUTH.y,
  );
}
/** The card window is never shorter than this, so a card with nothing in it
 * still shows its header and its composer whole. */
export const CARD_SHORTEST = 120;
function placedCard(display, position, wanted = Infinity, size = null) {
  const a = display.workArea,
    reach = a.height - CARD_REACH.top - CARD_REACH.bottom,
    // A card the reader sized keeps that size: its width, and its height
    // whatever the content asks. Otherwise the card is as tall as its content.
    full = size ? size.width : Math.min(440, a.width - 24),
    most = size ? size.height : Math.min(520, reach),
    height = Math.round(
      size
        ? Math.min(size.height, reach)
        : Math.min(most, Math.max(CARD_SHORTEST, Number(wanted) || most)),
    );
  const blink = characterBox(display, position);
  const anchor = {
    x: position.reveal.x + display.bounds.x,
    y: position.reveal.y + display.bounds.y,
  };
  const centre = blink.x + blink.width / 2;
  const y = anchoredTop(blink, height, a, CARD_REACH, BOTTOM_SNAP);
  // Beside Blink, away from its edge. On a top or bottom edge, or in a corner,
  // take whichever side has room so the card never lands on top of Blink.
  const room = {
    left: centre - CARD_NEAR - (a.x + 12),
    right: a.x + a.width - 12 - (centre + CARD_NEAR),
  };
  const order =
    position.edge === "left" ? ["right", "left"] : ["left", "right"];
  const side =
    order.find((s) => room[s] >= full) ??
    order.sort((p, q) => room[q] - room[p])[0];
  if (room[side] >= Math.min(full, CARD_MIN)) {
    const width = Math.min(full, Math.floor(room[side]));
    return {
      // Rounded away from Blink, so the card never takes a pixel of its body.
      x:
        side === "left"
          ? Math.floor(centre - CARD_NEAR - width)
          : Math.ceil(centre + CARD_NEAR),
      y,
      width,
      height,
    };
  }
  const fan = menuLayout(position.area, position.reveal).map((r) => ({
    ...r,
    x: r.x + display.bounds.x,
    y: r.y + display.bounds.y,
  }));
  const keepClear = union([blink, ...fan]);
  const above = keepClear.y - CARD_GAP - (a.y + CARD_REACH.top),
    below =
      a.y +
      a.height -
      CARD_REACH.bottom -
      (keepClear.y + keepClear.height + CARD_GAP);
  const tall = Math.min(height, Math.max(above, below));
  return {
    x: Math.round(
      clamp(anchor.x - full / 2, a.x + 12, a.x + a.width - full - 12),
    ),
    y: Math.round(
      above >= below
        ? keepClear.y - CARD_GAP - tall
        : keepClear.y + keepClear.height + CARD_GAP,
    ),
    width: full,
    height: Math.round(tall),
  };
}

const clampPlacement = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const defaultPlacement = (display) => ({
  edge: "right",
  fraction: Math.max(0, 1 - 110 / display.workArea.height),
});
export function resolvePlacement(p, display) {
  const { width: w, height: h } = display.workArea;
  const t = clampPlacement(p.fraction, 0, 1);
  return p.edge === "left"
    ? { x: 0, y: t * h }
    : p.edge === "right"
      ? { x: w, y: t * h }
      : p.edge === "top"
        ? { x: t * w, y: 0 }
        : { x: t * w, y: h };
}
export function snapPlacement(point, display) {
  const b = display.workArea;
  const x = clampPlacement(point.x - b.x, 0, b.width),
    y = clampPlacement(point.y - b.y, 0, b.height);
  const [edge] = [
    ["left", x],
    ["right", b.width - x],
    ["top", y],
    ["bottom", b.height - y],
  ].sort((a, b) => a[1] - b[1])[0];
  let fraction = ["left", "right"].includes(edge) ? y / b.height : x / b.width;
  const length = ["left", "right"].includes(edge) ? b.height : b.width;
  if (fraction * length < 64) fraction = 0;
  if ((1 - fraction) * length < 64) fraction = 1;
  return { edge, fraction };
}
export function visiblePlacement(point, display) {
  const b = display.workArea;
  return {
    x: clampPlacement(
      point.x,
      Math.min(142, b.width / 2),
      Math.max(b.width / 2, b.width - 142),
    ),
    y: clampPlacement(point.y, Math.min(294, b.height - 96), b.height - 96),
  };
}
