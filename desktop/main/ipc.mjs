const types = new Set([
  "state",
  "drag",
  "pin",
  "visibility",
  "click",
  "close-chat",
  "fan-labels-seen",
  "grumble",
]);
export function validCommand(command, bounds) {
  if (command?.type === "drag-end") return Object.keys(command).length === 1;
  if (command?.type === "drag-start") {
    const p = command.anchor;
    return Boolean(
      bounds &&
        p &&
        !Array.isArray(p) &&
        Object.keys(command).length === 2 &&
        Object.keys(p).length === 2 &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= -160 &&
        p.x <= bounds.width + 160 &&
        p.y >= -176 &&
        p.y <= bounds.height + 176,
    );
  }
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
  if (
    command.type === "pin" ||
    command.type === "visibility" ||
    command.type === "grumble"
  )
    return (
      typeof command.value === "boolean" &&
      Object.keys(command).every((k) => ["type", "value"].includes(k))
    );
  if (command.type === "click")
    return (
      typeof command.permission === "boolean" &&
      Object.keys(command).every((k) => ["type", "permission"].includes(k))
    );
  return Object.keys(command).length === 1;
}
export function validRegions(value, bounds) {
  return (
    Array.isArray(value) &&
    value.length <= 4096 &&
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
