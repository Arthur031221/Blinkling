import { timing } from "../shared/motion.mjs";

/** The one place that owns what Blink is doing and every retreat and close
 * deadline. It is pure: the caller feeds events and ticks with a clock, and
 * acts on the effects it returns. No timers live here or anywhere else. */
export const STATES = Object.freeze([
  "peek",
  "out",
  "menu",
  "chat",
  "held",
  "busy",
  "eating",
]);

/** Pixels a press may travel before it is a pick-up rather than a click. */
export const MOVE_SLOP = 4;
/** The card may be words/4 per second of reading, between the two bounds. */
export const WORDS_PER_SECOND = 4;

export function readingMs(words) {
  const n = Number.isFinite(words) && words > 0 ? words : 0;
  return Math.min(
    timing.readCap,
    Math.max(timing.readMin, (n / WORDS_PER_SECOND) * 1000),
  );
}

const inside = (r, p) =>
  Boolean(r) &&
  p.x >= r.x &&
  p.x < r.x + r.width &&
  p.y >= r.y &&
  p.y < r.y + r.height;
const hull = (a, b) => {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export function createMachine({ now: clock = () => 0 } = {}) {
  const s = {
    // The surface the user asked for. "none" is Blink alone.
    surface: "none",
    // Blink is out of the edge. Cleared only by the retreat deadline.
    out: false,
    pinned: false,
    hoverMenu: false,
    stickyMenu: false,
    pointerOver: false,
    overSurface: false,
    inCorridor: false,
    graceUntil: 0,
    overSince: null,
    lastEngaged: 0,
    press: null,
    held: false,
    streaming: false,
    dismissed: false,
    leftAt: null,
    capture: 0,
    eatingUntil: 0,
    showUntil: 0,
    grumbling: false,
    guiding: false,
    guideOnly: false,
    viewer: 0,
    panels: 0,
    chips: false,
    composer: { focus: false, text: false, ime: false },
    scrollAt: -Infinity,
    selectAt: -Infinity,
    holdAt: -Infinity,
    readUntil: null,
    answered: false,
    geometry: { blink: null, card: null, menu: null },
  };
  const effects = [];
  const emit = (type, extra) => effects.push({ type, ...extra });
  const take = () => effects.splice(0, effects.length);

  const active = (at, t) => t - at < timing.activity;
  /** What keeps an answered card open: the pointer on it or on Blink, a
   * draft, or reading by scroll and selection. A bare focus does not. */
  const reading = (t) =>
    s.pointerOver ||
    s.overSurface ||
    s.inCorridor ||
    s.composer.text ||
    s.composer.ime ||
    active(s.scrollAt, t) ||
    active(s.selectAt, t);

  /** What keeps Blink out while the pointer is on Blink, on its menu or on the way. */
  const pointerBound = () =>
    s.pointerOver || s.inCorridor || s.overSurface || s.hoverMenu;

  function engaged(t) {
    return pointerBound() || engagedBeyondPointer(t);
  }
  function engagedBeyondPointer(t) {
    return Boolean(
      s.surface !== "none" ||
        s.panels > 0 ||
        s.composer.focus ||
        s.composer.text ||
        s.composer.ime ||
        active(s.scrollAt, t) ||
        active(s.selectAt, t) ||
        s.held ||
        s.press ||
        (s.streaming && !s.dismissed) ||
        s.guiding ||
        s.capture > 0 ||
        s.viewer > 0 ||
        s.grumbling ||
        t < s.showUntil ||
        t < s.eatingUntil,
    );
  }

  function state(t) {
    if (s.held) return "held";
    if (t < s.eatingUntil) return "eating";
    if (s.streaming && !s.dismissed) return "busy";
    if (s.surface === "chat") return "chat";
    if (s.surface === "menu" || s.hoverMenu) return "menu";
    return s.out ? "out" : "peek";
  }

  function pullOut(t) {
    if (!s.out) {
      s.out = true;
      emit("out");
    }
    engage(t);
  }

  function openChat(t, why) {
    s.hoverMenu = false;
    s.stickyMenu = false;
    if (s.surface !== "chat") {
      s.surface = "chat";
      s.readUntil = null;
      emit("open-chat", { focus: why !== "answer", why });
    }
    pullOut(t);
  }
  function closeChat(t, why) {
    if (s.surface !== "chat") return;
    s.surface = "none";
    s.pinned = false;
    s.readUntil = null;
    s.composer = { focus: false, text: false, ime: false };
    s.chips = false;
    engage(t);
    emit("close-chat", { why });
  }
  /** Something other than the pointer engaged Blink: it keeps the full 1.5 s
   * before it retreats. */
  function engage(t) {
    s.lastEngaged = t;
    s.leftAt = null;
  }
  /** A click on the background hides everything at once: with nothing left
   * that holds Blink out, it goes back to its edge together with the card. */
  function retreatNow(t) {
    if (s.out && !engaged(t)) {
      s.out = false;
      emit("retreat");
    }
  }
  function openMenu(t) {
    s.surface = "menu";
    s.stickyMenu = true;
    s.hoverMenu = false;
    emit("open-menu");
    pullOut(t);
  }
  function closeMenu(t, why) {
    if (s.surface !== "menu" && !s.hoverMenu) return;
    s.surface = s.surface === "menu" ? "none" : s.surface;
    s.stickyMenu = false;
    s.hoverMenu = false;
    engage(t);
    emit("close-menu", { why });
  }

  function held(t) {
    if (s.held) return;
    s.held = true;
    s.press = { ...s.press, picked: true };
    s.hoverMenu = false;
    // The rest that counts starts again once Blink is put down.
    s.overSince = null;
    emit("pick-up");
    pullOut(t);
  }

  const api = {
    take,
    get snapshot() {
      return api.read(clock());
    },
    read(t = clock()) {
      return {
        state: state(t),
        out: s.out || s.held,
        surface: s.surface,
        menu: s.surface === "menu" || s.hoverMenu,
        card: s.surface === "chat",
        pinned: s.pinned,
        engaged: engaged(t),
        streaming: s.streaming,
        held: s.held,
        pointer: s.pointerOver,
        readUntil: s.readUntil,
      };
    },
    engaged,
    geometry(next) {
      s.geometry = { ...s.geometry, ...next };
      if (!s.geometry.card && !s.geometry.menu) {
        s.inCorridor = false;
        s.overSurface = false;
      }
    },
    /** `over` is the hit test against Blink's drawn shape. Everything else is
     * a rectangle test against what is on screen. */
    pointer(p, t = clock(), over = s.pointerOver) {
      const { blink, card, menu } = s.geometry;
      const was = s.pointerOver || s.inCorridor || s.overSurface;
      s.pointerOver = Boolean(over);
      s.overSurface = inside(card, p) || inside(menu, p);
      const other = card ?? menu;
      s.inCorridor = Boolean(blink && other) && inside(hull(blink, other), p);
      const now = s.pointerOver || s.inCorridor || s.overSurface;
      if (now) {
        s.leftAt = null;
        s.lastEngaged = t;
        s.graceUntil = t + timing.grace;
        if (s.overSurface && s.surface === "chat") s.holdAt = t;
      }
      if (s.press && !s.held) {
        const dx = p.x - s.press.x,
          dy = p.y - s.press.y;
        if (Math.hypot(dx, dy) >= MOVE_SLOP) held(t);
      }
      if (s.pointerOver) {
        s.overSince ??= t;
        if (!s.out && !s.held) pullOut(t);
      } else s.overSince = null;
      if (!now && was) {
        s.graceUntil = t + timing.grace;
        s.leftAt = t;
      }
      return api;
    },
    /** Pressed on Blink's drawn body. */
    press(p, t = clock()) {
      s.press = { x: p.x, y: p.y, at: t };
      engage(t);
    },
    release(t = clock()) {
      const pressed = s.press;
      s.press = null;
      if (s.held) {
        s.held = false;
        engage(t);
        emit("drop");
        return "drop";
      }
      if (!pressed) return null;
      return api.click(t);
    },
    /** The card is wanted by something other than a click or an answer (a file
     * dropped on Blink, a link, the quick chips): the menu goes, the card comes. */
    open(why = "request", t = clock()) {
      openChat(t, why);
    },
    click(t = clock()) {
      if (s.surface === "chat") openMenu(t);
      else openChat(t, "click");
      return "click";
    },
    /** A click outside every Blinkling surface. */
    outside(t = clock()) {
      if (s.surface === "chat") {
        // A streaming answer or a draft does not hold the card open: the
        // answer goes on into the history and the draft stays in the page.
        const busy = s.panels > 0 || s.viewer > 0;
        if (!s.pinned && !busy) {
          if (s.streaming) s.dismissed = true;
          closeChat(t, "outside");
          retreatNow(t);
        }
      } else if (s.surface === "menu" && s.stickyMenu && s.panels === 0) {
        closeMenu(t, "outside");
        retreatNow(t);
      }
    },
    escape(t = clock()) {
      if (s.viewer > 0) return;
      if (s.surface === "chat") closeChat(t, "escape");
      else if (s.surface === "menu") closeMenu(t, "escape");
    },
    close(t = clock()) {
      closeChat(t, "close");
    },
    /** A bubble was used to take a picture: the menu has done its job and
     * must not sit over the composer that opens with the picture. */
    menuUsed(t = clock()) {
      closeMenu(t, "action");
    },
    pin(value, t = clock()) {
      s.pinned = Boolean(value);
      if (value) openChat(t, "pin");
      else if (s.readUntil !== null && t >= s.readUntil) closeChat(t, "read");
    },
    composer(next, t = clock()) {
      s.composer = { ...s.composer, ...next };
      if (s.composer.focus || s.composer.text || s.composer.ime) {
        engage(t);
        s.holdAt = t;
      }
    },
    /** The card lost focus: with the pointer away from Blinkling that is a click outside. */
    blurred(t = clock()) {
      api.composer({ focus: false }, t);
      const near = s.pointerOver || s.overSurface || s.inCorridor;
      if (!near && s.panels === 0 && s.viewer === 0) api.outside(t);
    },
    scrolled(t = clock()) {
      s.scrollAt = t;
    },
    selected(t = clock()) {
      s.selectAt = t;
    },
    panels(count) {
      s.panels = Math.max(0, count | 0);
    },
    /** A picture waits in the composer. It keeps an answer's card from
     * closing by reading time but never from a click outside. */
    chips(value) {
      s.chips = Boolean(value);
    },
    viewer(open) {
      s.viewer = open ? 1 : 0;
    },
    /** A capture or the Ctrl pick is in progress: Blink comes out to take part
     * and stays out until it is over. */
    capture(open, t = clock()) {
      s.capture = Math.max(0, s.capture + (open ? 1 : -1));
      if (open) pullOut(t);
      else engage(t);
    },
    eat(ms, t = clock()) {
      s.eatingUntil = t + ms;
      engage(t);
    },
    /** A motion that has to be seen (appear, turn, celebrate, shrug, file
     * catch): Blink is out and stays out while it plays. */
    showFor(ms, t = clock()) {
      s.showUntil = Math.max(s.showUntil, t + ms);
      pullOut(t);
    },
    /** The idle grumble is drawn standing, so Blink is out for as long as it
     * lasts and then retreats by the usual rule. */
    grumble(on, t = clock()) {
      if (s.grumbling === on) return;
      s.grumbling = on;
      if (on) pullOut(t);
      else engage(t);
    },
    /** The question went out; the card opens by itself to show the answer. */
    answerStart(t = clock()) {
      s.streaming = true;
      s.dismissed = false;
      s.guideOnly = false;
      s.answered = false;
      s.readUntil = null;
      s.hoverMenu = false;
      if (s.surface !== "chat") openChat(t, "answer");
      engage(t);
    },
    answerEnd(words, t = clock()) {
      s.streaming = false;
      s.dismissed = false;
      s.answered = true;
      engage(t);
      s.readUntil = t + readingMs(words);
      emit("answer-done", { words });
    },
    answerFailed(t = clock()) {
      s.streaming = false;
      s.dismissed = false;
      s.readUntil = t + timing.readMin;
      emit("answer-failed");
    },
    /** Something Blink has to say outside an answer (a failure, an offer, a
     * remark): the card opens without taking the keyboard and goes by the
     * reading rule. */
    notice(t = clock()) {
      s.guideOnly = false;
      if (s.surface !== "chat") openChat(t, "answer");
      s.readUntil = Math.max(s.readUntil ?? 0, t + timing.readMin);
      engage(t);
    },
    /** A guide keeps its steps in the card for as long as it runs. */
    guide(on, t = clock()) {
      if (s.guiding === Boolean(on)) return;
      s.guiding = Boolean(on);
      if (on) {
        // A card the guide opened has nothing in it once the steps are gone.
        s.guideOnly = s.surface !== "chat";
        if (s.surface !== "chat") openChat(t, "answer");
        s.readUntil = null;
      } else if (s.surface === "chat" && !s.pinned) {
        if (s.guideOnly && !s.streaming && !s.composer.text && !s.composer.ime)
          closeChat(t, "guide-end");
        else s.readUntil = Math.max(s.readUntil ?? 0, t + timing.readMin);
        s.guideOnly = false;
      } else s.guideOnly = false;
      engage(t);
    },
    tick(t = clock()) {
      if (s.press && !s.held && t - s.press.at >= timing.pickHold) held(t);
      // Hover shows the menu once the pointer has rested on Blink, never on
      // top of an open card or while Blink is carried.
      if (
        s.pointerOver &&
        s.overSince !== null &&
        t - s.overSince >= timing.menuRest &&
        s.surface === "none" &&
        !s.held &&
        !s.press &&
        !s.hoverMenu
      ) {
        s.hoverMenu = true;
        emit("open-menu", { hover: true });
      }
      // The hover menu goes once the pointer has been away past the grace.
      if (
        s.hoverMenu &&
        !s.pointerOver &&
        !s.overSurface &&
        !s.inCorridor &&
        t >= s.graceUntil
      ) {
        s.hoverMenu = false;
        emit("close-menu", { why: "leave" });
      }
      if (s.surface === "chat" && !s.pinned && s.readUntil !== null) {
        const hold =
          reading(t) ||
          s.streaming ||
          s.guiding ||
          s.chips ||
          s.panels > 0 ||
          s.viewer > 0;
        if (hold) s.holdAt = t;
        if (!hold && t >= s.readUntil && t - s.holdAt >= timing.retreat)
          closeChat(t, "read");
      }
      if (engaged(t)) {
        s.lastEngaged = t;
        // Only the pointer is holding Blink out: leaving it can retreat at once.
        if (!pointerBound() || engagedBeyondPointer(t)) s.leftAt = null;
      }
      // Blink that came out because the pointer touched it goes back as soon
      // as the pointer has left and the corridor grace is over. Anything else
      // that engaged it since (a motion, an answer, a card) keeps the 1.5 s.
      else if (
        s.out &&
        (t - s.lastEngaged >= timing.retreat ||
          (s.leftAt !== null && t >= s.graceUntil))
      ) {
        s.out = false;
        emit("retreat");
      }
      return take();
    },
  };
  return api;
}
