/** The one table of Blink's faces (N4). The first state that holds wins. */
export const FACES = Object.freeze([
  "lock",
  "permission",
  "usage-limit",
  "error",
  "thinking",
  "talking",
  "watching",
  "idle",
]);

const resetTime = (limit) => {
  const at = typeof limit === "number" ? limit : limit?.resetAt;
  return Number.isFinite(at) ? at : null;
};

export function faceFor({
  lock,
  permission,
  usageLimit,
  error,
  thinking,
  talking,
  watching,
} = {}) {
  if (lock) return { face: "lock", detail: {} };
  if (permission) return { face: "permission", detail: {} };
  if (usageLimit)
    return { face: "usage-limit", detail: { resetAt: resetTime(usageLimit) } };
  if (error) return { face: "error", detail: {} };
  if (thinking) return { face: "thinking", detail: {} };
  if (talking) return { face: "talking", detail: {} };
  if (watching) return { face: "watching", detail: {} };
  return { face: "idle", detail: {} };
}
