import test from "node:test";
import assert from "node:assert/strict";
import {
  clearOfCard,
  snapPosition,
  resolvePosition,
  reconcileDisplay,
  BODY_HALF,
  TAIL,
  cardBounds,
  clampNudge,
  NUDGE_MAX,
  MOUTH,
  mouthOf,
  MOUTH_DROP,
  carriedPosition,
  anchoredTop,
  TAIL_REACH,
  SLIP_MAX,
} from "./placement.mjs";
import { menuLayout, menuTransform } from "../menu/layout.mjs";
const display = {
  id: 1,
  bounds: { x: -1280, y: 0, width: 1280, height: 800 },
  workArea: { x: -1280, y: 24, width: 1280, height: 752 },
  scaleFactor: 1.5,
};
test("default is half hidden at the right edge, near the bottom; reveal stays inside work area", () => {
  const p = resolvePosition(display);
  assert.equal(p.peek.x, 1280);
  assert.equal(p.edge, "right");
  assert.ok(p.peek.y > 600 && p.peek.y < 752);
  assert.ok(p.reveal.x < 1220);
});
test("drag release selects nearest edge including negative origins and corners", () => {
  assert.equal(snapPosition(display, { x: -1270, y: 260 }).edge, "left");
  assert.equal(snapPosition(display, { x: -600, y: 30 }).edge, "top");
  const bottom = snapPosition(display, { x: -600, y: 772 });
  assert.equal(bottom.edge, "bottom");
  assert.ok(bottom.ratio > 0.4 && bottom.ratio < 0.6);
});
test("stored normalized placement survives resolution and scale changes independently for each display", () => {
  const stored = snapPosition(display, { x: -1270, y: 340 });
  const resized = {
    ...display,
    bounds: { x: -1920, y: -400, width: 1920, height: 1200 },
    workArea: { x: -1920, y: -376, width: 1920, height: 1152 },
    scaleFactor: 2,
  };
  const a = resolvePosition(display, stored),
    b = resolvePosition(resized, stored);
  assert.equal(a.edge, b.edge);
  assert.ok(Math.abs((a.peek.y - 24) / 752 - (b.peek.y - 24) / 1152) < 0.02);
  assert.equal(
    resolvePosition(display, { edge: "shell:exec", ratio: NaN }).edge,
    "right",
  );
});
test("display removal falls back without discarding saved positions for disconnected displays", () => {
  assert.equal(reconcileDisplay([display, { ...display, id: 2 }], 2).id, 2);
  assert.equal(reconcileDisplay([display], 2).id, 1);
});
for (const scale of [1, 1.5, 2])
  test(`rounded card stays on its display at ${scale * 100}% and negative origins`, () => {
    const scaled = { ...display, scaleFactor: scale };
    const b = cardBounds(scaled, resolvePosition(scaled));
    assert.ok(b.x >= display.workArea.x && b.y >= display.workArea.y);
    assert.ok(b.x + b.width <= display.workArea.x + display.workArea.width);
    assert.ok(b.y + b.height <= display.workArea.y + display.workArea.height);
  });

const corners = [
  ["top-left", (a) => ({ x: a.x, y: a.y })],
  ["top-right", (a) => ({ x: a.x + a.width, y: a.y })],
  ["bottom-left", (a) => ({ x: a.x, y: a.y + a.height })],
  ["bottom-right", (a) => ({ x: a.x + a.width, y: a.y + a.height })],
];
const inside = (r, a) =>
  r.x >= a.x - 0.5 &&
  r.y >= a.y - 0.5 &&
  r.x + r.width <= a.x + a.width + 0.5 &&
  r.y + r.height <= a.y + a.height + 0.5;
