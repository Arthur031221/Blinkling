import { faceFor } from "./face.mjs";
const expressions = new Set([
  "idle",
  "thinking",
  "permission",
  "finished",
  "error",
]);
/** Session events are the source of truth. Reconnection never invents a turn. */
export function createActivityState() {
  let expression = "idle",
    connection = "starting",
    talking = false,
    locked = false,
    usageLimit = null,
    finishedAt = -Infinity;
  return {
    accept(event, now) {
      if (event.type === "status") {
        connection = event.state;
        if (event.state === "blocked") {
          expression = "error";
          talking = false;
        }
      }
      if (event.type === "activity" && expressions.has(event.state)) {
        expression = event.state;
        talking = false;
        if (expression === "finished") finishedAt = now;
      }
      if (event.type === "guard" && typeof event.locked === "boolean")
        locked = event.locked;
      if (event.type === "usage-limit") {
        const at = event.resetAt;
        if (at === null) usageLimit = null;
        else if (typeof at === "string" || Number.isFinite(at))
          usageLimit = { resetAt: at };
      }
      // The shell announces a send before the session has echoed it.
      if (event.type === "sending") {
        expression = "thinking";
        talking = false;
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
    /** `watching` (auto explain) lives in the shell, so the caller passes it. */
    read(now, { watching = false } = {}) {
      if (expression === "finished" && now - finishedAt >= 800)
        expression = "idle";
      const { face, detail } = faceFor({
        lock: locked,
        permission: expression === "permission",
        usageLimit: usageLimit ?? false,
        error: expression === "error",
        // Thinking ends when the first words arrive, so talking can show.
        thinking: expression === "thinking" && !talking,
        talking,
        watching,
      });
      return { expression, connection, talking, face, detail };
    },
  };
}
