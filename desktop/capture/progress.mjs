/** When a capture tells the reader it is working. Choosing a region is the
 * reader's own time and never counts: the clock for "slow" starts at the press
 * for a capture with no selection, and when the choice is made for one with a
 * selection. Whatever was said is taken back the moment the picture is here,
 * before Blink starts to eat. */
export function createProgress({ slow, say, take, timers = globalThis }) {
  let timer = null;
  let spoke = false;
  const stop = () => {
    timers.clearTimeout(timer);
    timer = null;
  };
  const start = () => {
    stop();
    timer = timers.setTimeout(() => {
      if (!spoke) say("working");
      spoke = true;
    }, slow);
  };
  return {
    /** A capture begins. */
    begin() {
      spoke = false;
      start();
    },
    /** The capture moved on: "select" (the reader is choosing), "selected" or
     * "page" (the browser is reading the whole page, which is slow by nature). */
    stage(name) {
      if (name === "select") stop();
      else if (name === "selected") start();
      else if (name === "page") {
        stop();
        spoke = true;
        say("page");
      }
    },
    /** The picture is ready to be eaten. */
    delivered() {
      stop();
      if (spoke) take();
    },
    /** The capture is over, whatever the outcome. */
    end() {
      stop();
    },
    get spoke() {
      return spoke;
    },
  };
}