for (const scale of [1, 1.5])
  for (const [name, corner] of corners)
    test(`${name} rest position at ${scale * 100}%: hover keeps x, card and menu stay on screen`, () => {
      const physical = { width: 1920, height: 1080 };
      const bounds = {
        x: 0,
        y: 0,
        width: physical.width / scale,
        height: physical.height / scale,
      };
      const d = {
        id: 1,
        bounds,
        workArea: { ...bounds, y: 28, height: bounds.height - 28 },
        scaleFactor: scale,
      };
      const saved = snapPosition(d, corner(d.workArea));
      const p = resolvePosition(d, saved);
      const area = p.area;
      // The character is 148 wide and hangs 142 above its anchor.
      const body = (at) => ({
        x: at.x - 74,
        y: at.y - 142,
        width: 148,
        height: 152,
      });
      if (p.edge === "top" || p.edge === "bottom")
        assert.equal(
          p.reveal.x,
          p.peek.x,
          "hover must not move the character along the edge",
        );
      assert.ok(p.reveal.y >= area.y && p.reveal.y <= area.y + area.height);
      if (p.edge === "left" || p.edge === "right")
        assert.ok(
          body(p.reveal).y >= area.y,
          "revealed body stays below the top",
        );
      if (p.edge === "top" || p.edge === "bottom")
        assert.ok(inside({ ...body(p.reveal), y: area.y }, area));
      assert.ok(inside(cardBounds(d, p), d.workArea), "card");
      for (const rect of menuLayout(area, p.reveal)) {
        const shown = menuTransform(area, p.reveal, rect, 1);
        const w = rect.width * shown.scale,
          h = rect.height * shown.scale;
        const cx = rect.x + shown.x + rect.width / 2,
          cy = rect.y + shown.y + rect.height / 2;
        assert.ok(
          inside({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }, area),
          "menu pill",
        );
      }
    });
test("reveal never moves a top or bottom resting character sideways", () => {
  for (const edge of ["top", "bottom"])
    for (const ratio of [0, 0.02, 0.5, 0.98, 1]) {
      const p = resolvePosition(display, { edge, ratio });
      assert.equal(p.reveal.x, p.peek.x, `${edge} ${ratio}`);
    }
});
test("revealing is a short hop on every edge, never a long slide", () => {
  for (const edge of ["left", "right", "top", "bottom"])
    for (const ratio of [0.1, 0.5, 0.9]) {
      const p = resolvePosition(display, { edge, ratio });
      const hop = Math.hypot(p.reveal.x - p.peek.x, p.reveal.y - p.peek.y);
      assert.ok(hop <= 90, `${edge} ${ratio} hop ${hop}`);
    }
});
const panels = {
  "100%": {
    id: 7,
    bounds: { x: 1920, y: -120, width: 1280, height: 800 },
    workArea: { x: 1920, y: -96, width: 1280, height: 752 },
    scaleFactor: 1,
  },
  // Electron reports DIP, so a 150% panel of 1920x1200 px is 1280x800 DIP.
  "150%": {
    id: 8,
    bounds: { x: 0, y: 0, width: 853, height: 533 },
    workArea: { x: 0, y: 24, width: 853, height: 509 },
    scaleFactor: 1.5,
  },
};
const cornerPoints = {
  "top-left": (a) => ({ x: a.x + 6, y: a.y + 6 }),
  "top-right": (a) => ({ x: a.x + a.width - 6, y: a.y + 6 }),
  "bottom-left": (a) => ({ x: a.x + 6, y: a.y + a.height - 6 }),
  "bottom-right": (a) => ({ x: a.x + a.width - 6, y: a.y + a.height - 6 }),
};
const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
for (const [scale, screen] of Object.entries(panels))
  for (const [name, at] of Object.entries(cornerPoints))
    test(`${name} corner is a valid rest position with the card and menu fully on screen at ${scale}`, () => {
      const a = screen.workArea;
      const saved = snapPosition(screen, at(a));
      assert.ok(
        saved.ratio === 0 || saved.ratio === 1,
        "corner snaps to its end",
      );
      const position = resolvePosition(screen, saved);
      const card = cardBounds(screen, position);
      assert.ok(card.x >= a.x && card.x + card.width <= a.x + a.width);
      assert.ok(card.y >= a.y && card.y + card.height <= a.y + a.height);
      // The revealed character, its menu column and its card never overlap.
      const anchor = {
        x: position.reveal.x + screen.bounds.x,
        y: position.reveal.y + screen.bounds.y,
      };
      const character = {
        x: anchor.x - BODY_HALF,
        y: anchor.y - 142,
        width: 2 * BODY_HALF,
        height: 152,
      };
      assert.ok(!overlaps(card, character), "card clears the revealed Blink");
      const area = position.area;
      assert.ok(
        position.reveal.x >= area.x + 74 &&
          position.reveal.x <= area.x + area.width - 74,
      );
      assert.ok(position.reveal.y - 142 >= area.y - 1);
      assert.ok(position.reveal.y <= area.y + area.height);
    });
