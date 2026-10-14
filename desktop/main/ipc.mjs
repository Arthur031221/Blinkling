const types = new Set([
  "state",
  "drag",
  "pin",
  "visibility",
  "close-chat",
  "activity",
]);
export function validCommand(command) {
  if (
    !command ||
    typeof command !== "object" ||
    Array.isArray(command) ||
    !types.has(command.type)
  )
    return false;
  if (command.type === "drag")
    return (
      ["start", "end"].includes(command.phase) &&
      Object.keys(command).every((k) => ["type", "phase"].includes(k))
    );
  if (command.type === "pin" || command.type === "visibility")
    return (
      typeof command.value === "boolean" &&
      Object.keys(command).every((k) => ["type", "value"].includes(k))
    );
  return Object.keys(command).length === 1;
}
export function validRegions(value, bounds) {
  return (
    Array.isArray(value) &&
    value.length <= 8192 &&
    value.every(
      (r) =>
        r &&
        typeof r === "object" &&
        ["x", "y", "width", "height"].every(
          (k) => Number.isFinite(r[k]) && Number.isInteger(r[k]),
        ) &&
        r.x >= 0 &&
        r.y >= 0 &&
        r.width > 0 &&
        r.height > 0 &&
        r.x + r.width <= bounds.width &&
        r.y + r.height <= bounds.height,
    )
  );
}
