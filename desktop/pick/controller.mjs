import { createGesture } from "./gesture.mjs";
import { effectPlan, lockPlan } from "./effects.mjs";
import { badgeFor } from "./badge.mjs";
import { textAttachment, imageAttachment } from "./taken.mjs";

const names = {
  table: "Table.txt",
  code: "Code.txt",
  section: "Section.txt",
  page: "Page.txt",
};

/** Electron-free orchestration of one pick: key raise → hover outline → click or
 * drag → effect → release → one screen grab, thumbnails fly to Blink, the mini
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
  blinkPoint,
  mini,
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

  async function raise() {
    await grabbing;
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

  async function finish(entries, flightItems) {
    const group = grouper.join();
    if (group.fresh) await newChat?.();
    try {
      await layer.flight(flightItems, blinkPoint());
      caught();
    } catch (error) {
      onError(error);
    }
    await mini.open(entries);
  }

  /** The mini composer answers the release, so it opens with what is already
   * known: text is there, a picture is a chip still waiting for the grab. The grab,
   * the flight into Blink and the chips filling in follow while it is open. */
  async function deliverTaken(takens) {
    layer.hide();
    const group = grouper.join();
    const fresh = group.fresh ? Promise.resolve(newChat?.()) : null;
    const early = takens.map((taken) => ({
      taken,
      entry: taken.text
        ? entryFor(taken, null)
        : {
            id: globalThis.crypto.randomUUID(),
            kind: taken.kind,
            taken,
            pending: true,
          },
    }));
    const opened = mini.open(early.map((e) => e.entry));
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
    const flightItems = [];
    for (const { taken, entry } of early) {
      const picture = thumbnail(shot, taken);
      if (entry.pending) {
        const full = entryFor(taken, picture);
        if (full) mini.fill({ ...full, id: entry.id });
        else {
          mini.drop(entry.id);
          continue;
        }
      }
      flightItems.push({
        id: entry.id,
        kind: taken.kind,
        bounds: taken.bounds,
        dataUrl: picture?.dataUrl ?? null,
      });
    }
    try {
      await fresh;
      if (flightItems.length) {
        await layer.flight(flightItems, blinkPoint());
        caught();
      }
    } catch (error) {
      onError(error);
    }
    await opened;
  }

  async function deliverCapture(capture) {
    const { image } = capture;
    const dataUrl = `data:${image.mediaType};base64,${image.data}`;
    const entry = {
      id: image.id ?? globalThis.crypto.randomUUID(),
      kind: "area",
      taken: {
        source: "capture",
        display: capture.display,
        kind: "area",
        bounds: capture.region,
      },
      attachment: image,
      thumb: dataUrl,
    };
    await finish(
      [entry],
      [{ id: entry.id, kind: "area", bounds: capture.region, dataUrl }],
    );
  }

  return {
    raise,
    input,
    /** The pick key was released, or the layer had to go: `release` delivers what
     * was picked, every other reason discards it. */
    async drop(reason) {
      const current = state;
      state = null;
      if (!current) return;
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
     * same road: flight into Blink, then the mini composer. */
    deliver: (input) =>
      Array.isArray(input) ? deliverTaken(input) : deliverCapture(input),
    isRaised: () => state !== null,
  };
}