test("hovering never changes the position along the edge, anywhere along it", () => {
  for (const screen of Object.values(panels))
    for (const ratio of [0, 0.02, 0.05, 0.5, 0.95, 0.98, 1]) {
      for (const edge of ["top", "bottom"]) {
        const p = resolvePosition(screen, { edge, ratio });
        assert.equal(p.reveal.x, p.peek.x, `${edge} ${ratio}`);
      }
      for (const edge of ["left", "right"]) {
        const p = resolvePosition(screen, { edge, ratio });
        assert.equal(p.reveal.y, p.peek.y, `${edge} ${ratio}`);
      }
    }
});
test("the card takes the side of Blink that has room, whatever the edge", () => {
  const screen = panels["100%"];
  const top = resolvePosition(screen, { edge: "top", ratio: 0 });
  assert.ok(cardBounds(screen, top).x > top.reveal.x + screen.bounds.x);
  const topRight = resolvePosition(screen, { edge: "top", ratio: 1 });
  assert.ok(
    cardBounds(screen, topRight).x < topRight.reveal.x + screen.bounds.x,
  );
});
test("the card rises from Blink's mouth and moves with Blink along its edge", () => {
  const screen = panels["100%"];
  const at = (ratio) => resolvePosition(screen, { edge: "right", ratio });
  const mouthOf = (p) =>
    p.reveal.y + screen.bounds.y - 142 + MOUTH.y + MOUTH_DROP;
  const a = at(0.85),
    b = at(0.95);
  const card = (p) => cardBounds(screen, p);
  assert.equal(card(a).y + card(a).height, Math.round(mouthOf(a)));
  assert.equal(card(b).y + card(b).height, Math.round(mouthOf(b)));
  assert.ok(card(b).y > card(a).y, "a lower Blink brings the card lower");
});
for (const [name, d] of Object.entries({
  "a narrow display right of the primary (the seam)": {
    id: 2,
    scaleFactor: 1,
    bounds: { x: 1280, y: 0, width: 800, height: 600 },
    workArea: { x: 1280, y: 0, width: 800, height: 570 },
  },
  "a narrow display left of the primary (the seam)": {
    id: 3,
    scaleFactor: 1,
    bounds: { x: -1024, y: 0, width: 1024, height: 768 },
    workArea: { x: -1024, y: 24, width: 1024, height: 744 },
  },
  "a wide display": {
    id: 4,
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1050 },
  },
}))
  test(`the card never covers Blink or its fan, anywhere along any edge of ${name}`, () => {
    for (const edge of ["left", "right", "top", "bottom"])
      for (const ratio of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
        const p = resolvePosition(d, { edge, ratio });
        const card = cardBounds(d, p);
        const blink = {
          x: p.reveal.x + d.bounds.x - BODY_HALF,
          y: p.reveal.y + d.bounds.y - 142,
          width: 2 * BODY_HALF,
          height: 152,
        };
        assert.ok(!overlaps(card, blink), `${edge} ${ratio} covers Blink`);
        // Beside Blink the card may sit where the fan would open: the menu
        // and the card are never open together. Stacked, the card keeps clear.
        const centre = blink.x + BODY_HALF;
        const stacked = card.x < centre && centre < card.x + card.width;
        for (const pill of stacked ? menuLayout(p.area, p.reveal) : [])
          assert.ok(
            !overlaps(card, {
              ...pill,
              x: pill.x + d.bounds.x,
              y: pill.y + d.bounds.y,
            }),
            `${edge} ${ratio} covers the fan`,
          );
        assert.ok(card.x >= d.workArea.x, `${edge} ${ratio} left`);
        assert.ok(
          card.x + card.width <= d.workArea.x + d.workArea.width,
          `${edge} ${ratio} right`,
        );
        assert.ok(card.y >= d.workArea.y, `${edge} ${ratio} top`);
        assert.ok(
          card.y + card.height <= d.workArea.y + d.workArea.height,
          `${edge} ${ratio} bottom`,
        );
        assert.ok(card.height >= 200, `${edge} ${ratio} stays usable`);
      }
  });

test("the mouth is straight above the feet, where the drawing puts it", () => {
  const mouth = mouthOf({ x: 600, y: 700 });
  assert.equal(mouth.x, 600);
  assert.equal(mouth.y, 700 - (142 - MOUTH.y));
  // Smaller than full size, so closer to the feet than the 64 px of the full drawing.
  assert.ok(700 - mouth.y < 64);
});

