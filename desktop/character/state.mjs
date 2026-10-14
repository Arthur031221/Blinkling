/** Clock injected by the caller: timers cannot race drag, pin or a renewed hover. */
export class BlinkState {
  mode = "peek";
  pinned = false;
  chatOpen = false;
  over = false;
  leaveAt = null;
  dropUntil = 0;
  hover(over, now) {
    this.over = over;
    if (over) {
      this.leaveAt = null;
      if (this.mode !== "drag" && this.mode !== "drop") this.mode = "hover";
    } else if (this.leaveAt === null) this.leaveAt = now + 1500;
  }
  openChat() {
    this.chatOpen = true;
    this.mode = "hover";
    this.leaveAt = null;
  }
  closeChat() {
    this.chatOpen = false;
    this.pinned = false;
  }
  activity(now) {
    if (!this.over) this.leaveAt = now + 1500;
  }
  pin(value) {
    this.pinned = value;
    if (value) this.openChat();
  }
  startDrag() {
    this.mode = "drag";
    this.leaveAt = null;
  }
  drop(now) {
    this.mode = "drop";
    this.dropUntil = now + 500;
    this.leaveAt = now + 2000;
  }
  tick(now) {
    if (this.mode === "drag") return;
    if (this.mode === "drop" && now >= this.dropUntil) this.mode = "hover";
    if (!this.over && this.leaveAt !== null && now >= this.leaveAt) {
      if (!this.pinned) this.chatOpen = false;
      this.mode = this.pinned && this.chatOpen ? "hover" : "peek";
      this.leaveAt = null;
    }
  }
}
/** Stable critically damped spring; caps dt after sleep to avoid explosive motion. */
export function spring(current, target, velocity, dt, frequency = 18) {
  const d = Math.min(dt, 0.05),
    f = 1 + 2 * d * frequency,
    oo = frequency * frequency,
    inv = 1 / (f + d * d * oo);
  return {
    value: (f * current + d * velocity + d * d * oo * target) * inv,
    velocity: (velocity + d * oo * (target - current)) * inv,
  };
}

/** Clock injected by the caller: timers cannot race hover, pin or a drag. */
export function createCharacterState() {
  let inside = false,
    pinned = false,
    dragging = false,
    leaveAt = -Infinity,
    dropAt = -Infinity;
  return {
    hover(value, now) {
      if (inside && !value) leaveAt = now;
      inside = value;
    },
    pin(value, now) {
      if (pinned === value) return;
      pinned = value;
      if (!value && !inside) leaveAt = now;
    },
    drag(value, now) {
      if (dragging === value) return;
      dragging = value;
      if (!value) {
        dropAt = now;
        inside = false;
        leaveAt = now - 1500;
      }
    },
    read(now) {
      return {
        pinned,
        mode: dragging
          ? "drag"
          : now - dropAt < 650
            ? "drop"
            : inside || pinned || now - leaveAt < 1500
              ? "hover"
              : "peek",
      };
    },
  };
}
