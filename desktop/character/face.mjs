/** The one table of Blink's faces (N4). The first matching state wins, so the
 * order of FACES is the priority: a Blink that needs permission never shows
 * the thinking face, and a locked screen beats everything. */
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

/** `usageLimit` is false, true, a reset time, or `{ resetAt }`; the reset time
 * comes back in `detail.resetAt` for the hover hint. */
export function faceFor({
  lock = false,
  permission = false,
  usageLimit = false,
  error = false,
  thinking = false,
  talking = false,
  watching = false,
} = {}) {
  const active = {
    lock,
    permission,
    "usage-limit": usageLimit,
    error,
    thinking,
    talking,
    watching,
  };
  const face = FACES.find((name) => name === "idle" || active[name]);
  const resetAt =
    usageLimit && typeof usageLimit === "object"
      ? usageLimit.resetAt
      : usageLimit === true
        ? undefined
        : usageLimit || undefined;
  return {
    face,
    detail: face === "usage-limit" && resetAt != null ? { resetAt } : {},
  };
}