test("the card's tail stops within 12 px of Blink's body, at the height of its mouth, wherever Blink rests", () => {
  for (const d of Object.values(panels))
    for (const edge of ["left", "right", "top", "bottom"])
      for (const ratio of [0, 0.1, 0.5, 0.9, 1]) {
        const p = resolvePosition(d, { edge, ratio });
        const card = cardBounds(d, p);
        const mouth = mouthOf({
          x: p.reveal.x + d.bounds.x,
          y: p.reveal.y + d.bounds.y,
        });
        if (card.x < mouth.x && mouth.x < card.x + card.width) continue;
        const left = card.x + card.width < mouth.x;
        const tip = left
          ? card.x + card.width - 12 + TAIL.length
          : card.x + 12 - TAIL.length;
        const gap = Math.abs(tip - mouth.x) - BODY_HALF;
        assert.ok(gap >= 0 && gap <= 12, `${edge} ${ratio} gap ${gap}`);
        assert.ok(
          mouth.y > card.y + 40 && mouth.y < card.y + card.height - 30,
          `${edge} ${ratio} the mouth is level with the card`,
        );
      }
});

test("a nudge moves the card at most 120 px from where it opens and never off the screen", () => {
  const screen = panels["100%"];
  const p = resolvePosition(screen, { edge: "right", ratio: 0.5 });
  const home = cardBounds(screen, p);
  const moved = cardBounds(screen, p, { x: -60, y: 30 });
  assert.deepEqual([moved.x - home.x, moved.y - home.y], [-60, 30]);
  const far = cardBounds(screen, p, { x: -900, y: 0 });
  assert.equal(home.x - far.x, NUDGE_MAX);
  const corner = resolvePosition(screen, { edge: "right", ratio: 1 });
  const down = cardBounds(screen, corner, { x: 0, y: 120 });
  assert.ok(down.y + down.height <= screen.workArea.y + screen.workArea.height);
  assert.deepEqual(clampNudge({ x: 300, y: 400 }), { x: 72, y: 96 });
  assert.deepEqual(clampNudge({ x: NaN, y: 1 }), { x: 0, y: 0 });
  assert.deepEqual(clampNudge(undefined), { x: 0, y: 0 });
  assert.deepEqual(cardBounds(screen, p, { x: 0, y: 0 }), home);
});

test("a carried Blink brings its card along: the same offset and the tail on the mouth at every point of the drag", () => {
  const rest = resolvePosition(display, { edge: "right", ratio: 0.8 });
  const start = { x: rest.reveal.x, y: rest.reveal.y };
  const first = cardBounds(display, carriedPosition(rest, start));
  // At the start of the carry nothing has moved.
  assert.deepEqual(first, cardBounds(display, rest));
  const firstMouth = mouthOf(start);
  for (const [dx, dy] of [
    [-60, 20],
    [-300, -40],
    [-420, 110],
    [-200, -70],
  ]) {
    const at = { x: start.x + dx, y: start.y + dy };
    const card = cardBounds(display, carriedPosition(rest, at));
    const mouth = mouthOf(at);
    assert.equal(card.x - first.x, dx, `${dx},${dy} sideways`);
    assert.equal(card.y - first.y, dy, `${dx},${dy} upwards`);
    assert.equal(mouth.x - card.x, firstMouth.x - first.x);
    assert.equal(mouth.y - card.y, firstMouth.y - first.y);
  }
});

test("a carried Blink is never covered by its card, over the whole screen and at every resting edge", () => {
  const a = display.workArea;
  for (const edge of ["left", "right", "top", "bottom"]) {
    const rest = resolvePosition(display, { edge, ratio: 0.5 });
    for (
      let x = a.x - display.bounds.x + 20;
      x <= a.x - display.bounds.x + a.width - 20;
      x += 40
    )
      for (let y = 160; y <= a.height - 10; y += 30) {
        const at = carriedPosition(rest, { x, y });
        const card = cardBounds(display, at);
        const blink = {
          x: x + display.bounds.x - BODY_HALF,
          y: y + display.bounds.y - 142,
          width: 2 * BODY_HALF,
          height: 152,
        };
        assert.ok(!overlaps(card, blink), `${edge} ${x},${y} covers Blink`);
        assert.ok(
          card.y >= a.y && card.y + card.height <= a.y + a.height,
          `${edge} ${x},${y} inside`,
        );
      }
  }
});

