import { createMini } from "./model.mjs";
import { placeMini, blinkBody, MINI_WIDTH } from "./placement.mjs";
import { duration } from "../shared/motion.mjs";
import { setLayer } from "../shared/escape.mjs";

const FOCUS_RETRY = 60;
const FOCUS_WINDOW = 500;

/** The mini composer: one hidden window made at start and reused, so opening it
 * costs no window creation. It sits beside Blink, takes the keyboard, and gives
 * it back to the previous app when it closes.
 *
 * win: {webContents, isDestroyed, setBounds, showInactive, hide, focus, isFocused,
 *   isVisible}; ipc: {on(channel, fn)}; focus: {remember, activate(win), restore}. */
export function createMiniController({
  win,
  ipc,
  locale,
  theme = () => "light",
  focus,
  workArea,
  blinkPoint,
  host,
  once,
  autoExplain,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
}) {
  let model = null;
  let hideTimer = null;
  let height = 140;
  let thumbs = new Map();
  const send = (channel, value) => {
    if (!win.isDestroyed()) win.webContents.send(channel, value);
  };
  const trusted = (event) => event.sender === win.webContents;

  const view = () => ({
    ...model.view(),
    entries: model
      .view()
      .entries.map((e) => ({ ...e, thumb: thumbs.get(e.id) })),
  });
  const refresh = () => model && send("blinkling:mini-view", view());

  let placed = null;
  let picks = [];

  /** The box opens on the display of the pick, away from what was picked and from
   * Blink; a Blink click has no pick, so it is beside Blink on Blink's display. */
  function place() {
    const taken = picks.map((e) => e.taken).filter(Boolean);
    const display = taken.find((t) => t.display)?.display;
    const area = display ? (display.workArea ?? display.bounds) : workArea();
    placed = placeMini({
      blink: blinkPoint(),
      size: { width: MINI_WIDTH + 32, height },
      workArea: area,
      avoid: taken.map((t) => t.bounds).filter(Boolean),
    });
    win.setBounds(placed);
  }

  /** Where the box grows from: Blink's body, relative to the box. */
  function origin() {
    const body = blinkBody(blinkPoint());
    return {
      x: Math.round(body.x + body.width / 2 - placed.x),
      y: Math.round(body.y + body.height / 2 - placed.y),
    };
  }

  function claimKeyboard(until = now() + FOCUS_WINDOW) {
    const retry = () => {
      if (win.isDestroyed() || !win.isVisible() || !model) return;
      if (!win.isFocused()) {
        focus.activate(win);
        win.focus();
      }
      if (now() < until) setTimer(retry, FOCUS_RETRY);
    };
    setTimer(retry, FOCUS_RETRY);
  }

  function close(reason) {
    const closing = model;
    model = null;
    thumbs = new Map();
    send("blinkling:mini-close", { reason });
    // The window stays long enough for the reverse transition, unless reopened.
    clearTimer(hideTimer);
    hideTimer = setTimer(() => {
      hideTimer = null;
      if (!model && !win.isDestroyed()) win.hide();
    }, duration.base);
    setLayer("mini", null);
    if (closing) host.closed?.(reason);
    // Escape, a send and a discard hand the keyboard back to the previous app;
    // growing into the full composer hands it to the composer instead.
    if (reason !== "grew") focus.restore();
  }

  for (const [channel, handler] of Object.entries({
    "blinkling:mini-input": (text) => model?.setText(String(text)),
    "blinkling:mini-submit": () => model?.submit({}).catch(() => {}),
    "blinkling:mini-chip": (id) => model?.chip(id).catch(() => {}),
    "blinkling:mini-remove": (id) => (model?.remove(id), refresh()),
    "blinkling:mini-offer": (id) => model?.offer(id).catch(() => {}),
    "blinkling:mini-escape": () => model?.escape(),
    "blinkling:mini-size": (value) => {
      if (Number.isFinite(value) && value > 0 && value !== height) {
        height = Math.min(Math.ceil(value), 600);
        if (model) place();
      }
    },
  }))
    ipc.on(channel, (event, value) => {
      if (trusted(event)) handler(value);
    });

  return {
    get isOpen() {
      return !!model;
    },
    /** entries: [{id, kind, attachment, taken?, thumb?, pending?}] */
    async open(entries) {
      if (model) model.dispose();
      clearTimer(hideTimer);
      hideTimer = null;
      thumbs = new Map(
        entries.filter((e) => e.thumb).map((e) => [e.id, e.thumb]),
      );
      picks = entries;
      model = createMini({
        locale,
        entries,
        once,
        autoExplain,
        host: { ...host, close },
      });
      const mine = model;
      setLayer("mini", () => model?.escape());
      // The window answers first; the previous app is remembered right after,
      // before the keyboard moves, which is the only order that matters.
      send("blinkling:mini-init", { locale, theme: theme() });
      refresh();
      place();
      win.showInactive();
      send("blinkling:mini-open", { origin: origin() });
      await focus.remember();
      if (model !== mine) return;
      focus.activate(win);
      win.focus();
      claimKeyboard();
    },
    /** Whether the box sits over any of these screen rectangles. */
    covers(rects) {
      if (!model || !placed) return false;
      return rects.some(
        (r) =>
          r.x < placed.x + placed.width &&
          r.x + r.width > placed.x &&
          r.y < placed.y + placed.height &&
          r.y + r.height > placed.y,
      );
    },
    /** The pixels of a pick that opened without them. */
    fill(entry) {
      if (!model) return;
      if (entry.thumb) thumbs.set(entry.id, entry.thumb);
      model.fill(entry);
      refresh();
    },
    /** A pick whose pixels never came: gone from the chips, and the mini closes
     * if nothing is left to send. */
    drop(id) {
      if (!model) return;
      model.remove(id);
      thumbs.delete(id);
      if (model.view().entries.length) refresh();
      else model.escape();
    },
    escape: () => model?.escape(),
    dispose() {
      clearTimer(hideTimer);
      model?.dispose();
    },
  };
}
