import { createMini } from "./model.mjs";
import { placeMini, blinkBody, MINI_WIDTH } from "./placement.mjs";
import { duration } from "../shared/motion.mjs";
import { bindPanelNudge } from "../shared/panel-nudge.mjs";
import { setLayer } from "../shared/escape.mjs";
import { validateAttachment, attachmentLimits } from "../composer/index.mjs";
import { efforts, permissionModes } from "../composer/models.mjs";

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
  nudges,
  edge = () => "bottom",
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
  let reopening = false;
  let height = 140;
  let thumbs = new Map();
  // What the user was last told went wrong, as an error code the box translates.
  let notice = "";
  let selecting = false;
  const send = (channel, value) => {
    if (!win.isDestroyed()) win.webContents.send(channel, value);
  };
  const trusted = (event) => event.sender === win.webContents;

  const view = () => {
    const shown = model.view();
    return {
      ...shown,
      entries: shown.entries.map((e) => ({ ...e, thumb: thumbs.get(e.id) })),
      selection: host.selection?.() ?? null,
      selecting,
      notice,
    };
  };
  const refresh = () => model && send("blinkling:mini-view", view());

  let placed = null;
  let picks = [];
  // Where Blink is while it is carried: the box goes with it, not to where it will land.
  let carried = null;
  const blinkAt = () => carried ?? blinkPoint();

  /** The box is anchored to Blink's mouth, on Blink's display, and moves aside
   * from what was picked only by changing sides. */
  function place() {
    const taken = picks.map((e) => e.taken).filter(Boolean);
    placed = placeMini({
      blink: blinkAt(),
      size: { width: MINI_WIDTH + 32, height },
      workArea: workArea(),
      avoid: taken.map((t) => t.bounds).filter(Boolean),
    });
    if (moveBy) placed = moveBy(placed, workArea());
    win.setBounds(placed);
  }
  const moveBy =
    nudges &&
    bindPanelNudge({
      ipc,
      win,
      channel: "blinkling:mini-nudge",
      key: () => `mini:${edge()}`,
      nudges,
      replace: () => model && place(),
    });

  /** Where the box grows from: Blink's body, relative to the box. */
  function origin() {
    const body = blinkBody(blinkAt());
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

  const THUMB_CHARS = 200_000;
  const KNOWN_NOTICES = new Set([
    "unsupported-file",
    "too-large",
    "unreadable",
    "too-many-files",
    "total-too-large",
    "visible-part",
  ]);
  /** A file or image from the + button: checked here like any attachment, then
   * a chip. The box makes the small preview; only a small image is accepted. */
  function attach(value) {
    if (!model) return;
    try {
      if (typeof value?.error === "string") {
        throw Object.assign(new Error(value.error), {
          code: KNOWN_NOTICES.has(value.error) ? value.error : "unreadable",
        });
      }
      const attachment = validateAttachment(value?.attachment);
      model.add({ id: attachment.id, attachment });
      if (
        typeof value.thumb === "string" &&
        value.thumb.length <= THUMB_CHARS &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
          value.thumb,
        )
      )
        thumbs.set(attachment.id, value.thumb);
      notice = "";
    } catch (error) {
      notice = KNOWN_NOTICES.has(error.code) ? error.code : "unreadable";
    }
    refresh();
  }

  /** A model, effort or permission pick: the session confirms it or the lists
   * go back to what it still has. */
  async function select(next) {
    if (
      !model ||
      selecting ||
      !host.select ||
      typeof next?.model !== "string" ||
      !efforts.includes(next.effort) ||
      (next.permissionMode !== undefined &&
        !permissionModes.includes(next.permissionMode))
    )
      return;
    selecting = true;
    notice = "";
    refresh();
    try {
      await host.select({
        model: next.model,
        effort: next.effort,
        ...(next.permissionMode ? { permissionMode: next.permissionMode } : {}),
      });
    } catch {
      notice = "switch-failed";
    } finally {
      selecting = false;
      refresh();
    }
  }

  function close(reason) {
    const closing = model;
    model = null;
    thumbs = new Map();
    notice = "";
    send("blinkling:mini-close", { reason });
    // The window stays long enough for the reverse transition, unless reopened.
    clearTimer(hideTimer);
    hideTimer = setTimer(() => {
      hideTimer = null;
      if (!model && !win.isDestroyed()) win.hide();
    }, duration.base);
    setLayer("mini", null);
    if (closing) {
      host.closed?.(reason);
      // Replacing the contents of an open composer leaves it open.
      if (!reopening) host.changed?.(false);
    }
    // Escape, a send and a discard hand the keyboard back to the previous app;
    // growing into the full composer hands it to the composer instead.
    if (reason !== "grew") focus.restore();
  }

  for (const [channel, handler] of Object.entries({
    "blinkling:mini-input": (text) => model?.setText(String(text)),
    "blinkling:mini-submit": () => model?.submit({}).catch(() => {}),
    "blinkling:mini-chip": (id) => model?.chip(id).catch(() => {}),
    "blinkling:mini-remove": (id) => (model?.remove(id), refresh()),
    "blinkling:mini-open-image": (id) => {
      const entry = model?.snapshot().entries.find((e) => e.id === id);
      if (entry?.attachment?.mediaType?.startsWith("image/"))
        void Promise.resolve(host.openImage?.(entry.attachment)).catch(
          () => {},
        );
    },
    "blinkling:mini-offer": (id) => model?.offer(id).catch(() => {}),
    "blinkling:mini-attach": attach,
    "blinkling:mini-select": (next) => void select(next),
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
    /** A one-line word for the open box, such as why a page came as its
     * visible part. Nothing happens when the box is closed. */
    note(code) {
      if (!model || !KNOWN_NOTICES.has(code)) return;
      notice = code;
      refresh();
    },
    /** The chips the open box holds, oldest first. */
    entries: () => model?.snapshot().entries ?? [],
    /** entries: [{id, kind, attachment, taken?, thumb?, pending?}] */
    async open(added) {
      const wasOpen = !!model;
      // Picks made while the box is open join it: earlier chips and the typed
      // text stay, the newest picks win when the limit is reached.
      const prior = model ? model.snapshot() : { entries: [], text: "" };
      const entries = [...prior.entries, ...added].slice(
        -attachmentLimits.count,
      );
      // Closing the old contents forgets its thumbnails: keep them first.
      const kept = wasOpen ? thumbs : new Map();
      reopening = wasOpen;
      if (model) model.dispose();
      reopening = false;
      clearTimer(hideTimer);
      hideTimer = null;
      notice = "";
      thumbs = new Map(
        [
          ...kept,
          ...added.filter((e) => e.thumb).map((e) => [e.id, e.thumb]),
        ].filter(([id]) => entries.some((e) => e.id === id)),
      );
      picks = entries;
      model = createMini({
        locale,
        entries,
        text: prior.text,
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
      send("blinkling:mini-open", {
        origin: origin(),
        nudge: nudges?.get(`mini:${edge()}`),
      });
      await focus.remember();
      if (model !== mine) return;
      focus.activate(win);
      win.focus();
      claimKeyboard();
      if (!wasOpen) host.changed?.(true);
    },
    /** Blink moved (`point`: its feet while it is carried, none once it rests):
     * the box goes with it. */
    follow(point = null) {
      carried = point;
      if (model) place();
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
