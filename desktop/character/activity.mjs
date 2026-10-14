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
      return { expression, connection, talking };
    },
  };
}
