import { faceFor } from "./face.mjs";
const expressions = new Set([
  "idle",
  "thinking",
  "permission",
  "finished",
  "error",
]);
/** The connection dot is for trouble only (N3.11): never while connected. */
/** How long a failed action keeps Blink looking worried, in ms. */
const FAILED_FOR = 12_000;
const DOT = Object.freeze({ retrying: "retrying", blocked: "blocked" });
/** Session events are the source of truth. Reconnection never invents a turn.
 * `wall` is the epoch clock a usage limit's reset time is compared with. */
export function createActivityState({ wall = Date.now } = {}) {
  let expression = "idle",
    connection = "starting",
    talking = false,
    finishedAt = -Infinity,
    failedAt = -Infinity,
    blocked = false,
    lock = false,
    watching = false,
    resetAt = null;
  let limited = false;
  return {
    accept(event, now) {
      if (event.type === "guard") lock = !!event.lock;
      if (event.type === "watching") watching = !!event.on;
      if (event.type === "usage-limit") {
        // A null reset time ends the limit; a missing one means "until told".
        limited = event.resetAt !== null;
        resetAt = Number.isFinite(event.resetAt) ? event.resetAt : null;
      }
      if (event.type === "sending") {
        expression = "thinking";
        talking = false;
      }
      if (event.type === "status") {
        connection = event.state;
        blocked = event.state === "blocked";
        if (blocked) {
          expression = "error";
          talking = false;
        }
      }
      if (event.type === "activity" && expressions.has(event.state)) {
        expression = event.state;
        talking = false;
        if (expression === "finished") finishedAt = now;
        if (expression === "error") failedAt = now;
      }
      if (event.type === "message" && event.role === "user") {
        expression = "thinking";
        talking = false;
      }
      if (event.type === "delta") {
        expression = "thinking";
        talking = true;
      }
      if (event.type === "done") {
        expression = "finished";
        finishedAt = now;
        talking = false;
      }
    },
    read(now) {
      if (expression === "finished" && now - finishedAt >= 800)
        expression = "idle";
      // A failure that is only a failed action fades; a blocked connection stays.
      if (expression === "error" && !blocked && now - failedAt >= FAILED_FOR)
        expression = "idle";
      const active = limited && !(resetAt !== null && resetAt <= wall());
      if (!active) limited = false;
      const { face, detail } = faceFor({
        lock,
        permission: expression === "permission",
        usageLimit: active ? { resetAt } : false,
        error: expression === "error",
        thinking: expression === "thinking" && !talking,
        talking,
        watching,
      });
      return {
        expression,
        connection,
        talking,
        face,
        detail,
        dot: DOT[connection] ?? null,
      };
    },
  };
}