test("a carried Blink keeps its resting edge, so the card does not jump to the nearest edge mid carry", () => {
  const rest = resolvePosition(display, { edge: "right", ratio: 0.5 });
  const carried = carriedPosition(rest, { x: 40, y: 400 });
  assert.equal(carried.edge, "right");
  assert.deepEqual(carried.reveal, { x: 40, y: 400 });
  assert.deepEqual(carried.peek, { x: 40, y: 400 });
});

test("where the card cannot follow any further it stays on the screen and its tail still reaches the mouth", () => {
  const rest = resolvePosition(display, { edge: "right", ratio: 0.8 });
  const at = { x: rest.reveal.x - 300, y: 150 };
  const card = cardBounds(display, carriedPosition(rest, at));
  const mouth = mouthOf(at);
  assert.ok(card.y >= display.workArea.y);
  assert.ok(mouth.y >= card.y - 8 && mouth.y <= card.y + card.height + 8);
});

test("a card asked to be short is short, keeps its bottom where the full card had it and grows upward", () => {
  const position = resolvePosition(display);
  const full = cardBounds(display, position);
  const short = cardBounds(display, position, { x: 0, y: 0 }, 200);
  assert.equal(short.height, 200);
  assert.equal(short.x, full.x);
  assert.equal(short.y + short.height, full.y + full.height);
  const taller = cardBounds(display, position, { x: 0, y: 0 }, 300);
  assert.equal(taller.y + taller.height, short.y + short.height);
  assert.ok(taller.y < short.y);
  assert.equal(
    cardBounds(display, position, { x: 0, y: 0 }, 9999).height,
    full.height,
    "never taller than the full card",
  );
  assert.ok(
    cardBounds(display, position, { x: 0, y: 0 }, 10).height >= 120,
    "never a sliver",
  );
});

test("a panel the card would cover is moved the shortest way off it and stays on the display", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const panel = { x: 436, y: 80, width: 410, height: 640 };
  const card = { x: 725, y: 340, width: 415, height: 355 };
  const moved = clearOfCard(panel, card, area);
  assert.equal(moved.y, panel.y, "sideways first");
  assert.ok(moved.x + moved.width <= card.x, "clear of the card on its left");
  assert.ok(moved.x >= area.x);
  // A panel that does not touch the card stays where it is.
  const apart = { x: 20, y: 80, width: 410, height: 640 };
  assert.equal(clearOfCard(apart, card, area), apart);
  assert.equal(clearOfCard(panel, null, area), panel);
  // No room on any side: it is left alone rather than pushed off the display.
  const tight = { x: 0, y: 0, width: 500, height: 400 };
  const fill = { x: 100, y: 100, width: 300, height: 200 };
  assert.equal(
    clearOfCard(tight, fill, { x: 0, y: 0, width: 500, height: 400 }),
    tight,
  );
  // The card to the left of the middle sends the panel to its right.
  const left = { x: 100, y: 340, width: 415, height: 355 };
  const right = clearOfCard({ ...panel, x: 300 }, left, area);
  assert.ok(right.x >= left.x + left.width);
});
test("a card slips past the top of the work area only as far as its tail needs to reach a mouth near it", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const at = (mouth) => ({ x: 0, y: mouth - MOUTH.y, width: 148, height: 152 });
  // Room for the tail: the card keeps its margin from the top.
  assert.equal(anchoredTop(at(300), 205, area, 12), 300 + MOUTH_DROP - 205);
  assert.equal(anchoredTop(at(60), 205, area, 12), 12);
  // The mouth is nearer the edge than the tail reaches: the card goes up with it.
  assert.equal(anchoredTop(at(0), 205, area, 12), -TAIL_REACH);
  assert.equal(anchoredTop(at(-100), 205, area, 12), -100 - TAIL_REACH);
  // Never further than the slip allows, and the same at the bottom.
  assert.equal(anchoredTop(at(-1000), 205, area, 12), 12 - SLIP_MAX);
  assert.equal(anchoredTop(at(800), 205, area, 12), 800 + TAIL_REACH - 205);
});
test("a carried Blink at the top of the screen keeps its card's place off the work area", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const screen = { id: 1, bounds: area, workArea: area, scaleFactor: 1 };
  const held = carriedPosition(resolvePosition(screen), { x: 1100, y: 20 });
  const card = cardBounds(screen, held, { x: 0, y: 0 }, 205);
  const mouth = mouthOf(held.reveal).y;
  assert.ok(card.y < 0, "the card slipped");
  assert.ok(mouth >= card.y + TAIL_REACH, "the tail reaches the mouth");
});
