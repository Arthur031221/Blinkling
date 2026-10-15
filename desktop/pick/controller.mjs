/** The pick session (M2-M4) with no Electron in it: what a held Ctrl, a
 * pointer and the locator add up to. The layer windows only draw its state
 * and feed it pointer events; tests drive it directly. */
import { createGroup, growTarget, MAX_ITEMS } from "./group.mjs";
import { takenKind } from "./kinds.mjs";

export const DRAG_PX = 6;

const normalize = (a, b) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});
const meets = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const within = (rect, bounds) => {
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  return {
    x,
    y,
    width: Math.min(rect.x + rect.width, bounds.x + bounds.width) - x,
    height: Math.min(rect.y + rect.height, bounds.y + bounds.height) - y,
  };
};

export function createPickController({
  locator,
  guard,
  capture,
  displayAt,
  onState = () => {},
  onTaken = () => {},
  onError = () => {},
  newId = () => crypto.randomUUID(),
  now = Date.now,
}) {
  const group = createGroup({ newId, now });
  let active = false,
    allowed = true,
    hover = null,
    area = null,
    full = false,
    pressed = null,
    dragging = false,
    token = 0,
    busy = Promise.resolve();

  const emit = () =>
    onState({
      active,
      mode: dragging ? "crosshair" : "crayon",
      outline: hover?.bounds ?? null,
      kind: hover ? takenKind(hover.kind) : null,
      area,
      locked: !allowed || !!hover?.secure,
      full,
      count: group.items.length,
    });

  const resolveAt = async (point) =>
    (await locator.selectionAt(point)) ?? (await locator.locate(point));

  async function secureIn(rect) {
    const list = await locator.elements("active");
    return list.some((e) => e.secure && meets(e.bounds, rect));
  }

  async function take(element, rect, extra = {}) {
    const display = element?.display ?? displayAt({ x: rect.x, y: rect.y });
    try {
      const image = await capture(rect, display);
      const taken = {
        kind: extra.kind ?? takenKind(element.kind),
        source: "pick",
        bounds: rect,
        display,
        image,
        ...(extra.text ?? element?.text
          ? { text: extra.text ?? element.text }
          : {}),
        ...(element?.content ? { content: element.content } : {}),
        ...(element ? { elementId: element.id } : {}),
      };
      const id = newId();
      const item = { id, elementId: taken.elementId, bounds: rect, kind: taken.kind };
      if (extra.replaces) group.replace(extra.replaces, item);
      else group.add(item);
      emit();
      onTaken(taken, {
        id,
        ...(extra.replaces ? { replaces: extra.replaces } : {}),
        ...(element?.window ? { window: element.window } : {}),
      });
    } catch (error) {
      onError(error);
    }
  }

  async function click(point) {
    if (!(await guard.allowed())) return;
    const target = growTarget(group.items, point);
    let element;
    if (target) {
      element = target.elementId ? await locator.parent(target.elementId) : null;
      if (!element) return; // already as large as it gets
    } else {
      element = await resolveAt(point);
      if (!element) return;
      if (group.items.some((i) => i.elementId === element.id)) return;
      if (group.items.length >= MAX_ITEMS) {
        full = true;
        emit();
        return;
      }
    }
    if (element.secure) return;
    await take(element, element.bounds, target ? { replaces: target.id } : {});
  }

  async function takeArea(rect) {
    if (!(await guard.allowed())) return;
    if (group.items.length >= MAX_ITEMS) {
      full = true;
      emit();
      return;
    }
    const display = displayAt({ x: rect.x, y: rect.y });
    const bounds = within(rect, display.bounds);
    if (bounds.width < 1 || bounds.height < 1) return;
    if (await secureIn(bounds)) return;
    const text = (await locator.textIn(bounds))?.text;
    await take(null, bounds, { kind: "area", ...(text ? { text } : {}) });
  }

  async function hoverAt(point) {
    const mine = ++token;
    const element = await resolveAt(point);
    if (mine !== token || !active) return;
    hover = element;
    full = false;
    emit();
  }

  const run = (task) => (busy = busy.then(task, task));

  return {
    get items() {
      return group.items;
    },
    async raise() {
      active = true;
      allowed = await guard.allowed();
      hover = null;
      area = null;
      full = false;
      emit();
    },
    drop() {
      active = false;
      hover = null;
      area = null;
      pressed = null;
      dragging = false;
      token++;
      emit();
    },
    reset() {
      group.clear();
      emit();
    },
    /** A fresh chat starts with only the pick that began it. */
    keepOnly(id) {
      for (const item of group.items) if (item.id !== id) group.remove(item.id);
      emit();
    },
    /** A pick happened now: the chat it belongs to (K2, sixty seconds). */
    touchChat: () => group.touchChat(),
    async pointer({ type, x, y }) {
      if (!active) return;
      const point = { x, y };
      if (type === "move") {
        if (pressed) {
          if (!dragging && Math.hypot(x - pressed.x, y - pressed.y) > DRAG_PX)
            dragging = true;
          if (dragging) {
            token++;
            hover = null;
            area = normalize(pressed, point);
            emit();
          }
          return;
        }
        return hoverAt(point);
      }
      if (type === "down") {
        pressed = point;
        return;
      }
      if (type === "up" && pressed) {
        const wasDragging = dragging || Math.hypot(x - pressed.x, y - pressed.y) > DRAG_PX;
        const origin = pressed;
        pressed = null;
        dragging = false;
        area = null;
        emit();
        return run(() => (wasDragging ? takeArea(normalize(origin, point)) : click(point)));
      }
    },
  };
}
