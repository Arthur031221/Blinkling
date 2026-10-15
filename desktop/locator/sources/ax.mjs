import { buildElement } from "../element.mjs";
import { kindOf } from "../kinds.mjs";

const SECURE_ROLE = /password|securetext/i;
const MIN_ELEMENTS = 2;
const TIMEOUT = 1200;

const inside = (r, p) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

/** Turns what a native helper printed into elements, or null when there is
 * nothing usable (no frame, no tree, bad output), which sends the locator on to
 * the image source. The three helpers print the same shape, in screen pixels
 * (points on macOS): `toDip` maps a native screen point to a DIP one. */
export function parseTree(text, { window, display, toDip, roles = {} }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data?.frame || !Array.isArray(data.nodes)) return null;
  const elements = [];
  const parents = new Map();
  const ids = new Map(); // helper index -> the nearest kept element id
  data.nodes.forEach((raw, index) => {
    const role = String(raw.role ?? "");
    const mapped = roles[role] ?? roles[role.toLowerCase()] ?? role;
    const secure =
      raw.secure === true || raw.isPassword === true || SECURE_ROLE.test(role);
    const kind = secure ? "input" : kindOf({ role: mapped, text: raw.text });
    const parent = ids.get(raw.p) ?? null;
    if (!kind) {
      ids.set(index, parent);
      return;
    }
    const from = toDip({ x: Number(raw.x) || 0, y: Number(raw.y) || 0 });
    const to = toDip({
      x: (Number(raw.x) || 0) + (Number(raw.w) || 0),
      y: (Number(raw.y) || 0) + (Number(raw.h) || 0),
    });
    const bounds = {
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
    };
    if (!(bounds.width > 0 && bounds.height > 0)) {
      ids.set(index, parent);
      return;
    }
    const element = buildElement({
      source: "ax",
      windowId: window.id,
      n: index,
      bounds,
      role: mapped,
      name: raw.name,
      text: raw.text,
      secure,
      kind,
      window,
      display,
    });
    elements.push(element);
    parents.set(element.id, parent);
    ids.set(index, element.id);
  });
  return elements.length >= MIN_ELEMENTS ? { elements, parents } : null;
}

/** Source 2: OS accessibility. `platform` is one of ax-linux / ax-macos /
 * ax-windows: how to run its helper and how its roles are named. */
export function createAxSource({
  platform,
  run,
  toDip,
  toNative,
  timeout = TIMEOUT,
}) {
  return {
    name: "ax",
    handles: () => Boolean(platform && run),
    async read({ window, display, point }) {
      const centre = {
        x: window.bounds.x + window.bounds.width / 2,
        y: window.bounds.y + window.bounds.height / 2,
      };
      const at = toNative(
        point && inside(window.bounds, point) ? point : centre,
      );
      const { file, args } = platform.command({
        x: Math.round(at.x),
        y: Math.round(at.y),
        title: window.title,
        window,
      });
      let text;
      try {
        text = await run(file, args, { timeout });
      } catch {
        return null;
      }
      return parseTree(text ?? "", {
        window,
        display,
        toDip,
        roles: platform.roles,
      });
    },
  };
}
