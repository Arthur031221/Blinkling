/** When Blink thinks out loud. After a quiet minute it picks one of `count`
 * lines at random, never the one it said last, holds it for a few seconds, and
 * waits another minute or so before the next. Anything that keeps Blink busy,
 * or any touch, starts the quiet minute again and takes the line away. */
export function createGrumbler({
  count,
  random = Math.random,
  after = 60_000,
  spread = 30_000,
  hold = 7_000,
} = {}) {
  let quietSince = 0;
  let nextAt = null;
  let shownAt = null;
  let line = null;
  let last = null;
  const pick = () => {
    const choices = [...Array(count).keys()].filter((i) => i !== last);
    return choices[
      Math.min(choices.length - 1, Math.floor(random() * choices.length))
    ];
  };
  return {
    /** The user did something: the quiet starts over. */
    touch(now) {
      quietSince = now;
      nextAt = null;
      shownAt = null;
      line = null;
    },
    /** Call every frame. Returns the index of the line to show, or null. */
    tick(now, busy) {
      if (busy) this.touch(now);
      else if (line !== null) {
        if (now - shownAt >= hold) {
          shownAt = null;
          line = null;
          nextAt = now + after + random() * spread;
        }
      } else if (now >= (nextAt ?? quietSince + after)) {
        line = last = pick();
        shownAt = now;
      }
      return line;
    },
  };
}
