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
