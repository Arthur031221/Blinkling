import { createGesture } from "./gesture.mjs";
import { effectPlan, lockPlan } from "./effects.mjs";
import { badgeFor } from "./badge.mjs";
import { timing } from "../shared/motion.mjs";
import { textAttachment, imageAttachment } from "./taken.mjs";

const names = {
  table: "Table.txt",
  code: "Code.txt",
  section: "Section.txt",
  page: "Page.txt",
};

/** Electron-free orchestration of one pick: key raise → hover outline → click or
 * drag → effect → release → one screen grab, thumbnails fly to Blink, the card
 * composer opens. Every side effect is injected so the whole flow is unit tested;
 * `install.mjs` supplies the real layer, grabber and composer. Points are screen
 * DIP; the layer window adds its display origin before it reports them. */
export function createPickController({
  displays,
  cursor,
  picker,
  layer,
  settle,
  grab,
  crop,
  grouper,
  newChat,
  caught = () => {},
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pickedWhileHeld = () => null,
  mouthPoint,
  quick,
  reduced = () => false,
  onError = () => {},
}) {
  let state = null; // { display, picker, gesture, hovering, queued, dragging }
  let grabbing = Promise.resolve();

  const displayAt = (point) =>
    displays().find((d) => {
      const b = d.bounds;
      return (
        point.x >= b.x &&
        point.y >= b.y &&
        point.x < b.x + b.width &&
        point.y < b.y + b.height
      );
    }) ?? displays()[0];

  function send(channel, value) {
    layer.send(channel, value);
  }

  async function hover(point) {
    if (!state) return;
    if (state.hovering) {
      state.queued = point;
      return;
    }
    state.hovering = true;
    try {
      let next = point;
      while (next && state) {
        state.queued = null;
        const current = state;
        const h = await current.picker.hover(next);
        if (state !== current) return;
        if (h.lock) send("outline", { rect: null, kind: null, lock: true });
        else send("outline", { rect: h.outline, kind: h.kind, lock: false });
        next = state?.queued;
      }
    } finally {
      if (state) state.hovering = false;
    }
  }

  function badge() {
    if (!state) return;
    send("badge", {
      name: badgeFor({
        raised: true,
        dragging: state.gesture.state().phase === "dragging",
      }),
    });
  }

  function announce(result, point) {
    if (result.type === "lock") {
      send("lock", { plan: lockPlan(result.at ?? point) });
      return;
    }
    if (result.type === "refused") {
      send("refused", { reason: result.reason });
      return;
    }
    const { taken } = result.item;
    const said = pickedWhileHeld();
    if (said) send("hint", { text: said });
    const index = state.picker.items().findIndex((i) => i.taken === taken);
    send("taken", {
      index,
      grew: result.grew,
      kind: taken.kind,
      bounds: taken.bounds,
      effect: effectPlan({
        kind: taken.kind,
        bounds: taken.bounds,
        lines: taken.lines ?? [],
        reduced: reduced(),
      }),
    });
  }

  // A key released while the layer still waits for the last grab has nothing
  // to drop yet; the raise that is waiting must not show the layer afterwards.
  let raises = 0,
    cancelled = 0;
  async function raise() {
    const mine = ++raises;
    await grabbing;
    if (cancelled >= mine) return;
    const point = cursor();
    const display = displayAt(point);
    state = {
      display,
      picker: picker(display),
      gesture: createGesture({ bounds: display.bounds }),
      hovering: false,
      queued: null,
      dragging: false,
    };
    layer.show(display, point);
    badge();
    await hover(point);
  }

  async function input(event) {
    if (!state) return;
    const point = { x: event.x, y: event.y };
    const current = state;
    switch (event.type) {
      case "move": {
        const g = current.gesture.move(point);
        if (g.phase === "dragging") {
          // The rubber band is the only box while an area is dragged.
          if (!current.dragging)
            send("outline", { rect: null, kind: null, lock: false });
          current.dragging = true;
          send("drag", { rect: g.rect, from: g.from });
          badge();
        } else await hover(point);
        break;
      }
      case "down":
        current.gesture.down(point);
        break;
      case "up": {
        const result = current.gesture.up(point);
        current.dragging = false;
        send("drag", { rect: null });
        badge();
        if (!result) break;
        const picked =
          result.type === "area"
            ? await current.picker.area(result.rect)
            : await current.picker.click(result.point);
        if (state === current) announce(picked, point);
        break;
      }
    }
  }

  /** The grab covers one display, so a pick is cut out relative to that display. */
  const thumbnail = (shot, { bounds, display }) => {
    if (!shot) return null;
    try {
      const local = {
        ...bounds,
        x: bounds.x - display.bounds.x,
        y: bounds.y - display.bounds.y,
      };
      return crop(shot, local);
    } catch (error) {
      onError(error);
      return null;
    }
  };

  /** One attachment per pick: the text itself when there is text (a table stays a
   * table), the cropped pixels otherwise. */
  function entryFor(taken, picture) {
    if (taken.text)
      return {
        id: globalThis.crypto.randomUUID(),
        kind: taken.kind,
        taken,
        attachment: textAttachment(taken.text, names[taken.kind]),
      };
    if (!picture) return null;
    return {
      id: globalThis.crypto.randomUUID(),
      kind: taken.kind,
      taken,
      attachment: imageAttachment(picture),
      thumb: picture.dataUrl,
    };
  }

  /** Blink opens its mouth first; the picture is sucked in once it is wide. */
  async function feed(items) {
    // Blink answers with the moment it has swallowed; the card waits for it.
    const swallowed = Promise.resolve(caught());
    try {
      await pause(timing.eatLead);
      await layer.flight(items, mouthPoint());
    } finally {
      // A flight that failed still leaves Blink mid-bite: the card waits for it.
      await swallowed;
    }
  }

  async function finish(entries, flightItems) {
    const group = grouper.join();
    if (group.fresh) await newChat?.();
    try {
      await feed(flightItems);
    } catch (error) {
      onError(error);
    }
    await quick.open(entries);
  }

  /** What was picked goes into the card's composer once the picture is in
   * Blink's mouth: text is known at once, a picture needs the grab first. The
   * card opens after the flight, never before it. */
  async function deliverTaken(takens) {
    layer.hide();
    const group = grouper.join();
    const fresh = group.fresh ? Promise.resolve(newChat?.()) : null;
    let shot = null;
    let release;
    grabbing = new Promise((resolve) => (release = resolve));
    try {
      await settle();
      shot = await grab(
        takens[0].display,
        takens.map((t) => t.bounds),
      );
    } catch (error) {
      onError(error);
    } finally {
      release();
    }
    const entries = [];
    const flightItems = [];
    for (const taken of takens) {
      const picture = thumbnail(shot, taken);
      const entry = entryFor(taken, picture);
      if (!entry) continue;
      entries.push(entry);
      flightItems.push({
        id: entry.id,
        kind: taken.kind,
        bounds: taken.bounds,
        dataUrl: picture?.dataUrl ?? null,
      });
    }
    try {
      await fresh;
      if (flightItems.length) await feed(flightItems);
    } catch (error) {
      onError(error);
    }
    if (entries.length) await quick.open(entries);
  }

  /** A capture's region is relative to its display; a pick's bounds are screen
   * coordinates, which is what the flight starts from. */
  const screenRect = (capture) => {
    const origin = capture.display?.bounds ?? { x: 0, y: 0 };
    return {
      ...capture.region,
      x: capture.region.x + origin.x,
      y: capture.region.y + origin.y,
    };
  };

  async function deliverCapture(capture) {
    // A page arrives as tiles: one picture each, shown as one page chip, one
    // flight for the first.
    const parts = [capture, ...(capture.rest ?? [])];
    const page = parts.length > 1 ? globalThis.crypto.randomUUID() : null;
    const entries = parts.map(({ image, display, region }, index) => ({
      id: image.id ?? globalThis.crypto.randomUUID(),
      kind: "area",
      taken: { source: "capture", display, kind: "area", bounds: region },
      // The composer shows the tiles of one page as one chip.
      attachment: page
        ? { ...image, page: { id: page, index, total: parts.length } }
        : image,
      thumb: `data:${image.mediaType};base64,${image.data}`,
    }));
    await finish(entries, [
      {
        id: entries[0].id,
        kind: "area",
        bounds: screenRect(capture),
        dataUrl: entries[0].thumb,
      },
    ]);
    if (capture.notice) quick.note?.(capture.notice);
  }

  return {
    raise,
    input,
    /** The pick key was released, or the layer had to go: `release` delivers what
     * was picked, every other reason discards it. */
    async drop(reason) {
      const current = state;
      state = null;
      if (!current) {
        cancelled = raises;
        return;
      }
      current.gesture.cancel();
      const takens = reason === "release" ? current.picker.drain() : [];
      current.picker.clear();
      if (!takens.length) {
        layer.hide();
        return;
      }
      await deliverTaken(takens);
    },
    /** Picks (an array of Taken) and legacy captures (overlay, hotkey) take the
     * same road: flight into Blink, then the card. */
    deliver: (input) =>
      Array.isArray(input) ? deliverTaken(input) : deliverCapture(input),
    isRaised: () => state !== null,
  };
}
